-- Shopify native sync: schema changes.
--
-- Brings TeddyBed Shopify data into the native company_os objects instead of a
-- mirror schema. Customers become people, products become products (+ a
-- variant child table), orders become orders (+ a line child table). See
-- docs/plans/shopify-native-sync.md.
--
-- All additive except the qbo_connection drop (the retired QuickBooks OAuth
-- token store — the integration code was removed in the "Remove QuickBooks
-- integration" change). No existing data is touched.
--
-- Apply BEFORE running the backfill. Order matters only in that the three new
-- CHECK values must exist before the backfill writes rows that use them.
--
-- Apply via psql as the postgres role (per repo convention; supabase-js /
-- PostgREST cannot run DDL). After applying, regenerate supabase/01-schema.sql
-- from the live DB (pg_dump) so the canonical schema file stays authoritative;
-- the hand-edits in this change mirror these statements but pg_dump is truth.

begin;

-- ---------------------------------------------------------------------------
-- people: Shopify customers land here, keyed by email (existing UNIQUE citext)
-- with the Shopify GID as a stable secondary key that survives email changes.
-- ---------------------------------------------------------------------------
alter table company_os.people
  add column if not exists shopify_customer_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'people_shopify_customer_id_key'
  ) then
    alter table company_os.people
      add constraint people_shopify_customer_id_key unique (shopify_customer_id);
  end if;
end $$;

-- persona gains 'customer' (retail buyer). 'client' stays reserved for B2B.
alter table company_os.people drop constraint if exists people_persona_check;
alter table company_os.people
  add constraint people_persona_check check (
    (persona is null) or (persona = any (array[
      'vendor','prospect','client','job_seeker','employee','student','customer'
    ]))
  );

-- ---------------------------------------------------------------------------
-- products: Shopify products land here 1:1 with what the Shopify admin shows;
-- the sellable unit is the variant (child table below).
-- ---------------------------------------------------------------------------
alter table company_os.products
  add column if not exists shopify_product_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_shopify_product_id_key'
  ) then
    alter table company_os.products
      add constraint products_shopify_product_id_key unique (shopify_product_id);
  end if;
end $$;

-- type gains 'physical' (a shippable good).
alter table company_os.products drop constraint if exists products_type_check;
alter table company_os.products
  add constraint products_type_check check (
    type = any (array[
      'event','membership','private_sprint','course','service','digital','other','physical'
    ])
  );

-- ---------------------------------------------------------------------------
-- product_variants: the sellable unit. Each Shopify variant with its own SKU
-- and price. Mirrors the products RLS/grant model (four roles).
-- ---------------------------------------------------------------------------
create table if not exists company_os.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references company_os.products(id) on delete cascade,
  shopify_variant_id text unique,
  sku text,
  title text,
  amount_cents integer not null default 0,
  currency text not null default 'aud',
  inventory_quantity integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_variants_product_idx
  on company_os.product_variants (product_id);
create index if not exists product_variants_sku_idx
  on company_os.product_variants (sku);

create trigger set_product_variants_updated_at
  before update on company_os.product_variants
  for each row execute function company_os.handle_updated_at();

alter table company_os.product_variants enable row level security;

create policy "chatbot_reader_select" on company_os.product_variants
  for select to chatbot_reader using (true);
create policy "chatbot_writer_select" on company_os.product_variants
  for select to chatbot_writer using (true);
create policy "chatbot_writer_insert" on company_os.product_variants
  for insert to chatbot_writer with check (true);
create policy "chatbot_writer_update" on company_os.product_variants
  for update to chatbot_writer using (true) with check (true);
create policy "team_chatbot_reader_select" on company_os.product_variants
  for select to team_chatbot_reader using (true);

grant select, insert, update, delete on company_os.product_variants to service_role;
grant select on company_os.product_variants to chatbot_reader;
grant select, insert, update on company_os.product_variants to chatbot_writer;
grant select on company_os.product_variants to team_chatbot_reader;

