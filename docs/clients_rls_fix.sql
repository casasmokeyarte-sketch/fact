-- ============================================================
-- FIX RAPIDO: RLS de clients para modo empresa compartida
-- Problema: usuarios de la misma empresa no pueden actualizar
--           clientes creados por otro usuario.
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1) Asegurar que existe la extension y la funcion helper de company_id
create extension if not exists pgcrypto;

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id
  from public.profiles
  where user_id = auth.uid()
  limit 1;
$$;

grant execute on function public.current_company_id() to authenticated;
grant execute on function public.current_company_id() to anon;

-- 2) Agregar company_id a clients si no existe
alter table public.clients add column if not exists company_id uuid;

-- 3) Backfill: asignar company_id desde profiles via user_id
update public.clients t
set company_id = p.company_id
from public.profiles p
where t.company_id is null
  and t.user_id = p.user_id;

-- Backfill residual: clientes sin user_id o sin perfil coincidente
update public.clients
set company_id = (select company_id from public.profiles where company_id is not null limit 1)
where company_id is null;

-- 4) Reemplazar policies de clients
do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'clients'
  loop
    execute format('drop policy if exists %I on public.clients', p.policyname);
  end loop;
end $$;

create policy "Company can view clients" on public.clients
  for select using (
    company_id = public.current_company_id()
    or company_id is null
  );

create policy "Company can insert clients" on public.clients
  for insert with check (
    company_id = public.current_company_id()
    or company_id is null
  );

create policy "Company can update clients" on public.clients
  for update using (
    company_id = public.current_company_id()
    or company_id is null
  )
  with check (
    company_id = public.current_company_id()
    or company_id is null
  );

create policy "Company can delete clients" on public.clients
  for delete using (
    company_id = public.current_company_id()
    or company_id is null
  );

-- 5) Asegurar RLS habilitado (idempotente)
alter table public.clients enable row level security;

-- 6) Opcional: agregar default y not null una vez confirmado el backfill
-- (descomentar si todos los registros ya tienen company_id)
-- alter table public.clients alter column company_id set default public.current_company_id();
-- alter table public.clients alter column company_id set not null;

-- Verificacion:
-- select count(*) as sin_company from public.clients where company_id is null;
-- select count(*) as con_company from public.clients where company_id is not null;
