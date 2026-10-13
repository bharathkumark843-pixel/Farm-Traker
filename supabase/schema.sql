-- Farm Tracker cloud backup schema (Supabase / Postgres).
-- Run this once in your Supabase project: Dashboard → SQL Editor → paste → Run.
-- Design: one row namespace per farmer via owner_phone (their verified +91 number).
-- v1 uses permissive pilot-grade RLS policies (anon key can read/write). Tighten
-- before wide release, e.g. Supabase phone Auth + `auth.jwt()` checks.

create table if not exists products (
  id text primary key,
  owner_phone text not null default '',
  name text not null default '',
  category text not null default 'Other',
  barcode text not null default '',
  photo_uri text not null default '',
  unit text not null default 'pcs',
  quantity_total double precision not null default 0,
  quantity_remaining double precision not null default 0,
  low_stock_threshold double precision not null default 0,
  price_paid double precision not null default 0,
  purchase_date text not null default '',
  expiry_date text not null default '',
  manufacturer text not null default '',
  label_info text not null default '',
  created_at text not null default '',
  updated_at text not null default ''
);
create index if not exists idx_products_owner on products (owner_phone);
create index if not exists idx_products_owner_updated on products (owner_phone, updated_at);

create table if not exists usage_logs (
  id text primary key,
  owner_phone text not null default '',
  product_id text not null default '',
  date text not null default '',
  quantity_used double precision not null default 0,
  crop text not null default '',
  field text not null default '',
  purpose_pest text not null default '',
  note text not null default '',
  created_at text not null default '',
  updated_at text not null default ''
);
create index if not exists idx_logs_owner on usage_logs (owner_phone);
create index if not exists idx_logs_owner_updated on usage_logs (owner_phone, updated_at);
create index if not exists idx_logs_product on usage_logs (product_id);

create table if not exists profiles (
  owner_phone text primary key,
  name text not null default '',
  village text not null default '',
  pincode text not null default '',
  acres double precision not null default 0,
  lang text not null default 'en',
  last_crop text not null default 'All',
  onboarded boolean not null default false,
  updated_at text not null default ''
);

-- Pilot-grade Row Level Security: allow anon read/write on all rows.
-- TODO(scale): replace with per-user policies once Supabase Auth is wired in.
alter table products enable row level security;
alter table usage_logs enable row level security;
alter table profiles enable row level security;

drop policy if exists "pilot open access" on products;
create policy "pilot open access" on products for all using (true) with check (true);
drop policy if exists "pilot open access" on usage_logs;
create policy "pilot open access" on usage_logs for all using (true) with check (true);
drop policy if exists "pilot open access" on profiles;
create policy "pilot open access" on profiles for all using (true) with check (true);