-- ---------------------------------------------------------------------------
-- orders: Shopify orders land here. product_id stays null for Shopify orders
-- (multi-line) — lines live in order_lines. The existing set_amount_usd_cents
-- trigger fills amount_usd_cents from amount_cents + currency via fx_rates.
-- ---------------------------------------------------------------------------
alter table company_os.orders
  add column if not exists shopify_order_id text,
  add column if not exists order_number text,
  add column if not exists fulfillment_status text,
  add column if not exists shipping_cents bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_shopify_order_id_key'
  ) then
    alter table company_os.orders
      add constraint orders_shopify_order_id_key unique (shopify_order_id);
  end if;
end $$;

create index if not exists orders_order_number_idx
  on company_os.orders (order_number);

-- payment_method gains 'shopify'.
alter table company_os.orders drop constraint if exists orders_payment_method_check;
alter table company_os.orders
  add constraint orders_payment_method_check check (
    payment_method = any (array['stripe','offline_vn','manual','shopify'])
  );

-- ---------------------------------------------------------------------------
-- order_lines: one row per Shopify line item. Resolves to the product and
-- variant sold. Immutable snapshot of title/sku/price at purchase time, so no
-- updated_at. Mirrors the orders RLS/grant model (four roles).
-- ---------------------------------------------------------------------------
create table if not exists company_os.order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references company_os.orders(id) on delete cascade,
  product_id uuid references company_os.products(id),
  variant_id uuid references company_os.product_variants(id),
  shopify_line_id text unique,
  title text not null,
  sku text,
  quantity integer not null default 1,
  unit_amount_cents bigint not null default 0,
  total_amount_cents bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists order_lines_order_idx
  on company_os.order_lines (order_id);
create index if not exists order_lines_product_idx
  on company_os.order_lines (product_id);
create index if not exists order_lines_variant_idx
  on company_os.order_lines (variant_id);

alter table company_os.order_lines enable row level security;

create policy "chatbot_reader_select" on company_os.order_lines
  for select to chatbot_reader using (true);
create policy "chatbot_writer_select" on company_os.order_lines
  for select to chatbot_writer using (true);
create policy "chatbot_writer_insert" on company_os.order_lines
  for insert to chatbot_writer with check (true);
create policy "chatbot_writer_update" on company_os.order_lines
  for update to chatbot_writer using (true) with check (true);
create policy "team_chatbot_reader_select" on company_os.order_lines
  for select to team_chatbot_reader using (true);

grant select, insert, update, delete on company_os.order_lines to service_role;
grant select on company_os.order_lines to chatbot_reader;
grant select, insert, update on company_os.order_lines to chatbot_writer;
grant select on company_os.order_lines to team_chatbot_reader;

-- ---------------------------------------------------------------------------
-- shopify_sync_state: incremental high-water mark, one row per entity
-- (customers / products / orders). service_role only — internal plumbing.
-- ---------------------------------------------------------------------------
create table if not exists company_os.shopify_sync_state (
  entity text primary key,
  last_sync timestamptz,
  last_run_at timestamptz,
  last_status text,
  updated_at timestamptz not null default now()
);

create trigger set_shopify_sync_state_updated_at
  before update on company_os.shopify_sync_state
  for each row execute function company_os.handle_updated_at();

alter table company_os.shopify_sync_state enable row level security;
grant select, insert, update, delete on company_os.shopify_sync_state to service_role;

-- ---------------------------------------------------------------------------
-- Register the integration source (matches the existing integration pattern).
-- ---------------------------------------------------------------------------
insert into company_os.integration_sources (slug, name, kind, base_url, active)
values ('shopify', 'Shopify', 'ecommerce', 'https://teddybed.com.au', true)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Drop the retired QuickBooks OAuth token store. Its integration code is gone;
-- the invoices/expenses ledger tables and their data are deliberately kept.
-- ---------------------------------------------------------------------------
drop table if exists company_os.qbo_connection;

commit;
