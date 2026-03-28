-- Notas y ajustes comerciales sobre cliente, factura o producto
-- Ejecutar en Supabase SQL Editor (schema public)

create extension if not exists pgcrypto;

create table if not exists public.commercial_notes (
  id text primary key,
  company_id uuid not null default public.current_company_id(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_name text,
  date timestamptz not null default now(),
  note_class text not null default 'AJUSTE',
  scope text not null default 'CLIENTE',
  reason_code text not null default '',
  reason_label text not null default '',
  direction text not null default 'NEUTRO',
  amount numeric(15,2) not null default 0,
  quantity numeric(15,2) not null default 0,
  client_id text,
  client_name text,
  client_document text,
  invoice_id text,
  invoice_code text,
  product_id uuid references public.products(id) on delete set null,
  product_name text,
  description text not null,
  status text not null default 'ACTIVA',
  updated_at timestamptz not null default now(),
  constraint commercial_notes_class_chk check (note_class in ('CREDITO', 'DEBITO', 'AJUSTE', 'NOVEDAD')),
  constraint commercial_notes_scope_chk check (scope in ('CLIENTE', 'FACTURA', 'PRODUCTO')),
  constraint commercial_notes_direction_chk check (direction in ('SUMA', 'RESTA', 'NEUTRO'))
);

alter table public.commercial_notes enable row level security;

create index if not exists idx_commercial_notes_company_date
  on public.commercial_notes (company_id, date desc);

create index if not exists idx_commercial_notes_scope
  on public.commercial_notes (scope, date desc);

drop policy if exists "Commercial notes read" on public.commercial_notes;
create policy "Commercial notes read"
on public.commercial_notes
for select
to authenticated
using (company_id = public.current_company_id());

drop policy if exists "Commercial notes insert" on public.commercial_notes;
create policy "Commercial notes insert"
on public.commercial_notes
for insert
to authenticated
with check (
  company_id = public.current_company_id()
  and user_id = auth.uid()
);

drop policy if exists "Commercial notes update own or admin" on public.commercial_notes;
create policy "Commercial notes update own or admin"
on public.commercial_notes
for update
to authenticated
using (
  company_id = public.current_company_id()
  and (
    user_id = auth.uid()
    or public.is_admin()
  )
)
with check (
  company_id = public.current_company_id()
  and (
    user_id = auth.uid()
    or public.is_admin()
  )
);
