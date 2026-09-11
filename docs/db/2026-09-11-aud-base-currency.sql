-- AUD becomes the system's base (reporting) currency. Written 2026-09-11.
-- Canonical schema lives in supabase/01-schema.sql (mirrored there); this file
-- is the migration to run ONCE against the live project, in the SQL editor as
-- postgres, in the same release as the matching code change (the app selects
-- the new column names, so run this and deploy together).
--
-- What changes:
--   * fx_rates.rate_to_usd  -> rate_to_aud   (rescaled so aud = 1)
--   * amount_usd_cents      -> amount_aud_cents        (orders, products, bookings, deals)
--   * estimated/actual_usd_cents -> *_aud_cents        (event_pnl_lines)
--   * gross/net/commission_usd_cents -> *_aud_cents    (affiliate_commissions)
--   * set_amount_usd_cents() trigger fn -> set_amount_aud_cents() (reads rate_to_aud)
--   * views people_with_deals / public_retreats re-created with *_aud_cents output columns
--   * currency column defaults on orders/products/bookings/deals: 'usd' -> 'aud'
--   * salary_usd_cents -> salary_aud_cents, equipment.cost_usd -> cost_aud, and
--     'aud' defaults on every other money table (section 6)
--   * salary_vnd, equipment.cost_vnd, orders.vnd_amount dropped (section 7)
--   * every existing derived value is converted USD -> AUD at the rate the aud
--     row held BEFORE this migration (so nothing depends on a live FX lookup).
-- Native amount_cents + currency columns are untouched: they remain the
-- transaction record of truth.
--
-- Precondition: fx_rates must contain an 'aud' row (its rate_to_usd, e.g. 0.7173).
-- Idempotency: guarded so a second run is a no-op.

begin;

do $$
declare
  aud_to_usd numeric;
