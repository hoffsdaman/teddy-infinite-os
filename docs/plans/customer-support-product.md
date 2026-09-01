# Customer Support Product

*Development plan. Written 2026-09-01. Status: built 2026-09-01 on branch
`support-product` (PRs 1–4 + 6). PR 5 deferred by design. Companion HTML
overview lives in the "Customer Support Product" artifact.*

## Build status (2026-09-01)

Implemented and verified against the live database (board self-seeds, an intake
round-tripped through `POST /api/support` created a correctly-linked ticket,
and move→resolve / email-threading / idempotency / metrics were exercised
directly). Two deliberate deviations from the sketch above, both to work without
a manual migration:

- **The Support board self-seeds** from `lib/support.ts` (`ensureSupportBoard`)
  the first time the code runs, so no seed step is required. The durable SQL
  seed still lives in `docs/db/2026-09-01-customer-support.sql`.
- **Ticket numbers** prefer the `next_support_ticket_no()` sequence RPC when the
  migration is applied and otherwise fall back to a max-scan, so numbering works
  immediately.
- **Support-role containment** runs off the `SUPPORT_ADMINS` env allowlist (the
  same idiom as `ADMIN_ALLOWLIST` / `SENSITIVE_VIEWERS`); the durable
  `admins.role` column is honoured when present. Enforced at the edge in
  `middleware.ts` so it covers RSC loads and server-action POSTs.

Operator steps to reach the full definition of done: deploy the branch; add the
two support agents to `company_os.admins` and list their emails in
`SUPPORT_ADMINS`; set `SUPPORT_EMAIL_WEBHOOK_SECRET` and point Resend inbound at
`/api/webhooks/support-email/`; paste `docs/embeds/teddy-support-form.html` into
the storefront with the app origin filled in. Applying
`docs/db/2026-09-01-customer-support.sql` is optional but recommended.

## Philosophy

The temptation with support is to build a ticketing system — a `support_tickets`
table, a `ticket_events` table, a status enum, a whole parallel universe next to
the one we already run the company on. This feels professional and is wrong for
the same reason the Shopify mirror was wrong: two sources of truth, and none of
our existing machinery works on the new objects.

A support ticket is a task. We already have `tasks`, `boards`, `board_columns`,
`task_comments` (with `author_label` for non-admin authors — built for exactly
this), and `task_stage_log` for history. Every channel — internal form, email,
the Teddy website — is just a different way of inserting a row into `tasks` on
one board. The admin "ticket view" is the board UI that already ships at
`/admin/boards/[slug]`. The entire product is: one seeded board, one metadata
convention, three thin intake paths, and two logins.

**Zero new tables. Resist the urge.**

## Ground truth (read from the repo, 2026-09-01)

- `company_os.tasks` has `board_id`, `board_column_id`, `assignee_id`,
  `priority`, `subject_type`/`subject_id` (polymorphic link → `people` /
  `companies`), and a `metadata` jsonb. Everything a ticket needs.
- `task_comments.author_label` is free text with optional `author_person_id` —
  inbound customer emails become comments without inventing a users concept.
- `task_stage_log` records every column move. Audit history is free.
- Board UI exists: `app/admin/(dashboard)/boards/[slug]/BoardView.tsx`, board
  creation seeds columns in `boards/actions.ts`.
- Admin auth exists: magic-link login gated by `company_os.admins`
  (`lib/admin-auth.ts`). No role/scope column today — an admins row currently
  opens the whole dashboard.
- Resend is already wired (`lib/email.ts`, `app/api/webhooks/resend`). Resend
  also does inbound email → webhook. We do not need the Gmail API.
- Public form → API pattern exists at `app/api/contact/route.ts`.
- The customer-facing site is the TeddyBed Shopify storefront
  (teddybed.com.au); this app is the OS, not the storefront.

## Assumptions (say them out loud)

1. **Daniel and Carla get scoped access, not the full admin.** The admins table
   grows a `role` column; `role = 'support'` sees only `/admin/support`.
   Cheap now, painful to retrofit later. If Dave wants full access instead,
   PR 2 shrinks to two INSERT statements.
2. **The website form goes on the Shopify storefront**, posting cross-origin to
   this app. If it turns out to live elsewhere, only the CORS allowlist
   changes.
3. **Support email is a Google-hosted address.** We use a Gmail/Workspace
   forwarding rule → Resend inbound, not OAuth polling. We just deleted a
   token-refresh cron (QBO); we are not building another one.

## The one design decision: metadata convention

Every channel writes the same shape into `tasks.metadata`:

```json
{
  "channel": "web_form" | "email" | "manual",
  "customer_email": "jane@example.com",
  "customer_name": "Jane Doe",
  "ticket_no": "TD-1042"
}
```

- `ticket_no` is `'TD-' || nextval('support_ticket_no_seq')` — one sequence,
  not a table.
