-- Make company_os.people.email optional.
--
-- Shopify (and real life) has customers who buy with only a phone number and
-- no email. The native people model required email NOT NULL, which forced the
-- Shopify sync to drop those customers and, with them, their orders. Email is
-- now nullable; the UNIQUE constraint stays (Postgres allows many NULLs), so
-- email-less people are distinguished by shopify_customer_id / phone instead.
--
-- Existing rows are unaffected (they all have emails). Apply via psql / the
-- Supabase SQL editor. See docs/plans/shopify-native-sync.md.

alter table company_os.people alter column email drop not null;
