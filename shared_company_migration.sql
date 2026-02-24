-- ============================================================
-- MIGRACION: MODO EMPRESA COMPARTIDA (multiusuario en misma BD)
-- Ejecutar en Supabase SQL Editor
-- Fecha: 2026-02-15
-- ============================================================

create extension if not exists pgcrypto;

-- 1) PERFIL: agregar company_id y unificar empresa para todos los usuarios existentes
alter table public.profiles
  add column if not exists company_id uuid;

do $$
declare
  v_company_id uuid;
begin
  select company_id into v_company_id
  from public.profiles
  where company_id is not null
  limit 1;

  if v_company_id is null then
    v_company_id := gen_random_uuid();
  end if;

  update public.profiles
  set company_id = v_company_id
  where company_id is null;
end $$;

alter table public.profiles
  alter column company_id set not null;

create index if not exists idx_profiles_company_id on public.profiles(company_id);

-- 2) Funcion helper: empresa actual del usuario autenticado
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

-- 3) Agregar company_id en tablas de negocio
alter table public.products add column if not exists company_id uuid;
alter table public.clients add column if not exists company_id uuid;
alter table public.invoices add column if not exists company_id uuid;
alter table public.expenses add column if not exists company_id uuid;
alter table public.purchases add column if not exists company_id uuid;
alter table public.audit_logs add column if not exists company_id uuid;
alter table public.shift_history add column if not exists company_id uuid;

-- Backfill por user_id -> profiles.company_id
update public.products t
set company_id = p.company_id
from public.profiles p
where t.company_id is null and t.user_id = p.user_id;

update public.clients t
set company_id = p.company_id
from public.profiles p
where t.company_id is null and t.user_id = p.user_id;

update public.invoices t
set company_id = p.company_id
from public.profiles p
where t.company_id is null and t.user_id = p.user_id;

update public.expenses t
set company_id = p.company_id
from public.profiles p
where t.company_id is null and t.user_id = p.user_id;

update public.purchases t
set company_id = p.company_id
from public.profiles p
where t.company_id is null and t.user_id = p.user_id;

update public.audit_logs t
set company_id = p.company_id
from public.profiles p
where t.company_id is null and t.user_id = p.user_id;

update public.shift_history t
set company_id = p.company_id
from public.profiles p
where t.company_id is null and t.user_id = p.user_id;

-- Completar nulos remanentes con una empresa global existente
update public.products set company_id = (select company_id from public.profiles limit 1) where company_id is null;
update public.clients set company_id = (select company_id from public.profiles limit 1) where company_id is null;
update public.invoices set company_id = (select company_id from public.profiles limit 1) where company_id is null;
update public.expenses set company_id = (select company_id from public.profiles limit 1) where company_id is null;
update public.purchases set company_id = (select company_id from public.profiles limit 1) where company_id is null;
update public.audit_logs set company_id = (select company_id from public.profiles limit 1) where company_id is null;
update public.shift_history set company_id = (select company_id from public.profiles limit 1) where company_id is null;

-- Defaults y not null
alter table public.products alter column company_id set default public.current_company_id();
alter table public.clients alter column company_id set default public.current_company_id();
alter table public.invoices alter column company_id set default public.current_company_id();
alter table public.expenses alter column company_id set default public.current_company_id();
alter table public.purchases alter column company_id set default public.current_company_id();
alter table public.audit_logs alter column company_id set default public.current_company_id();
alter table public.shift_history alter column company_id set default public.current_company_id();

alter table public.products alter column company_id set not null;
alter table public.clients alter column company_id set not null;
alter table public.invoices alter column company_id set not null;
alter table public.expenses alter column company_id set not null;
alter table public.purchases alter column company_id set not null;
alter table public.audit_logs alter column company_id set not null;
alter table public.shift_history alter column company_id set not null;

create index if not exists idx_products_company_id on public.products(company_id);
create index if not exists idx_clients_company_id on public.clients(company_id);
create index if not exists idx_invoices_company_id on public.invoices(company_id);
create index if not exists idx_expenses_company_id on public.expenses(company_id);
create index if not exists idx_purchases_company_id on public.purchases(company_id);
create index if not exists idx_audit_logs_company_id on public.audit_logs(company_id);
create index if not exists idx_shift_history_company_id on public.shift_history(company_id);