begin
  -- Already migrated? (rate_to_aud exists) -> nothing to do.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'company_os' and table_name = 'fx_rates' and column_name = 'rate_to_aud'
  ) then
    raise notice 'AUD base-currency migration already applied — skipping.';
    return;
  end if;

  select rate_to_usd into aud_to_usd from company_os.fx_rates where currency = 'aud';
  if aud_to_usd is null then
    raise exception 'company_os.fx_rates has no aud row. Insert one (currency=aud, rate_to_usd=<AUD->USD rate>) first.';
  end if;

  ------------------------------------------------------------------
  -- 1. fx_rates: rate_to_usd -> rate_to_aud, rescaled so aud = 1.
  ------------------------------------------------------------------
  alter table company_os.fx_rates rename column rate_to_usd to rate_to_aud;
  alter table company_os.fx_rates rename constraint fx_rates_rate_to_usd_check to fx_rates_rate_to_aud_check;
  update company_os.fx_rates set rate_to_aud = rate_to_aud / aud_to_usd, updated_at = now();
  insert into company_os.fx_rates (currency, rate_to_aud, updated_at)
    values ('usd', 1 / aud_to_usd, now())
    on conflict (currency) do update set rate_to_aud = excluded.rate_to_aud, updated_at = now();
  comment on column company_os.fx_rates.rate_to_aud is
    'Multiply a native minor-unit amount by this to get AUD cents. aud = 1. AUD is the base reporting currency.';

  ------------------------------------------------------------------
  -- 2. Derived reporting columns: rename, then convert USD -> AUD.
  --    Rows whose native currency is aud get the exact native amount.
  ------------------------------------------------------------------
  alter table company_os.orders   rename column amount_usd_cents to amount_aud_cents;
  alter table company_os.products rename column amount_usd_cents to amount_aud_cents;
  alter table company_os.bookings rename column amount_usd_cents to amount_aud_cents;
  alter table company_os.deals    rename column amount_usd_cents to amount_aud_cents;

  update company_os.orders   set amount_aud_cents = case when lower(currency) = 'aud' then amount_cents else round(amount_aud_cents / aud_to_usd) end where amount_aud_cents is not null;
  update company_os.products set amount_aud_cents = case when lower(currency) = 'aud' then amount_cents else round(amount_aud_cents / aud_to_usd) end where amount_aud_cents is not null;
  update company_os.bookings set amount_aud_cents = case when lower(currency) = 'aud' then amount_cents else round(amount_aud_cents / aud_to_usd) end where amount_aud_cents is not null;
  -- deals also carry the per-deal rate used; it now means "native -> AUD".
  update company_os.deals
     set amount_aud_cents = case when lower(currency) = 'aud' then amount_cents else round(amount_aud_cents / aud_to_usd) end,
         fx_rate = case when lower(currency) = 'aud' then 1 else fx_rate / aud_to_usd end
   where amount_aud_cents is not null;

  alter table company_os.event_pnl_lines rename column estimated_usd_cents to estimated_aud_cents;
  alter table company_os.event_pnl_lines rename column actual_usd_cents    to actual_aud_cents;
  update company_os.event_pnl_lines
     set estimated_aud_cents = case when lower(estimated_currency) = 'aud' then estimated_cents else round(estimated_aud_cents / aud_to_usd) end
   where estimated_aud_cents is not null;
  update company_os.event_pnl_lines
     set actual_aud_cents = case when lower(actual_currency) = 'aud' then actual_cents else round(actual_aud_cents / aud_to_usd) end
   where actual_aud_cents is not null;
  comment on table company_os.event_pnl_lines is
    'Per-retreat P&L line items (revenue + expense) behind the event P&L tab. Native amount is truth; *_aud_cents is derived via fx_rates. Staff lines use a flat $150/day so real wages never leak to ops. Service-role only; hidden from the NL->SQL assistant.';

  alter table company_os.affiliate_commissions rename column gross_usd_cents      to gross_aud_cents;
  alter table company_os.affiliate_commissions rename column net_usd_cents        to net_aud_cents;
  alter table company_os.affiliate_commissions rename column commission_usd_cents to commission_aud_cents;
  update company_os.affiliate_commissions
     set gross_aud_cents      = round(gross_aud_cents / aud_to_usd),
         net_aud_cents        = round(net_aud_cents / aud_to_usd),
         commission_aud_cents = round(commission_aud_cents / aud_to_usd)
   where gross_aud_cents is not null or net_aud_cents is not null or commission_aud_cents is not null;

  ------------------------------------------------------------------
  -- 3. Trigger function: rename + point at rate_to_aud / aud default.
  ------------------------------------------------------------------
  alter function company_os.set_amount_usd_cents() rename to set_amount_aud_cents;
  alter trigger set_amount_usd_cents_orders   on company_os.orders   rename to set_amount_aud_cents_orders;
  alter trigger set_amount_usd_cents_products on company_os.products rename to set_amount_aud_cents_products;
  alter trigger set_amount_usd_cents_bookings on company_os.bookings rename to set_amount_aud_cents_bookings;

  ------------------------------------------------------------------
  -- 4. New-row defaults follow the base currency.
  ------------------------------------------------------------------
  alter table company_os.orders   alter column currency set default 'aud';
  alter table company_os.products alter column currency set default 'aud';
  alter table company_os.bookings alter column currency set default 'aud';
  alter table company_os.deals    alter column currency set default 'aud';
end $$;

-- Function body (outside the DO block so it is plain DDL; idempotent).
create or replace function company_os.set_amount_aud_cents() returns trigger
    language plpgsql security definer
    set search_path to 'company_os', 'public'
    as $$
declare
  r numeric;
begin
  if new.amount_cents is null then
    new.amount_aud_cents := null;
    return new;
  end if;
  select rate_to_aud into r
    from company_os.fx_rates
    where currency = lower(coalesce(new.currency, 'aud'));
  new.amount_aud_cents := round(new.amount_cents * coalesce(r, 1));
  return new;
end;
$$;

