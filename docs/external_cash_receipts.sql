-- Recibos de caja para terceros externos
-- Ejecutar en Supabase SQL Editor (schema public)

create extension if not exists pgcrypto;

create table if not exists public.external_cash_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_name text,
  date timestamptz not null default now(),
  receipt_code text not null,
  third_party_name text not null,
  third_party_document text,
  amount numeric(15,2) not null default 0,
  payment_method text not null default 'Efectivo',
  payment_reference text,
  concept text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.external_cash_receipts
  add column if not exists user_name text,
  add column if not exists third_party_document text,
  add column if not exists payment_method text not null default 'Efectivo',
  add column if not exists payment_reference text,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.external_cash_receipts enable row level security;

create unique index if not exists idx_external_cash_receipts_code
  on public.external_cash_receipts (receipt_code);

create index if not exists idx_external_cash_receipts_user_date
  on public.external_cash_receipts (user_id, date desc);

drop policy if exists "Users can view their own external cash receipts" on public.external_cash_receipts;
create policy "Users can view their own external cash receipts"
on public.external_cash_receipts
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own external cash receipts" on public.external_cash_receipts;
create policy "Users can insert their own external cash receipts"
on public.external_cash_receipts
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own external cash receipts" on public.external_cash_receipts;
create policy "Users can update their own external cash receipts"
on public.external_cash_receipts
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own external cash receipts" on public.external_cash_receipts;
create policy "Users can delete their own external cash receipts"
on public.external_cash_receipts
for delete
to authenticated
using (auth.uid() = user_id);
