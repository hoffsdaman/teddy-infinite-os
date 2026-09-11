# Company OS — self-setup guide

A Next.js 14 + Supabase + Vercel operations platform: CRM, ATS, client portal,
team portal, coaching, marketing, and Claude-powered assistants.

This file is a **runbook written for an AI coding agent**, not a tutorial. If
you are a person, you can follow it yourself — but the intended use is:

> Paste this repo's URL into Claude Code and say
> *"use the README.md guide, set up everything for me and give me the Vercel
> website link to use"*

It assumes Claude Code has the **GitHub, Supabase, and Vercel** connectors
enabled. If any are missing, stop at Step 0 and say which.

---

## ⚠️ One thing to get right before you start

**Build the database from `supabase/00-prereqs.sql` + `supabase/01-schema.sql`,
never from `supabase/migrations/`.**

That directory is present but **incomplete**: it creates 94 of 136 tables and 7
of 325 row-level-security policies. The rest was applied directly to the
upstream database and never written back as migration files. Running the
migrations produces a database that looks fine and that the app cannot use.

An agent that runs the migrations and reports success has not set this up. If
`01-schema.sql` is absent, stop and say so rather than substituting.

---

## Step 0 — preflight and install

### Connectors

GitHub, Supabase and Vercel must all respond. If any does not, stop and name
it — the operator has to enable it before you can continue.

### Tooling — install what is missing, do not ask first

Check each, install the ones that are absent, and report what you installed at
the end rather than asking up front.

```bash
node --version; npm --version; gh --version; vercel --version; supabase --version
```

| Missing | macOS | Linux (Debian/Ubuntu) |
|---|---|---|
| Node 20+ | `brew install node@20` | `curl -fsSL https://deb.nodesource.com/setup_20.x \| sudo -E bash - && sudo apt-get install -y nodejs` |
| `gh` | `brew install gh` | `sudo apt-get install -y gh` |
| `vercel` | `npm install -g vercel` | same |
| `supabase` | `npm install -g supabase` | same |
| `psql` | `brew install libpq` | `sudo apt-get install -y postgresql-client` |

Two traps worth knowing before you hit them:

- **Homebrew does not put `libpq` on PATH.** After installing, call
  `/opt/homebrew/opt/libpq/bin/psql` by absolute path, or run
  `brew link --force libpq`. A "command not found" here does not mean the
  install failed.
- **Do not run `supabase db dump` or `supabase start`.** Both shell out to
  Docker and fail with *"failed to run docker"* on a machine without Docker
  Desktop. Nothing here needs Docker; `psql` covers it.

### Ask the operator for a project name

Used for the Supabase project, the Vercel project and the forked repo. Ask —
do not invent one.

### What you do NOT need yet

