-- Customer Support product — durable schema for the "tickets are tasks" design.
-- See docs/plans/customer-support-product.md. Additive only; zero new tables.
--
-- Status: OPTIONAL. The application self-provisions everything it needs at
-- runtime via the service-role client (lib/support.ts seeds the Support board +
-- columns; ticket numbers fall back to a max-scan; support-role containment
-- runs off the SUPPORT_ADMINS env allowlist). Apply this file to move to the
-- durable forms: a real Postgres sequence for gap-free ticket numbers, and an
-- admins.role column so support agents are marked in the database rather than in
-- an env var. The app prefers these automatically once present.
--
-- Apply with psql (NOT `supabase db` — that needs Docker):
--   psql "$DATABASE_URL" -f docs/db/2026-09-01-customer-support.sql

-- ── Ticket numbers ───────────────────────────────────────────────────────────
-- One sequence, not a table. lib/support.ts calls next_support_ticket_no() and
-- uses whatever it returns; without this it falls back to MAX(ticket_no)+1.
create sequence if not exists company_os.support_ticket_no_seq start 1001;

create or replace function company_os.next_support_ticket_no()
returns text
language sql
security definer
set search_path = company_os
as $$
  select 'TD-' || nextval('company_os.support_ticket_no_seq')::text;
$$;

grant usage on sequence company_os.support_ticket_no_seq to service_role;
grant execute on function company_os.next_support_ticket_no() to service_role;

-- ── Support-agent role ───────────────────────────────────────────────────────
-- 'full'   => a normal admin (sees the whole console).
-- 'support'=> contained to /admin/support (middleware.ts enforces containment;
--             lib/admin-auth.ts isSupportOnlyAdmin() reads this column, and the
--             SUPPORT_ADMINS env allowlist is the break-glass equivalent).
alter table company_os.admins
  add column if not exists role text not null default 'full';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'admins_role_check'
  ) then
    alter table company_os.admins
      add constraint admins_role_check check (role in ('full', 'support'));
  end if;
end $$;

-- Example (fill in the real addresses to grant support-only access without the
-- env var):
--   update company_os.admins set role = 'support' where lower(email) = 'carla@…';

-- ── Support board seed ───────────────────────────────────────────────────────
-- Data, not schema — lib/support.ts.ensureSupportBoard() creates these on first
-- use, so this block is only for operators who prefer to pre-seed. Idempotent.
insert into company_os.boards (name, slug, sort_order)
select 'Support', 'support', coalesce((select max(sort_order) from company_os.boards), 0) + 1
where not exists (select 1 from company_os.boards where slug = 'support');

insert into company_os.board_columns (board_id, name, position, is_done)
select b.id, c.name, c.position, c.is_done
from company_os.boards b
cross join (values
  ('New', 0, false),
  ('In Progress', 1, false),
  ('Waiting on Customer', 2, false),
  ('Resolved', 3, true)
) as c(name, position, is_done)
where b.slug = 'support'
  and not exists (select 1 from company_os.board_columns bc where bc.board_id = b.id);
