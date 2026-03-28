-- Pases de inventario entre bodega y usuarios receptores
-- Ejecutar en Supabase SQL Editor (schema public)

create extension if not exists pgcrypto;

create table if not exists public.inventory_transfer_requests (
  id text primary key,
  company_id uuid not null default public.current_company_id(),
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity numeric(15,2) not null default 0,
  target_user_id uuid references auth.users(id) on delete set null,
  target_user_key text not null,
  target_user_name text,
  status text not null default 'PENDING',
  source_location text not null default 'bodega',
  destination_location text not null default 'ventas',
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_by_name text,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_by_name text,
  updated_at timestamptz not null default now(),
  constraint inventory_transfer_requests_status_chk check (status in ('PENDING', 'CONFIRMED', 'REJECTED'))
);

alter table public.inventory_transfer_requests
  add column if not exists company_id uuid not null default public.current_company_id(),
  add column if not exists product_id uuid references public.products(id) on delete set null,
  add column if not exists product_name text not null default 'Producto',
  add column if not exists quantity numeric(15,2) not null default 0,
  add column if not exists target_user_id uuid references auth.users(id) on delete set null,
  add column if not exists target_user_key text not null default '',
  add column if not exists target_user_name text,
  add column if not exists status text not null default 'PENDING',
  add column if not exists source_location text not null default 'bodega',
  add column if not exists destination_location text not null default 'ventas',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists created_by uuid references auth.users(id) on delete cascade,
  add column if not exists created_by_name text,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references auth.users(id) on delete set null,
  add column if not exists resolved_by_name text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.inventory_transfer_requests enable row level security;

create index if not exists idx_inventory_transfer_requests_company_created
  on public.inventory_transfer_requests (company_id, created_at desc);

create index if not exists idx_inventory_transfer_requests_target_status
  on public.inventory_transfer_requests (target_user_key, status, created_at desc);

drop policy if exists "Inventory transfer requests read" on public.inventory_transfer_requests;
create policy "Inventory transfer requests read"
on public.inventory_transfer_requests
for select
to authenticated
using (company_id = public.current_company_id());

drop policy if exists "Inventory transfer requests insert" on public.inventory_transfer_requests;
create policy "Inventory transfer requests insert"
on public.inventory_transfer_requests
for insert
to authenticated
with check (
  company_id = public.current_company_id()
  and created_by = auth.uid()
);

drop policy if exists "Inventory transfer requests update sender receiver or admin" on public.inventory_transfer_requests;
create policy "Inventory transfer requests update sender receiver or admin"
on public.inventory_transfer_requests
for update
to authenticated
using (
  company_id = public.current_company_id()
  and (
    created_by = auth.uid()
    or target_user_id = auth.uid()
    or resolved_by = auth.uid()
    or public.is_admin()
  )
)
with check (
  company_id = public.current_company_id()
  and (
    created_by = auth.uid()
    or target_user_id = auth.uid()
    or resolved_by = auth.uid()
    or public.is_admin()
  )
);