The Anthropic API key. The build and deploy do not require it, and the
operator adds it themselves in [Step 8](#step-8--hand-over-to-the-operator).
Do not ask for it now, and do not ask them to paste it to you at any point.

---

## Step 1 — get the code

Fork or clone to the operator's own GitHub account. Do **not** push to the
repo this file came from.

```bash
gh repo fork <this-repo> --clone --fork-name <project-name>
cd <project-name>
npm install
```

`npm install` must succeed before continuing. If it fails on peer deps, report
the error rather than adding `--force`.

---

## Step 2 — create the Supabase project

Use the Supabase connector (`create_project`). Region: nearest the operator.
Record the **project ref**, **URL**, and keys.

**Generate the database password yourself** — do not ask the operator to invent
one:

```bash
openssl rand -base64 24
```

Use it to create the project, then **tell the operator the value once and tell
them to save it in their password manager now.** They need it for `psql` in
Step 3, and Supabase cannot show it again — a lost password means a reset.

The app expects two schemas: `company_os` (the operations tables) and `htt`
(repo/PR telemetry — optional; the app degrades gracefully without it).

### Connecting with psql

Build the connection from the pieces, rather than a `postgresql://` URL — if
the generated password contains `@`, `:` or `/` a URL string breaks with a
misleading authentication error:

```bash
export PGPASSWORD='<the password you generated>'
psql -h db.<PROJECT_REF>.supabase.co -p 5432 -U postgres -d postgres -c '\dn'
```

Use port **5432**. Port 6543 is the transaction pooler and does not support the
schema work in Step 3. Run `unset PGPASSWORD` when you are finished.

---

## Step 3 — database schema

Two files, **in this order**. Both contain schema only — no rows, no data.

```bash
export PGPASSWORD='<the password from Step 2>'
PSQL="psql -h db.<PROJECT_REF>.supabase.co -p 5432 -U postgres -d postgres"
$PSQL -v ON_ERROR_STOP=1 -f supabase/00-prereqs.sql
$PSQL -v ON_ERROR_STOP=1 -f supabase/01-schema.sql
unset PGPASSWORD
```

`ON_ERROR_STOP=1` matters: without it psql prints errors and keeps going, and
you end up with a half-applied schema that looks like it worked.

Or, with the Supabase connector, apply each file's contents as a migration —
`00-prereqs.sql` first.

The order is not cosmetic. `00-prereqs.sql` creates the schemas, the
extensions (`citext` backs several columns), and the three least-privilege
roles the assistants run as. `01-schema.sql` is a `pg_dump` of
`company_os` + `htt`, and its `GRANT` statements reference those roles by
name — run it first and it errors on every grant.

Apply each **once**. Both are idempotent where Postgres allows it
(`if not exists`), but there is no `if not exists` for policies or
constraints, so a second run of `01-schema.sql` reports errors on those.

> **If `supabase/01-schema.sql` is missing from this repo**, stop and tell the
> operator. Do **not** fall back to `supabase/migrations/` — that directory is
> incomplete (94 of 136 tables, 7 of 325 policies) and produces a database the
> app cannot run against. Do **not** try to reconstruct the schema from
> `information_schema` queries or by reading the application code: custom
> types, 325 policies, foreign keys, grants and three purpose-built Postgres
> roles will not survive that, and a subtly-wrong schema fails at runtime in
> ways that are very hard to diagnose.

### Verify before moving on

Run this against the new project and report the numbers:

```sql
select
  (select count(*) from information_schema.tables
     where table_schema='company_os' and table_type='BASE TABLE') as tables,
  (select count(*) from pg_policies where schemaname='company_os')  as policies,
  (select count(*) from pg_indexes  where schemaname='company_os')  as indexes;
```

Expect roughly **136 tables / 325 policies / 425 indexes**. Materially fewer
means the schema did not apply cleanly — stop and report, do not continue.

---

## Step 4 — environment variables

Set these on the Vercel project (`vercel env add`, or the connector). Names
must match exactly; the app reads them directly.

### Required

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → publishable key |
| `SUPABASE_SECRET_KEY` | Supabase → service-role key. **Server-only.** Never prefix with `NEXT_PUBLIC_` |
| `SUPABASE_URL` | same value as `NEXT_PUBLIC_SUPABASE_URL` |
| `CRON_SECRET` | generate: `openssl rand -hex 32` |
| `CHATBOT_DB_URL` | the admin assistant's read-only database connection. Give the `chatbot_reader` role a password (`alter role chatbot_reader with login password '<generated>'`), then use the **transaction pooler** URL: `postgresql://chatbot_reader.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres`. Without it the assistant answers every question with "database connection isn't available" |
| `ANTHROPIC_API_KEY` | **the operator pastes this themselves — see [Step 8](#step-8--hand-over-to-the-operator)** |

`CRON_SECRET` is **not** optional. Every cron route refuses to run without it
(they fail closed by design). Leave it unset and the scheduled jobs 401.

### Optional — each gates one feature, absence is handled

| Variable | Enables |
|---|---|
| `RESEND_API_KEY` | transactional email; without it, sends are skipped and logged |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | checkout. The webhook returns 503 without the secret, deliberately |
| `IMAGE_MODEL`, `GOOGLE_AI_API_KEY` | marketing image generation |
| `ADMIN_ALLOWLIST` | comma-separated emails granted admin without an `admins` row |
| `SENSITIVE_VIEWERS` | comma-separated emails allowed to see compensation and PII. **Being an admin is deliberately not enough** |
| `CHATBOT_PRIVILEGED_EMAILS` | comma-separated emails allowed database *writes* via the admin assistant. Empty means nobody |

Model selection, all optional, all with sane defaults:
`CHATBOT_MODEL`, `WRITER_CLAUDE_MODEL`, `IDEAS_CLAUDE_MODEL`,
`MEETINGS_CLAUDE_MODEL`, `REVIEW_CLAUDE_MODEL`, `COACHING_CLAUDE_MODEL`,
`ROADMAP_ASSIST_MODEL`.

---

## Step 5 — first admin user

Admin access is two independent gates, both server-side:

1. A Supabase Auth user must exist and be signed in.
2. That email must be in the `company_os.admins` table **or** in
   `ADMIN_ALLOWLIST`.

Create the auth user (Supabase dashboard → Authentication → Add user, or the
connector), then:

```sql
insert into company_os.admins (email, display_name, can_view_sensitive)
values ('<operator-email>', '<Name>', true);
```

`can_view_sensitive` controls compensation and PII visibility. Grant it only
to whoever should genuinely see wages.

---

## Step 6 — deploy

```bash
vercel link
vercel --prod
```

Or use the Vercel connector against the forked repo. Notes that matter:

- **Node.js runtime, not Edge.** Several routes need full Node APIs.
- `maxDuration = 300` on the streaming assistant routes. On Hobby the ceiling
  is lower and long agent turns will be cut off.
- Cron schedules live in `vercel.json` (18 jobs). Vercel registers them on
  deploy; Hobby plans are limited to daily crons, so the hourly and
  every-15-minute jobs need Pro.

### Then point Supabase Auth at the deployed domain

**Do not skip this.** Sign-in works without it, but password reset and the
email one-time-link flows fail with *"requested path is invalid"*, and that
looks like a broken app rather than a missing setting.

The login forms call `resetPasswordForEmail` and `signInWithOtp` with
`redirectTo: ${window.location.origin}/api/auth/callback`, and Supabase only
honours redirect targets on its allow-list.

In the Supabase project → **Authentication → URL Configuration**:

- **Site URL** — the production Vercel URL, e.g. `https://<project>.vercel.app`
- **Redirect URLs** — add both:
  - `https://<project>.vercel.app/api/auth/callback`
  - `https://<project>.vercel.app/**`

Add the custom domain too if the operator sets one up later. Preview
deployments get their own hostnames, so add `https://*-<team>.vercel.app/**` if
they want auth working on previews.

**Report the production URL to the operator when this completes.** That is the
deliverable.

---

## Step 7 — verify the deployment

Do not report success on a green build alone. Check:

1. `GET /` returns 200.
2. `/admin` redirects to `/admin/login` when signed out. If it renders the
   dashboard instead, authentication is misconfigured — **stop and report.**
3. Sign in as the admin user; `/admin` renders.
4. Ask the admin assistant a read-only question ("how many people are in the
   people table?"). A tool-use response confirms the Anthropic key, the
   database roles, and the streaming route together.
5. Check the Vercel runtime logs for `[ai-usage]` lines — that confirms the
   Claude calls are landing and shows token cost per feature.

If 2 fails, treat it as a security problem, not a config annoyance.

---

## Step 8 — hand over to the operator

Two things to do, in this order.

### 1. Give them the URL

Report the production Vercel URL. That is the deliverable they asked for.

### 2. Tell them to add their own Anthropic API key

**You cannot do this for them and should not ask them to paste the key to
you.** An API key is a credential — it belongs in Vercel's encrypted
environment settings, entered by its owner, and nowhere else. Not in chat, not
in a file, not in a commit.

Give them these instructions verbatim:

> Your site is live, but the AI features are switched off until you add your
> own Anthropic API key.
>
> 1. Go to <https://console.anthropic.com> → **API Keys** → **Create Key**.
>    Copy it — it is shown once.
> 2. Open your Vercel project → **Settings** → **Environment Variables**.
> 3. Add:
>    - **Name:** `ANTHROPIC_API_KEY`
>    - **Value:** your key
>    - **Environments:** Production, Preview, Development
> 4. Click **Save**, then go to **Deployments** and **Redeploy** the latest
>    production deployment. Environment variables are read at build and boot,
>    so an existing deployment will not pick the key up on its own.
>
> Until that redeploy finishes, these return errors: the admin and team
> assistants, the client-portal plan assistant, resume screening, meeting and
> review summaries, coaching prep and summaries, and the marketing writers.
> Everything else — the public site, admin, portals, CRM, ATS — works without
> it.
>
> Billing note: the key is charged to your own Anthropic account. Watch the
> `[ai-usage]` lines in your Vercel runtime logs to see token cost per feature.

Then confirm with them that the AI features respond after the redeploy. If
they do not, check the variable name is exactly `ANTHROPIC_API_KEY` and that
the redeploy actually completed.

---

## What you get

| Area | Routes |
|---|---|
| Public site | marketing pages, blog, case studies, careers, checkout |
| Admin | `/admin` — CRM, ATS, boards, revenue, marketing, operations, coaching |
| Team portal | `/team` — profile, time off, equipment, coaching, assistant |
| Client portal | `/portal` — roadmap, backlog, documents, plan assistant |
| Assistants | admin + team chat (tool-use over the database), program-plan, roadmap-assist, publish-editor |

### How the assistants are kept safe

Worth understanding before you extend them: the read-only guarantee is enforced
by **Postgres**, not by prompt instructions. Purpose-built roles
(`chatbot_reader`, `team_chatbot_reader`) hold `SELECT`-only grants with
column-level restrictions and a 5-second statement timeout. The application
layer adds single-statement parsing, a `^(select|with)` check, and blocked-table
patterns on top. Writes require an email in `CHATBOT_PRIVILEGED_EMAILS` **and**
an explicit human approval click.

If you add a tool, keep that shape: the database is the boundary, the prompt is
not.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `/admin` renders while signed out | auth misconfigured — investigate, do not work around |
| Assistant returns 503 | `ANTHROPIC_API_KEY` missing |
| Assistant returns a permission error on every query | schema applied without the `chatbot_reader` role and its grants |
| Assistant says the database connection isn't available | `CHATBOT_DB_URL` unset, or `chatbot_reader` has no login/password |
| Cron routes return 401 | `CRON_SECRET` unset. They fail closed on purpose |
| Emails silently do nothing | `RESEND_API_KEY` unset; sends are skipped and logged |
| Checkout 503 on webhook | `STRIPE_WEBHOOK_SECRET` unset; verification fails closed |
| Truncated JSON / parse errors from AI features | a `max_tokens` cap was hit. `lib/ai/response.ts` names this explicitly in the stored error |
| Table-not-found at runtime | the schema did not fully apply — re-check the Step 3 counts |

---

## Provenance and limits

This repo is a **filtered snapshot**, not a mirror. It is generated from a
private application repo by an allowlist sync that removes client-confidential
and personal material, re-scans the result, and squashes to a single commit.
It carries no upstream history and no branches.

Consequences:

- **It is not a backup** and cannot restore the upstream repo.
- Pull requests here are overwritten by the next sync. Open an issue instead.
- Some migrations are intentionally absent because they carried production
  data. This is part of why Step 3 needs a dump.

## License

See `LICENSE`. The code is provided as-is, with no warranty and no support
commitment.
