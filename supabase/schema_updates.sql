-- ShopSaathi schema updates (run in Supabase SQL editor)
-- RLS: disable on new tables as requested (adjust for production if needed)

alter table if exists shops
  add column if not exists last_bill_number int default 0;

alter table if exists shops
  add column if not exists upi_id text;

alter table if exists shops
  add column if not exists shop_address text;

alter table if exists bills
  add column if not exists bill_number text;

alter table if exists bills
  add column if not exists payment_mode text default 'cash';

create table if not exists expenses (
  id uuid default gen_random_uuid() primary key,
  shop_id text not null,
  category text not null,
  amount numeric not null check (amount >= 0),
  note text default '',
  expense_date date not null default (current_date),
  created_at timestamptz default now()
);

alter table if exists expenses disable row level security;

create table if not exists purchases (
  id uuid default gen_random_uuid() primary key,
  shop_id text not null,
  product_id text not null,
  product_name text not null,
  qty int not null check (qty > 0),
  price_per_unit numeric not null check (price_per_unit >= 0),
  total_cost numeric not null check (total_cost >= 0),
  supplier_name text default '',
  created_at timestamptz default now()
);

alter table if exists purchases disable row level security;
