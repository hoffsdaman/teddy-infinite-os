# Shopify → Company OS: native sync

*Development plan. Written 2026-09-01. Status: all five stages built and merged
to `main` (PRs #1–5). Remaining work is credentialed execution — apply the
migration, add the Shopify token, run the backfill, verify the DoD — captured in
[shopify-native-sync-runbook.md](shopify-native-sync-runbook.md).*

## Philosophy

The temptation with any integration is to build a mirror — a `shopify` schema
full of `shopify_orders`, `shopify_customers`, faithfully replicating someone
else's data model inside yours. This feels safe and is almost always wrong. You
end up with two sources of truth, a translation layer nobody maintains, and
none of your existing features work on the new data.

We are doing the opposite. Shopify customers become `people`. Shopify orders
become `orders`. Shopify products become `products`. Every existing feature —
interactions, tags, email campaigns, dashboards — works on TeddyBed data on
day one, for free, because it's the same objects. Where Shopify has a concept
we lack (variants, multi-line orders), we extend our model minimally, in a way
that is generically useful, not Shopify-shaped.

The whole thing is: 2 new tables, ~6 new columns, 2 relaxed check constraints,
one cron. Resist the urge to add more.

## Ground truth (measured 2026-09-01)

Store: TeddyBed AU (teddybed.com.au), AUD, single location (NSW warehouse).

| Entity | Count | Notes |
|---|---|---|
| Customers | 6,151 | 100% have emails. Zero guest orders. |
| Orders | 3,336 | Multi-line, e.g. `TED184336`. Every order has a customer. |
| Products | 59 | Variants carry the SKUs (e.g. `DEN107BRN`) and prices. |
| Collections | 16 | Not synced in v1. |

Database: `company_os` schema, Supabase Postgres. `people.email` is UNIQUE
citext — this is our natural join key and the reason the native approach is
cheap. The company OS is clean: no customers in it yet, so backfill has no
merge problem.

Decisions already made (with the operator, 2026-09-01):

1. Add `customer` to the `people.persona` check. `client` is reserved as a
   future B2B marker.
2. Variants get a child table (`product_variants`), not flattened rows.
3. QBO integration is removed — it is unused in this company.
4. Marketing consent syncs as-is from Shopify (subscribed stays subscribed).

## Data model changes

All migrations go in `supabase/` following the existing style. Keep DDL
boring.

### `people` (extend)

```sql
ALTER TABLE company_os.people ADD COLUMN shopify_customer_id text UNIQUE;
-- persona check: add 'customer' to the allowed list
```

Column mapping from Shopify Customer:

| Shopify | people |
|---|---|
| `email` | `email` (upsert key) |
| `id` (GID) | `shopify_customer_id` (survives email changes; secondary upsert key) |
| `firstName` / `lastName` | `first_name` / `last_name` (+ `full_name`) |
| `phone` / `defaultAddress.phone` | `phone` |
| `defaultAddress` city/province/country | `city` / `state_province` / `country` |
| `emailMarketingConsent.marketingState` | `marketing_consent`: SUBSCRIBED→`subscribed`, UNSUBSCRIBED→`unsubscribed`, NOT_SUBSCRIBED→`never_asked` |
| `emailMarketingConsent.consentUpdatedAt` | `marketing_consent_at` |
| — | `marketing_consent_source = 'shopify'`, `source = 'shopify'`, `persona = 'customer'` |

Anything that doesn't map (tags, note, addresses beyond default) goes in
`metadata.shopify` jsonb. Do not add columns for it.

Sync rule: on conflict, Shopify wins for the fields it owns (name, phone,
address, consent) but never overwrites a non-null field with null, and never
touches fields it doesn't own (owner_id, notes, persona once set).

### `products` (extend) + `product_variants` (new)

```sql
-- products type check: add 'physical'
ALTER TABLE company_os.products ADD COLUMN shopify_product_id text UNIQUE;

CREATE TABLE company_os.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES company_os.products(id) ON DELETE CASCADE,
  shopify_variant_id text UNIQUE,
  sku text,
  title text,
  amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'aud',
  inventory_quantity integer,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

`products` stays 1:1 with what you see in Shopify admin. `products.amount_cents`
holds the min variant price for display; the variant is the sellable unit.

### `orders` (extend) + `order_lines` (new)

```sql
-- payment_method check: add 'shopify'
ALTER TABLE company_os.orders
  ADD COLUMN shopify_order_id text UNIQUE,
  ADD COLUMN order_number text,
  ADD COLUMN fulfillment_status text,
  ADD COLUMN shipping_cents bigint;

CREATE TABLE company_os.order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES company_os.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES company_os.products(id),
  variant_id uuid REFERENCES company_os.product_variants(id),
  shopify_line_id text UNIQUE,
  title text NOT NULL,
  sku text,
  quantity integer NOT NULL DEFAULT 1,
  unit_amount_cents bigint NOT NULL DEFAULT 0,
  total_amount_cents bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Status mapping: Shopify financial status PAID→`paid`,
REFUNDED→`refunded`, PARTIALLY_REFUNDED→`partial_refund`, PENDING→`pending`.
`fulfillment_status` stores Shopify's display value lowercased
(`unfulfilled`/`partially_fulfilled`/`fulfilled`). Refund totals go to the
existing `refunded_cents`. Currency is `aud`; populate `amount_usd_cents` via
the existing `fx_rates` table, same as everything else.

`orders.product_id` stays as-is for legacy Stripe orders and is NULL for
Shopify orders — lines live in `order_lines`. (Migrating Stripe orders to
`order_lines` is possible later; explicitly out of scope now.)

## Sync design

One cron, pull-based, incremental. No webhooks in v1 — a daily poll is one
route you can read top to bottom; webhooks are queues, retries, and HMAC
verification for freshness nobody asked for.

- **Auth**: custom app in Shopify admin (Settings → Apps → Develop apps),
  scopes `read_products, read_orders, read_customers`. The Admin API token
  does not expire → single env var `SHOPIFY_ADMIN_TOKEN` (+ `SHOPIFY_SHOP`).
  No OAuth machinery, no token table. This is why QBO needed 400 lines of
  refresh plumbing and this needs zero.
- **Route**: `app/api/cron/shopify-sync/route.ts`, protected by `CRON_SECRET`,
  scheduled daily in `vercel.json`. Also invocable manually.
- **Logic** (`lib/shopify-sync.ts`): for each of customers, products, orders —
  GraphQL query filtered `updated_at:>{last_sync}`, cursor-paginated (250/page),
  upsert by `shopify_*_id`. Order of operations: customers → products/variants
  → orders/lines, so FKs always resolve. Store `last_sync` high-water mark per
  entity (a small `shopify_sync_state` row, or reuse `integration_sources` +
  metadata — keep it to one row, not a framework). Overlap the window by a few
  minutes; upserts make re-processing free. Idempotency is the whole design:
  running the sync twice must be a no-op.
- **Backfill** is not a special program. It's the same sync with
  `last_sync = epoch`. ~40 paginated calls, minutes of runtime, run once
  manually. If it dies halfway, run it again (see: idempotent).
- Register `shopify` in `integration_sources` for consistency with the
  existing pattern.

## QBO removal

**Correction (2026-09-01, after reading the code):** QBO was *not* just an
unused invoice mirror. `lib/qbo.ts`'s `createQboInvoice`/`sendQboInvoice` are
wired into live billing: when a client accepts work in the portal,
`lib/work-requests.ts` → `runWorkRequestBilling` (`lib/admin/work-billing.ts`)
auto-creates and emails a QuickBooks invoice. Operator decision: **remove all
QBO integration code and rewire work-acceptance to the manual fallback** — it
already degrades to `billing_status = manual_required` + an accountant email
with hours/rate/amount, so a human invoices in QuickBooks by hand. The company
still uses QuickBooks manually; we are removing the *API integration*, not the
tool. QuickBooks references in legal/workflow/marketing pages stay (they
describe real manual process); only automated-sync artifacts are removed.

Scope (verified by grep + import tracing):

**Delete outright** (automated-integration machinery):
- `lib/qbo.ts`, `lib/admin/qbo-invoice-sync.ts`.
- Crons: `qbo-refresh`, `qbo-invoice-sync` entries in `vercel.json` + their
  routes under `app/api/cron/`.
- OAuth routes: `app/api/qbo/connect`, `app/api/qbo/callback`.
- Connect UI: `app/admin/(dashboard)/settings/quickbooks/page.tsx`.
- Sync affordance: `app/admin/(dashboard)/revenue/invoices/SyncButton.tsx` +
  `sync-action.ts`.
- Dead mapping code (no callers): `getQboCustomerIds` in `lib/admin/invoices.ts`,
  `app/admin/(dashboard)/revenue/companies/invoice-actions.ts`
  (`updateQboCustomerIds`).
- Workflow doc for the removed sync: `app/workflows/invoice-sync/page.tsx` +
  its entry in `lib/workflowsData.ts`.
- Cron agent registrations in `lib/admin/agent-management.ts` (both qbo crons +
  the local `quickbooks-invoice-sync` skill entry).

**Rewire** (keep, edit to drop QBO):
- `lib/admin/work-billing.ts`: remove `createQboInvoice`/`sendQboInvoice`;
  `runBilling` computes hours/rate/amount then always `flagManual` with reason
  "QuickBooks billing removed — invoice this client manually." Trim the now-dead
  `invoiced` variant of `BillingOutcome`. Acceptance still never blocks.
- `app/admin/(dashboard)/revenue/invoices/page.tsx`: drop the `SyncButton`
  action and the "synced weekly" language.

**Keep** (accurate / still useful):
- The `invoices` and `expenses` tables and all their data — no drops.
- Invoice display pages (`page.tsx`, `InvoicesShelf.tsx`, `invoice-shared.ts`
  incl. `qboInvoiceUrl` deep-link), `lib/admin/invoices.ts` (reads),
  `lib/portal/invoices.ts`, team/portal invoice pages — render existing rows.
- QuickBooks mentions in `app/legal/privacy`, `app/workflows/monthly-*`,
  `client-work-requests`, and chat-schema descriptions — the business still
  uses QuickBooks manually, so these stay true.

**DB**: drop `company_os.qbo_connection` (the OAuth token store) only.

**Env vars**: `QBO_*` become unused; remove from Vercel after the code is gone.

## Stages

Each stage ships independently and is verified before the next starts.

**Stage 0 — QBO removal.** Pure deletion, no schema additions. Verify: build
green, `/admin/revenue` pages render, grep for `qbo` returns nothing in
app/lib, crons gone from `vercel.json`.

**Stage 1 — Migration.** New tables/columns/constraint changes as one
migration applied via psql (per repo rules: never via `supabase/migrations/`
tooling). Update `supabase/01-schema.sql` to match. Verify: existing app
untouched (all changes are additive), constraint checks accept
`persona='customer'`, `type='physical'`, `payment_method='shopify'`.

**Stage 2 — Sync lib + backfill.** `lib/shopify-sync.ts` + a
`scripts/shopify-backfill.ts` entry point. Run backfill against production.
Verify with SQL: `people` count from shopify = 6,151; `orders` = 3,336; sum of
`order_lines.total_amount_cents` per order equals order totals; spot-check 5
orders against Shopify admin; marketing consent distribution matches Shopify's
subscribed count.

**Stage 3 — Cron.** Route + `vercel.json` entry (daily, off-peak AEST).
Verify: place/edit a test order in Shopify, run cron manually, confirm the
delta lands and that a second run changes zero rows.

**Stage 4 — Surface it.** Nothing new to build if stages 1–3 are right:
customers appear in existing people views, revenue in existing order queries.
Walk the admin UI and fix whatever assumed `orders.product_id` is non-null or
`persona != 'customer'`. This stage is a punch list, not a feature.

## Definition of Done

The integration is done — not "code merged", but *done* — when every one of
these is true and has been checked, not assumed. A green build proves nothing
here; the SQL and the spot-checks do.

### Data correctness (the part that matters)

- [ ] `SELECT count(*) FROM company_os.people WHERE source = 'shopify'` = **6,151**
      (matches the store's customer count exactly; drift means a dropped page).
- [ ] `SELECT count(*) FROM company_os.orders WHERE shopify_order_id IS NOT NULL`
      = **3,336**.
- [ ] Every Shopify order has ≥1 `order_lines` row; no order has a NULL
      `shopify_order_id` alongside a non-NULL legacy `product_id` (the two
      order kinds never mix).
- [ ] For each Shopify order, `sum(order_lines.total_amount_cents)` plus
      shipping/tax reconciles to the order total. Verified in aggregate (one
      SQL query, zero mismatches) **and** by hand on 5 random orders against
      the Shopify admin UI.
- [ ] `product_variants` count matches Shopify's total variant count; every
      `order_lines.sku` that exists in Shopify resolves to a `variant_id`.
- [ ] Marketing-consent distribution in `people` (`subscribed` /
      `unsubscribed` / `never_asked`) matches Shopify's counts for the same
      states. `marketing_consent_source = 'shopify'` on every synced row.
- [ ] No `people` row was created with a NULL email or a synthetic/placeholder
      email (the NOT NULL + UNIQUE constraints held; nothing was worked around
      to satisfy them).

### Idempotency (the part that lets you sleep)

- [ ] Running the full sync a second time immediately after the first changes
      **zero rows** (verified via `updated_at` timestamps or a row-diff).
- [ ] Running the backfill from `last_sync = epoch` a second time is likewise
      a no-op — no duplicate people, orders, or lines.
- [ ] A mid-run failure followed by a re-run converges to the same state (kill
      the backfill halfway once, on purpose, and confirm).

### Incremental sync

- [ ] A new order placed in Shopify appears in the OS after one manual cron
      run, with correct lines and the buyer as a `people` row.
- [ ] An edited existing order (e.g. a refund) updates in place — `status`,
      `refunded_cents`, and lines reflect the change; no duplicate row.
- [ ] A customer who changes their email in Shopify updates the **same**
      `people` row (matched on `shopify_customer_id`, not email).
- [ ] The `last_sync` high-water mark advances after each run and is the basis
      for the next window.

### Existing features work on the new data (the whole point)

- [ ] A synced customer opens in the existing people detail view without error.
- [ ] The existing order/revenue queries and admin views render Shopify orders
      — nothing assumed `orders.product_id` is non-null or
      `persona != 'customer'`. Every such assumption found in Stage 4 is fixed.
- [ ] An `interaction` and a `tag` can be attached to a Shopify person through
      the normal UI.

### QBO removal

- [ ] No QBO *integration code* remains: `lib/qbo.ts`, `lib/admin/qbo-invoice-sync.ts`,
      `app/api/qbo/*`, and both `app/api/cron/qbo-*` routes are deleted.
      (`grep -rn "@/lib/qbo" app lib` returns nothing.)
- [ ] No `qbo-*` entries remain in `vercel.json`; `npm run check:crons` passes.
- [ ] Work-acceptance billing takes the manual path: `runWorkRequestBilling`
      sets `billing_status = manual_required` and emails the accountant with
      hours/rate/amount; it never calls a QuickBooks API. Acceptance still
      succeeds when billing degrades.
- [ ] `company_os.qbo_connection` is dropped; `invoices` and `expenses` tables
      and their data are intact and their pages still render.
- [ ] Remaining `quickbooks`/`qbo` references are only documentation, legal
      copy, chat-schema descriptions, or the `qboInvoiceUrl` deep-link — no
      code path calls the QuickBooks API. (The business still uses QuickBooks
      manually; the *tool* is not being scrubbed, the *integration* is.)
- [ ] Build is green and the full app boots with no QBO env vars set.

### Operational

- [ ] `shopify` row exists in `integration_sources`.
- [ ] Sync runs on the daily Vercel cron, protected by `CRON_SECRET`, and is
      also manually invocable.
- [ ] Auth is a single non-expiring `SHOPIFY_ADMIN_TOKEN` env var — no token
      table, no refresh job.
- [ ] `supabase/01-schema.sql` reflects the final schema (new tables, columns,
      relaxed checks); migration was applied via psql per repo rules, never via
      the `supabase/migrations/` tooling.

### Explicitly NOT required for done

Collections, inventory sync, discounts, fulfillment detail beyond a status
string, webhooks, Stripe-order migration to `order_lines`, and ShopifyQL
analytics. Shipping any of these is scope creep against this DoD, not progress
toward it.

## Risks / non-goals

- **The 6,151-person injection**: existing people views and email tooling now
  see retail customers. Consent syncs as-is (decision #4), and Shopify consent
  vs. campaign consent are different audiences under AU spam law — tag or
  filter `persona='customer'` in campaign sends deliberately. Flagging once,
  here, so it's a choice and not a surprise.
- **Field ownership**: the moment two systems write the same field, you get
  sync fights. Shopify owns contact/consent fields for `source='shopify'`
  people; the OS owns everything else. Encode this in the upsert, not in
  convention.
- **Non-goals for v1**: collections, inventory sync, discounts, fulfillment
  detail beyond status, webhooks, Stripe-order migration to `order_lines`,
  ShopifyQL analytics. Each is a bolt-on later if actually needed. Most won't
  be.