- If `customer_email` matches `people.email` (unique citext — the same join
  key the Shopify sync leans on), also set `subject_type = 'person'`,
  `subject_id = people.id`. The ticket then shows up wherever that person
  does.
- Board columns: **New → In Progress → Waiting on Customer → Resolved**
  (`is_done` on Resolved).

Write intake through one helper — `lib/support.ts: createSupportTicket()` — so
the convention lives in exactly one file. Channels call it; nothing else
touches the shape.

## The PRs

Each PR is independently shippable, verified before the next starts.

### PR 1 — Seed board + support view + manual intake

The usable v1. Everything after this is intake automation.

- Migration doc (`docs/db/`): `support_ticket_no_seq`, seed the Support board
  + 4 columns. Mirror into `supabase/01-schema.sql` (the schema file is the
  source of truth; migrations are history).
- `lib/support.ts`: `createSupportTicket()` — ticket_no, person match, insert.
- `/admin/support`: wraps the existing board machinery, support-flavored —
  customer email on the card, comment thread front and center in the task
  drawer, "New ticket" form (channel `manual`).

**Verify:** create a ticket for an email that exists in `people` and one that
doesn't; drag through all four columns; `task_stage_log` shows the moves;
comment as admin; existing `/admin/boards` untouched.

### PR 2 — Scoped logins for Daniel and Carla

- `admins.role text default 'full'`; `role = 'support'` gates the sidebar and
  every non-support admin route (server-side, in the layout — not just hidden
  links).
- Two admin rows + `board_members` on the Support board.

**Verify:** log in as a support-role admin; `/admin/support` renders;
`/admin/revenue` and `/admin/contacts` redirect; Dave's login unchanged.

### PR 3 — Public endpoint + Teddy site form

- `POST /api/support`: zod-validated `{name, email, subject, message}`, rate
  limit by IP, honeypot field, CORS for teddybed.com.au. Calls the same
  helper. Follows `app/api/contact/route.ts`.
- Small embeddable form (HTML snippet or hosted page) for the Shopify theme.

**Verify:** curl from allowed + disallowed origins; honeypot silently drops;
submission appears in New within seconds.

### PR 4 — Email ingest

- Gmail forwarding rule → Resend inbound → `app/api/webhooks/support-email`.
- Match: reply token (`[TD-1042]` in subject) or open ticket with same
  `customer_email` → append `task_comments` row (`author_label:
  "Customer via email"`); else new ticket, channel `email`.
- Idempotent on Resend message id (store in comment/task metadata; webhooks
  retry, we don't duplicate).

**Verify:** send a fresh email → new ticket with full body; reply to it →
comment on the same ticket, not a new one; replay the webhook → no dupes.

### PR 5 (later, optional) — Reply from the admin

Outbound replies via Resend from the support address, sent from the task
drawer, `[TD-xxxx]` token in the subject so PR 4 threads the response. Carla
never opens Gmail. Deliberately deferred: the first four PRs must prove
themselves in use before we invest here.

### PR 6 (later, optional) — Time-to-resolve metric

A passive reporting metric, not an SLA. Every ticket already carries the
timestamps we need, so this is read-only math over existing columns — **still
zero new tables.**

- **Arrival:** `tasks.created_at`.
- **Resolution:** `tasks.completed_at` (set when the card lands on Resolved —
  wire the Resolved column move to stamp it if not already). Time to resolve =
  `completed_at − created_at`. Null `completed_at` = still open, so an open
  ticket's "age" is `now() − created_at`.
- **Per-stage time (optional):** `task_stage_log.moved_at` between column moves
  gives time spent in each stage (e.g. how long in Waiting on Customer),
  letting us separate our time from the customer's.

Surface, don't alert:

- On each card in `/admin/support`: age for open tickets, resolve time for
  closed ones (`lib/admin/format.ts: timeAgo`/`formatDate` already exist).
- One board-header summary: median time to resolve and count resolved over a
  trailing window (default 30 days), computed in the server component — no new
  endpoint. Median, not mean, so one stale ticket doesn't skew it.

**Verify:** open a ticket, resolve it, confirm the card shows a resolve
duration and the header median moves; an unresolved ticket shows a growing age,
never a resolve time; a ticket dragged back out of Resolved clears its resolve
time.

## What we are not building

No SLA timers or breach alerts (PR 6 measures resolution time but sets no
targets and pages no one), no canned responses, no CSAT surveys, no
auto-assignment, no tagging taxonomy, no customer-facing ticket portal. Every one of these is a
feature request away, and every one is cheap *because* tickets are tasks. The
system that does less, on data you already have, beats the system that does
more on data nobody trusts.

## Definition of done

Carla in the Philippines logs in with a magic link, sees only the Support
board, and works tickets that arrived from the website form and the support
inbox — with the customer's full history one click away because the ticket is
linked to the same `people` row as their Shopify orders. Single source of
truth, zero new tables.
