-- ============================================================
-- ACCESO COMPARTIDO A INVENTARIO + DESACTIVACION DE USUARIOS
-- Ejecutar una sola vez en Supabase SQL Editor.
-- Es idempotente: se puede volver a ejecutar sin duplicar datos.
-- ============================================================

create extension if not exists pgcrypto;

-- 1) Estado laboral del perfil. Desactivar conserva todo el historial.
alter table public.profiles
  add column if not exists active boolean not null default true;

update public.profiles
set active = true
where active is null;

-- 2) Identidad de empresa compartida.
alter table public.profiles
  add column if not exists company_id uuid;

alter table public.products
  add column if not exists company_id uuid;

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

-- Completar solo los perfiles que aun no tienen empresa.
do $$
declare
  v_company_id uuid;
begin
  select company_id
  into v_company_id
  from public.profiles
  where company_id is not null
  order by
    case when lower(coalesce(role, '')) = 'administrador' then 0 else 1 end,
    created_at asc nulls last
  limit 1;

  if v_company_id is null then
    v_company_id := gen_random_uuid();
  end if;

  update public.profiles
  set company_id = v_company_id
  where company_id is null;
end $$;

-- Completar company_id de productos antiguos.
update public.products product
set company_id = profile.company_id
from public.profiles profile
where product.company_id is null
  and product.user_id = profile.user_id;

update public.products
set company_id = (
  select company_id
  from public.profiles
  where company_id is not null
  order by
    case when lower(coalesce(role, '')) = 'administrador' then 0 else 1 end,
    created_at asc nulls last
  limit 1
)
where company_id is null;

-- 3) RLS: todos los integrantes activos de la misma empresa pueden consultar.
alter table public.products enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "Company can view products" on public.products;
create policy "Company can view products"
on public.products
for select
to authenticated
using (
  company_id = public.current_company_id()
  and exists (
    select 1
    from public.profiles viewer
    where viewer.user_id = auth.uid()
      and viewer.active = true
  )
);

drop policy if exists "Company can insert products" on public.products;
create policy "Company can insert products"
on public.products
for insert
to authenticated
with check (
  company_id = public.current_company_id()
  and exists (
    select 1
    from public.profiles viewer
    where viewer.user_id = auth.uid()
      and viewer.active = true
  )
);

drop policy if exists "Company can update products" on public.products;
create policy "Company can update products"
on public.products
for update
to authenticated
using (
  company_id = public.current_company_id()
  and exists (
    select 1
    from public.profiles viewer
    where viewer.user_id = auth.uid()
      and viewer.active = true
  )
)
with check (
  company_id = public.current_company_id()
  and exists (
    select 1
    from public.profiles viewer
    where viewer.user_id = auth.uid()
      and viewer.active = true
  )
);

drop policy if exists "Company can delete products" on public.products;
create policy "Company can delete products"
on public.products
for delete
to authenticated
using (
  company_id = public.current_company_id()
  and exists (
    select 1
    from public.profiles viewer
    where viewer.user_id = auth.uid()
      and viewer.active = true
  )
);

drop policy if exists "Company can view profiles" on public.profiles;
create policy "Company can view profiles"
on public.profiles
for select
to authenticated
using (
  user_id = auth.uid()
  or company_id = public.current_company_id()
);

create index if not exists idx_profiles_company_active
  on public.profiles(company_id, active);

create index if not exists idx_products_company_id
  on public.products(company_id);

-- Verificacion: no debe quedar ningun perfil ni producto sin company_id.
select
  (select count(*) from public.profiles where company_id is null) as perfiles_sin_empresa,
  (select count(*) from public.products where company_id is null) as productos_sin_empresa,
  (select count(*) from public.profiles where active = false) as usuarios_inactivos;
