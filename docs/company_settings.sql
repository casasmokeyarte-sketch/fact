-- Ajustes globales por empresa (Pagos, Categorias, Fecha operativa)
-- Ejecutar en Supabase SQL Editor (schema public)

create extension if not exists pgcrypto;

-- Helper admin por rol en profiles
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and lower(coalesce(p.role, '')) = 'administrador'
  );
$$;

grant execute on function public.is_admin() to authenticated;

create table if not exists public.company_settings (
  company_id uuid primary key default public.current_company_id(),
  payment_methods jsonb not null default '["Efectivo","Credito","Transferencia","Tarjeta"]'::jsonb,
  categories jsonb not null default '["General","Alimentos","Limpieza","Otros"]'::jsonb,
  promotions jsonb not null default '[]'::jsonb,
  operational_days_offset int not null default 0,
  operational_reason text,
  operational_applied_by uuid references auth.users(id),
  operational_applied_at timestamptz,
  updated_at timestamptz not null default now()
);

grant usage on schema public to authenticated;
grant select, insert, update on table public.company_settings to authenticated;

-- Migracion segura si la tabla ya existia sin la columna promotions
alter table public.company_settings
  add column if not exists promotions jsonb not null default '[]'::jsonb;

alter table public.company_settings enable row level security;

drop policy if exists "Company settings read" on public.company_settings;
create policy "Company settings read"
on public.company_settings
for select
to authenticated
using (company_id = public.current_company_id());

drop policy if exists "Company settings insert admin" on public.company_settings;
create policy "Company settings insert admin"
on public.company_settings
for insert
to authenticated
with check (company_id = public.current_company_id() and public.is_admin());

drop policy if exists "Company settings update admin" on public.company_settings;
create policy "Company settings update admin"
on public.company_settings
for update
to authenticated
using (company_id = public.current_company_id() and public.is_admin())
with check (company_id = public.current_company_id() and public.is_admin());

create index if not exists idx_company_settings_company_id on public.company_settings(company_id);
