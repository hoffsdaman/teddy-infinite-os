-- Contacts re-organised around Shopify (2026-09-11). Applied to the live
-- project via Supabase MCP migration `contacts_shopify_reorg`; mirrored in
-- supabase/01-schema.sql. Idempotent.
--
-- 1. persona gains 'subscriber': a Shopify customer record with no orders
--    (mailing-list signups). The sync sets it from Shopify's numberOfOrders.
-- 2. people_with_deals gains order_total_aud_cents / order_count so the
--    contacts list can show what each person has actually spent.

begin;

alter table company_os.people drop constraint if exists people_persona_check;
alter table company_os.people add constraint people_persona_check
  check (persona is null or persona = any (array['vendor','prospect','client','job_seeker','employee','student','customer','subscriber']));

drop view if exists company_os.people_with_deals;
create view company_os.people_with_deals as
select
  p.*,
  case
    when coalesce(o.order_count, 0) > 0 or coalesce(d.won_count, 0) > 0 then 'customer'
    when l.person_id is not null then 'lead'
    else 'none'
  end as lifecycle_stage,
  l.status as lead_status,
  l.disqualified_reason,
  coalesce(d.deal_value_aud_cents, 0) as deal_value_aud_cents,
  coalesce(d.deal_count, 0) as deal_count,
  coalesce(o.order_total_aud_cents, 0) as order_total_aud_cents,
  coalesce(o.order_count, 0) as order_count
from company_os.people p
left join company_os.lead l on l.person_id = p.id
left join (
  select person_id,
         sum(amount_aud_cents) filter (where status in ('open', 'won')) as deal_value_aud_cents,
         count(*) as deal_count,
         count(*) filter (where status = 'won') as won_count
  from company_os.deals
  where person_id is not null and archived_at is null
  group by person_id
) d on d.person_id = p.id
left join (
  -- What the person has actually paid: paid + partially refunded orders, net
  -- of refunds. Failed and fully refunded orders count for nothing.
  select person_id,
         sum(coalesce(amount_aud_cents, 0) - coalesce(refunded_cents, 0)) filter (where status in ('paid', 'partial_refund')) as order_total_aud_cents,
         count(*) filter (where status in ('paid', 'partial_refund')) as order_count
  from company_os.orders
  where person_id is not null
  group by person_id
) o on o.person_id = p.id;
grant select on company_os.people_with_deals to service_role;
grant select on company_os.people_with_deals to chatbot_reader;
grant select, insert, update on company_os.people_with_deals to chatbot_writer;

commit;

-- ── Follow-up, same day: potential-spam bucket ──────────────────────────────
-- Applied via Supabase MCP migration `contacts_spam_bucket`.
-- people.shopify_created_at (from Shopify customers.createdAt) and a
-- contact_bucket column on the view: customer / subscriber / potential_spam.
-- potential_spam = no orders, no name, and created on a day with 100+
-- nameless signups (a bot burst). An earlier version also flagged
-- name+digits email addresses; that caught real subscribers and was
-- removed the same day (migration `contacts_spam_bucket_burst_only`).
-- added_at = coalesce(shopify_created_at, created_at): when the person
-- actually joined, not when the sync imported them (migration
-- `contacts_added_at`).
-- See supabase/01-schema.sql for the full view definition.
