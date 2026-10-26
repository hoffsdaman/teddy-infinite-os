-- Log Time — shift logging for admins who track their hours.
-- See public/plans/log-time.html. Additive only.
--
-- Status: REQUIRED before the Log Time UI does anything. Until this is applied
-- the app treats every admin as "does not track time" (the tracks_time read
-- fails closed), so nothing breaks — the pill and pages simply stay hidden.
--
-- Apply in the Supabase SQL editor, or with psql (NOT `supabase db` — that
-- needs Docker):
--   psql "$DATABASE_URL" -f docs/db/2026-10-26-time-log.sql

-- ── Who tracks time, and in which timezone ──────────────────────────────────
-- tracks_time => this admin gets the shift pill, the start prompt and My time.
-- time_zone   => IANA name used to show their times and group days/weeks.
alter table company_os.admins
  add column if not exists tracks_time boolean not null default false;
alter table company_os.admins
  add column if not exists time_zone text not null default 'Asia/Manila';

-- ---------------------------------------------------------------------------
-- time_entries: one row per shift. ended_at null = on shift now. Length and
-- day/week totals are computed, never stored. service_role only — every read
-- and write goes through lib/time-log.ts, which does the authorization.
-- ---------------------------------------------------------------------------
create table if not exists company_os.time_entries (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references company_os.people(id),
  started_at timestamptz not null,
  ended_at timestamptz,
  note text,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_entries_end_after_start check (ended_at is null or ended_at > started_at)
);

-- One open shift per person, so two tabs can't both clock in.
create unique index if not exists time_entries_one_open_per_person
  on company_os.time_entries (person_id) where ended_at is null;
create index if not exists time_entries_person_started_idx
  on company_os.time_entries (person_id, started_at desc);

create trigger set_time_entries_updated_at
  before update on company_os.time_entries
  for each row execute function company_os.handle_updated_at();

alter table company_os.time_entries enable row level security;
grant select, insert, update, delete on company_os.time_entries to service_role;

-- ---------------------------------------------------------------------------
-- time_entry_edits: one row per after-the-fact change to a shift's times, with
-- the reason. Append-only history; super admins see it in Team time.
-- ---------------------------------------------------------------------------
create table if not exists company_os.time_entry_edits (
  id uuid primary key default gen_random_uuid(),
  time_entry_id uuid not null references company_os.time_entries(id) on delete cascade,
  edited_by_email text not null,
  old_started_at timestamptz not null,
  old_ended_at timestamptz,
  new_started_at timestamptz not null,
  new_ended_at timestamptz,
  reason text not null check (length(btrim(reason)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists time_entry_edits_entry_idx
  on company_os.time_entry_edits (time_entry_id, created_at);

alter table company_os.time_entry_edits enable row level security;
grant select, insert on company_os.time_entry_edits to service_role;

-- Turn it on for someone (example):
--   update company_os.admins set tracks_time = true, time_zone = 'Asia/Manila'
--   where lower(email) = '<their email>';
