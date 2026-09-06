-- Routine runs (company_os, kernel-owned). One row per execution of a scheduled
-- routine on any host: a Vercel cron, or a launchd job on the Mac mini. The
-- Settings -> Agents page reads it to show what actually ran, what it did, and
-- what it cost in AI tokens. Append-only; the row is opened when the routine
-- starts and closed when it finishes, so a run that dies mid-way stays visible
-- as "running" with no finished_at. Run once in the project's SQL editor.
-- Grant convention mirrors epics: service_role S/I/U, no DELETE.

create table if not exists company_os.routine_runs (
  id uuid primary key default gen_random_uuid(),
  routine_id text not null,
  host text not null check (host in ('vercel', 'mac-mini')),
  status text not null default 'running' check (status in ('running', 'ok', 'skipped', 'error')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  summary text,
  result jsonb,
  error text,
  log text,
  ai_calls integer not null default 0,
  ai_input_tokens bigint not null default 0,
  ai_output_tokens bigint not null default 0,
  ai_cache_read_tokens bigint not null default 0,
  ai_cache_write_tokens bigint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists routine_runs_routine_started_idx on company_os.routine_runs (routine_id, started_at desc);
create index if not exists routine_runs_started_idx on company_os.routine_runs (started_at desc);

grant select, insert, update on company_os.routine_runs to service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'supabase_read_only_user') then
    grant select on company_os.routine_runs to supabase_read_only_user;
  end if;
end $$;

comment on table company_os.routine_runs is 'one execution of one scheduled routine (a Vercel cron or a Mac mini launchd job) with its outcome, result and AI token usage.';
comment on column company_os.routine_runs.routine_id is 'Stable routine key: the cron path for Vercel routines (e.g. /api/cron/probation-reviews/) or mac-mini:<job> for launchd jobs.';
comment on column company_os.routine_runs.host is 'Where the run executed. Valid values: [vercel, mac-mini]';
comment on column company_os.routine_runs.status is 'Outcome. running until finished_at is set; skipped when the routine returned a skipped reason (missing config, nothing due). Valid values: [running, ok, skipped, error]';
comment on column company_os.routine_runs.started_at is 'When the run began.';
comment on column company_os.routine_runs.finished_at is 'When the run ended; null while running or if the process died.';
comment on column company_os.routine_runs.duration_ms is 'finished_at minus started_at in milliseconds.';
comment on column company_os.routine_runs.summary is 'One human line describing what the run did, derived from its result.';
comment on column company_os.routine_runs.result is 'The JSON body the routine returned (its own counters and notes).';
comment on column company_os.routine_runs.error is 'Error message when status is error.';
comment on column company_os.routine_runs.log is 'Captured log lines for the run, newline separated (Mac mini jobs paste their output here).';
comment on column company_os.routine_runs.ai_calls is 'Number of model calls made during the run.';
comment on column company_os.routine_runs.ai_input_tokens is 'Sum of input tokens across the run''s model calls.';
comment on column company_os.routine_runs.ai_output_tokens is 'Sum of output tokens across the run''s model calls.';
comment on column company_os.routine_runs.ai_cache_read_tokens is 'Sum of prompt-cache read tokens across the run''s model calls.';
comment on column company_os.routine_runs.ai_cache_write_tokens is 'Sum of prompt-cache write tokens across the run''s model calls.';
comment on column company_os.routine_runs.created_at is 'Row insert time.';