-- 4) Trigger de signup: todos los nuevos usuarios caen en la misma empresa existente
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  select company_id into v_company_id
  from public.profiles
  where company_id is not null
  limit 1;

  if v_company_id is null then
    v_company_id := gen_random_uuid();
  end if;

  begin
    insert into public.profiles (user_id, email, display_name, company_id)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
      v_company_id
    )
    on conflict (user_id) do nothing;
  exception when others then
    raise warning 'handle_new_user error: %', sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- 5) Reemplazar policies para compartir por company_id

do $$
declare
  t text;
  p record;
  tabs text[] := array[
    'products','clients','invoices','invoice_items','expenses','purchases','shift_history','audit_logs','profiles'
  ];
begin
  foreach t in array tabs loop
    for p in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end $$;

-- PRODUCTS
create policy "Company can view products" on public.products
  for select using (company_id = public.current_company_id());
create policy "Company can insert products" on public.products
  for insert with check (company_id = public.current_company_id());
create policy "Company can update products" on public.products
  for update using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());
create policy "Company can delete products" on public.products
  for delete using (company_id = public.current_company_id());

-- CLIENTS
create policy "Company can view clients" on public.clients
  for select using (company_id = public.current_company_id());
create policy "Company can insert clients" on public.clients
  for insert with check (company_id = public.current_company_id());
create policy "Company can update clients" on public.clients
  for update using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());
create policy "Company can delete clients" on public.clients
  for delete using (company_id = public.current_company_id());

-- INVOICES
create policy "Company can view invoices" on public.invoices
  for select using (company_id = public.current_company_id());
create policy "Company can insert invoices" on public.invoices
  for insert with check (company_id = public.current_company_id());
create policy "Company can update invoices" on public.invoices
  for update using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());
create policy "Company can delete invoices" on public.invoices
  for delete using (company_id = public.current_company_id());

-- INVOICE ITEMS (via invoice.company_id)
create policy "Company can view invoice_items" on public.invoice_items
  for select using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id
        and i.company_id = public.current_company_id()
    )
  );
create policy "Company can insert invoice_items" on public.invoice_items
  for insert with check (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id
        and i.company_id = public.current_company_id()
    )
  );

-- EXPENSES
create policy "Company can view expenses" on public.expenses
  for select using (company_id = public.current_company_id());
create policy "Company can insert expenses" on public.expenses
  for insert with check (company_id = public.current_company_id());
create policy "Company can update expenses" on public.expenses
  for update using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

-- PURCHASES
create policy "Company can view purchases" on public.purchases
  for select using (company_id = public.current_company_id());
create policy "Company can insert purchases" on public.purchases
  for insert with check (company_id = public.current_company_id());
create policy "Company can update purchases" on public.purchases
  for update using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

-- SHIFT HISTORY
create policy "Company can view shift_history" on public.shift_history
  for select using (company_id = public.current_company_id());
create policy "Company can insert shift_history" on public.shift_history
  for insert with check (company_id = public.current_company_id());

-- AUDIT LOGS
create policy "Company can view audit_logs" on public.audit_logs
  for select using (company_id = public.current_company_id());
create policy "Company can insert audit_logs" on public.audit_logs
  for insert with check (company_id = public.current_company_id());

-- PROFILES (visibles en misma empresa)
create policy "Company can view profiles" on public.profiles
  for select using (company_id = public.current_company_id());

create policy "Users/admin can insert profile" on public.profiles
  for insert with check (
    auth.uid() = user_id
    or current_user = 'postgres'
    or current_user = 'supabase_auth_admin'
  );

create policy "Users/admin can update profile" on public.profiles
  for update using (
    auth.uid() = user_id
    or current_user = 'postgres'
    or current_user = 'supabase_auth_admin'
  )
  with check (
    company_id = public.current_company_id()
    or current_user = 'postgres'
    or current_user = 'supabase_auth_admin'
  );

-- 6) Verificacion rapida
-- select user_id, email, company_id from public.profiles;
-- select count(*) from public.products where company_id = public.current_company_id();
