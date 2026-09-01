# Shopify native sync — operator runbook

The code for all five stages is merged to `main` (PRs #1–5). This runbook is
the part that needs credentials only you hold — the database password and a
Shopify Admin API token — so it cannot be automated from a build agent. Work
top to bottom. Plan: [shopify-native-sync.md](shopify-native-sync.md).

## What's already done (in code, on `main`)

- **Stage 0** — QuickBooks integration removed; work-acceptance billing now
  flags `manual_required` + emails the accountant instead of auto-invoicing.
- **Stage 1** — migration written: `docs/db/2026-09-01-shopify-native-sync.sql`;
  `supabase/01-schema.sql` mirrored.
- **Stage 2** — sync engine `lib/shopify-sync.ts` + client `lib/shopify.ts` +
  `scripts/shopify/backfill.ts`.
- **Stage 3** — daily cron `app/api/cron/shopify-sync/route.ts`, wired in
  `vercel.json` (16:00 UTC / 02:00 AEST).
- **Stage 4** — `customer` persona + Shopify orders surfaced in the admin UI.

The GraphQL queries were validated against the live TeddyBed store; the code
type-checks and builds. Nothing has touched the database or Shopify yet.

## Step 1 — Apply the schema migration

`supabase-js`/PostgREST cannot run DDL, so apply the SQL directly as the
`postgres` role. Two ways:

**A. Supabase SQL editor (easiest).** Open the project's SQL editor, paste the
contents of `docs/db/2026-09-01-shopify-native-sync.sql`, run it. It is wrapped
in a transaction and is safe to re-run (idempotent guards throughout).

**B. psql.** With the database password (the one generated at project setup and
saved in your password manager — it is not recoverable):

```bash
/opt/homebrew/opt/libpq/bin/psql "postgresql://postgres:[DB_PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" -f docs/db/2026-09-01-shopify-native-sync.sql
```

Verify it took:

```sql
select column_name from information_schema.columns
  where table_schema='company_os' and table_name='people' and column_name='shopify_customer_id';
select to_regclass('company_os.product_variants'), to_regclass('company_os.order_lines');
select to_regclass('company_os.qbo_connection');  -- should be null (dropped)
```

## Step 2 — Create the Shopify custom app + token

In the Shopify admin (teddybed.com.au): **Settings → Apps and sales channels →
Develop apps → Create an app**. Name it e.g. "Company OS sync".

- **Configuration → Admin API integration → Configure**: grant read scopes
  `read_products`, `read_orders`, `read_customers`. Save.
- **API credentials → Install app**. Copy the **Admin API access token**
  (shown once — it starts `shpat_`). This token does not expire.
- Note the shop's `*.myshopify.com` domain (Settings → Domains).

## Step 3 — Set the environment variables in Vercel

Add to the Vercel project (Production, and Preview if you want it there too):

| Var | Value |
|---|---|
| `SHOPIFY_SHOP` | the `*.myshopify.com` domain (e.g. `teddybed.myshopify.com`) |
| `SHOPIFY_ADMIN_TOKEN` | the `shpat_…` token from Step 2 |

`CRON_SECRET` already exists (the cron uses it). Redeploy so the running app
sees the new vars. Until they are set, the cron is a safe no-op
(`{ ok:false, skipped:"Shopify not configured" }`).

Optional but recommended for correct USD reporting: add an AUD row to
`company_os.fx_rates` (else `amount_usd_cents` equals the AUD cents, because the
`set_amount_usd_cents` trigger falls back to a rate of 1):

```sql
insert into company_os.fx_rates (currency, rate_to_usd) values ('aud', 0.66)
  on conflict (currency) do update set rate_to_usd = excluded.rate_to_usd;
```

## Step 4 — Run the backfill

Either mechanism (both use the same idempotent engine):

**A. Local script** — put `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SHOPIFY_SHOP`,
`SHOPIFY_ADMIN_TOKEN` in `.env.local` (do NOT commit — it's gitignored), then:

```bash
npx tsx scripts/shopify/backfill.ts
```

This runs longer than a serverless request, so it's the safest way to load the
initial ~6.1k customers / ~3.3k orders in one pass. It prints a per-entity
`fetched`/`written` summary.

**B. Endpoint** — after the redeploy, call the cron with the backfill flag:

```bash
curl -X POST "https://[YOUR_DOMAIN]/api/cron/shopify-sync?full=1" \
  -H "authorization: Bearer $CRON_SECRET"
```

If a run is interrupted, just run it again — upserts make re-processing a
no-op, and the high-water mark only advances on success.

## Step 5 — Verify against the Definition of Done

Run these against the DB (see the full DoD in the plan). Targets are the live
store counts as of 2026-09-01:

```sql
-- Counts (expect ≈ store totals)
select count(*) from company_os.people   where source='shopify';            -- ~6151
select count(*) from company_os.orders   where shopify_order_id is not null; -- ~3336
select count(*) from company_os.product_variants;                            -- all variants

-- Every Shopify order has at least one line
select count(*) from company_os.orders o
  where o.shopify_order_id is not null
    and not exists (select 1 from company_os.order_lines l where l.order_id=o.id);  -- expect 0

-- Line totals reconcile to order amount (allow for tax/shipping/rounding)
select o.order_number, o.amount_cents,
       (select coalesce(sum(l.total_amount_cents),0) from company_os.order_lines l where l.order_id=o.id) as lines_total
  from company_os.orders o
  where o.shopify_order_id is not null
  order by random() limit 5;   -- eyeball 5, then spot-check against the Shopify admin

-- Consent distribution matches Shopify's subscribed count
select marketing_consent, count(*) from company_os.people
  where source='shopify' group by 1;

-- Idempotency: run the backfill a SECOND time, then confirm no row churn
-- (updated_at only moves on genuine changes).
```

Then walk the admin UI: a synced customer opens in the contacts detail view;
`/admin/revenue/orders` filtered to method **Shopify** shows orders with the
order number in the Product column; interactions/tags attach to a Shopify
person normally.

## Step 6 — Let the cron take over

Once the backfill reconciles, nothing else is needed: the daily cron runs the
incremental sync at 02:00 AEST. To watch it, `company_os.shopify_sync_state`
holds the per-entity `last_sync`, `last_run_at`, and `last_status`.

## Notes / decisions carried in

- **Consent** syncs as-is from Shopify (your decision). Shopify store-email
  consent and campaign consent are different audiences under AU spam law —
  target/exclude `persona='customer'` deliberately in `email_campaigns`. The
  broadcast blocklist (`lib/admin/broadcasts.ts`) currently blocks only
  `job_seeker`, so customers are addressable; add `customer` there if you want
  them excluded by default.
- **QuickBooks** is still your accounting tool — only the API integration was
  removed. Remove the now-unused `QBO_*` env vars from Vercel at your leisure.
- After applying the migration, regenerate `supabase/01-schema.sql` from the
  live DB via `pg_dump` so the canonical file matches byte-for-byte; the
  hand-mirrored edits are correct but pg_dump is the source of truth.