------------------------------------------------------------------
-- 5. Views: output column names cannot be changed in place, so drop +
--    recreate, then restore the grants they had.
------------------------------------------------------------------
drop view if exists company_os.people_with_deals;
create view company_os.people_with_deals as
select
  p.*,
  case
    when coalesce(d.won_count, 0) > 0 then 'customer'
    when l.person_id is not null then 'lead'
    else 'none'
  end as lifecycle_stage,
  l.status as lead_status,
  l.disqualified_reason,
  coalesce(d.deal_value_aud_cents, 0) as deal_value_aud_cents,
  coalesce(d.deal_count, 0) as deal_count
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
) d on d.person_id = p.id;
grant select on company_os.people_with_deals to service_role;
grant select on company_os.people_with_deals to chatbot_reader;
grant select, insert, update on company_os.people_with_deals to chatbot_writer;

drop view if exists company_os.public_retreats;
create view company_os.public_retreats as
select
  cohort_slug as id,
  cohort_slug,
  coalesce(nullif(btrim(split_part(min(location), ',', 1)), ''), initcap(replace(cohort_slug, '-', ' '))) as name,
  min(location) as location,
  min(date_start) as date_start,
  max(date_end) as date_end,
  count(distinct id) as tiers,
  bool_or(active) as active,
  min(amount_aud_cents) as from_aud_cents,
  (select coalesce(sum(o.amount_aud_cents), 0)
     from company_os.event_registrations r
     join company_os.products p2 on p2.id = r.product_id
     left join company_os.orders o on o.id = r.order_id
    where p2.cohort_slug = pr.cohort_slug and r.status = 'confirmed') as collected_aud_cents,
  (select count(*)
     from company_os.event_registrations r
     join company_os.products p2 on p2.id = r.product_id
    where p2.cohort_slug = pr.cohort_slug) as registrations,
  (select count(*)
     from company_os.event_registrations r
     join company_os.products p2 on p2.id = r.product_id
    where p2.cohort_slug = pr.cohort_slug and r.status = 'confirmed') as confirmed
from company_os.products pr
where type = 'event' and cohort_slug is not null
group by cohort_slug;
grant select on company_os.public_retreats to service_role;
grant select on company_os.public_retreats to chatbot_reader;
grant select, insert, update on company_os.public_retreats to chatbot_writer;

------------------------------------------------------------------
-- 6. No USD anywhere else: native-currency columns that were USD-named,
--    and the 'usd' column defaults on every remaining money table.
--    (All of these tables are empty on the live project as of 2026-09-11,
--    so the renames carry no data; guarded anyway.)
------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='company_os' and table_name='compensation_sensitive' and column_name='salary_usd_cents') then
    alter table company_os.compensation_sensitive rename column salary_usd_cents to salary_aud_cents;
    comment on column company_os.compensation_sensitive.salary_aud_cents is
      'Monthly salary in AUD cents. comp_type = base_salary. Dave/Mai only.';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='company_os' and table_name='equipment' and column_name='cost_usd') then
    alter table company_os.equipment rename column cost_usd to cost_aud;
  end if;
end $$;

alter table company_os.compensation_sensitive alter column currency set default 'aud';
alter table company_os.contractor_payments   alter column currency set default 'aud';
alter table company_os.expenses              alter column currency set default 'aud';
alter table company_os.invoices              alter column currency set default 'aud';
alter table company_os.job_requisitions      alter column currency set default 'aud';
alter table company_os.offers                alter column currency set default 'aud';
alter table company_os.token_purchases       alter column currency set default 'aud';
alter table company_os.legal_entities        alter column base_currency set default 'aud';

------------------------------------------------------------------
-- 7. No VND either: drop the Vietnam-era native columns. All three are
--    empty / null on the live project as of 2026-09-11.
------------------------------------------------------------------
alter table company_os.compensation_sensitive drop column if exists salary_vnd;
alter table company_os.equipment              drop column if exists cost_vnd;
alter table company_os.orders                 drop column if exists vnd_amount;

commit;

-- Verify:
--   select currency, rate_to_aud from company_os.fx_rates;          -- aud = 1
--   select sum(amount_cents), sum(amount_aud_cents) from company_os.orders where currency='aud';  -- equal
--   select to_regprocedure('company_os.set_amount_aud_cents()');    -- not null
