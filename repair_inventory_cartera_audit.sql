-- ============================================================
-- REPARACION INTEGRAL: inventario compartido + cartera + auditoria
-- Ejecutar en Supabase SQL Editor
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1) BASE MULTIUSUARIO POR EMPRESA (company_id)
-- ------------------------------------------------------------

alter table public.profiles
  add column if not exists company_id uuid;

do $$
declare
  v_company_id uuid;
begin
  select company_id
    into v_company_id
  from public.profiles
  where company_id is not null
  order by created_at asc nulls last
  limit 1;

  if v_company_id is null then
    v_company_id := gen_random_uuid();
  end if;

  update public.profiles
     set company_id = v_company_id
   where company_id is null;
end $$;

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.company_id
    from public.profiles p
   where p.user_id = auth.uid()
   limit 1;
$$;

grant execute on function public.current_company_id() to authenticated;
grant execute on function public.current_company_id() to anon;

create index if not exists idx_profiles_company_id on public.profiles(company_id);

alter table public.products add column if not exists company_id uuid;
alter table public.clients add column if not exists company_id uuid;
alter table public.invoices add column if not exists company_id uuid;
alter table public.expenses add column if not exists company_id uuid;
alter table public.purchases add column if not exists company_id uuid;
alter table public.audit_logs add column if not exists company_id uuid;
alter table public.shift_history add column if not exists company_id uuid;
alter table public.external_cash_receipts add column if not exists company_id uuid;

update public.products t
   set company_id = p.company_id
  from public.profiles p
 where t.company_id is null
   and t.user_id = p.user_id;

update public.clients t
   set company_id = p.company_id
  from public.profiles p
 where t.company_id is null
   and t.user_id = p.user_id;

update public.invoices t
   set company_id = p.company_id
  from public.profiles p
 where t.company_id is null
   and t.user_id = p.user_id;

update public.expenses t
   set company_id = p.company_id
  from public.profiles p
 where t.company_id is null
   and t.user_id = p.user_id;

update public.purchases t
   set company_id = p.company_id
  from public.profiles p
 where t.company_id is null
   and t.user_id = p.user_id;

update public.audit_logs t
   set company_id = p.company_id
  from public.profiles p
 where t.company_id is null
   and t.user_id = p.user_id;

update public.shift_history t
   set company_id = p.company_id
  from public.profiles p
 where t.company_id is null
   and t.user_id = p.user_id;

update public.external_cash_receipts t
   set company_id = p.company_id
  from public.profiles p
 where t.company_id is null
   and t.user_id = p.user_id;

update public.products
   set company_id = (select company_id from public.profiles where company_id is not null limit 1)
 where company_id is null;

update public.clients
   set company_id = (select company_id from public.profiles where company_id is not null limit 1)
 where company_id is null;

update public.invoices
   set company_id = (select company_id from public.profiles where company_id is not null limit 1)
 where company_id is null;

update public.expenses
   set company_id = (select company_id from public.profiles where company_id is not null limit 1)
 where company_id is null;

update public.purchases
   set company_id = (select company_id from public.profiles where company_id is not null limit 1)
 where company_id is null;

update public.audit_logs
   set company_id = (select company_id from public.profiles where company_id is not null limit 1)
 where company_id is null;

update public.shift_history
   set company_id = (select company_id from public.profiles where company_id is not null limit 1)
 where company_id is null;

update public.external_cash_receipts
   set company_id = (select company_id from public.profiles where company_id is not null limit 1)
 where company_id is null;

alter table public.products alter column company_id set default public.current_company_id();
alter table public.clients alter column company_id set default public.current_company_id();
alter table public.invoices alter column company_id set default public.current_company_id();
alter table public.expenses alter column company_id set default public.current_company_id();
alter table public.purchases alter column company_id set default public.current_company_id();
alter table public.audit_logs alter column company_id set default public.current_company_id();
alter table public.shift_history alter column company_id set default public.current_company_id();
alter table public.external_cash_receipts alter column company_id set default public.current_company_id();

alter table public.products alter column company_id set not null;
alter table public.clients alter column company_id set not null;
alter table public.invoices alter column company_id set not null;
alter table public.expenses alter column company_id set not null;
alter table public.purchases alter column company_id set not null;
alter table public.audit_logs alter column company_id set not null;
alter table public.shift_history alter column company_id set not null;
alter table public.external_cash_receipts alter column company_id set not null;

create index if not exists idx_products_company_id on public.products(company_id);
create index if not exists idx_clients_company_id on public.clients(company_id);
create index if not exists idx_invoices_company_id on public.invoices(company_id);
create index if not exists idx_expenses_company_id on public.expenses(company_id);
create index if not exists idx_purchases_company_id on public.purchases(company_id);
create index if not exists idx_audit_logs_company_id on public.audit_logs(company_id);
create index if not exists idx_shift_history_company_id on public.shift_history(company_id);
create index if not exists idx_external_cash_receipts_company_id on public.external_cash_receipts(company_id);

-- ------------------------------------------------------------
-- 2) RLS CONSISTENTE EN TABLAS CLAVE
-- ------------------------------------------------------------

alter table public.products enable row level security;
alter table public.clients enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.audit_logs enable row level security;
alter table public.profiles enable row level security;

-- Borrar policies previas para evitar mezcla user_id vs company_id
DO $$
DECLARE
  t text;
  p record;
  tabs text[] := array['products','clients','invoices','invoice_items','audit_logs','profiles'];
BEGIN
  foreach t in array tabs loop
    for p in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;
  end loop;
END $$;

create policy "Company can view products" on public.products
  for select using (company_id = public.current_company_id());
create policy "Company can insert products" on public.products
  for insert with check (company_id = public.current_company_id());
create policy "Company can update products" on public.products
  for update using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());
create policy "Company can delete products" on public.products
  for delete using (company_id = public.current_company_id());

create policy "Company can view clients" on public.clients
  for select using (company_id = public.current_company_id());
create policy "Company can insert clients" on public.clients
  for insert with check (company_id = public.current_company_id());
create policy "Company can update clients" on public.clients
  for update using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());
create policy "Company can delete clients" on public.clients
  for delete using (company_id = public.current_company_id());

create policy "Company can view invoices" on public.invoices
  for select using (company_id = public.current_company_id());
create policy "Company can insert invoices" on public.invoices
  for insert with check (company_id = public.current_company_id());
create policy "Company can update invoices" on public.invoices
  for update using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());
create policy "Company can delete invoices" on public.invoices
  for delete using (company_id = public.current_company_id());

create policy "Company can view invoice_items" on public.invoice_items
  for select using (
    exists (
      select 1
      from public.invoices i
      where i.id = invoice_items.invoice_id
        and i.company_id = public.current_company_id()
    )
  );

create policy "Company can insert invoice_items" on public.invoice_items
  for insert with check (
    exists (
      select 1
      from public.invoices i
      where i.id = invoice_items.invoice_id
        and i.company_id = public.current_company_id()
    )
  );

create policy "Company can view audit_logs" on public.audit_logs
  for select using (company_id = public.current_company_id());
create policy "Company can insert audit_logs" on public.audit_logs
  for insert with check (company_id = public.current_company_id());

create policy "Company can view profiles" on public.profiles
  for select using (
    company_id = public.current_company_id()
    or user_id = auth.uid()
  );

create policy "Users/admin can insert profile" on public.profiles
  for insert with check (
    auth.uid() = user_id
    or current_user = 'postgres'
    or current_user = 'supabase_auth_admin'
    or current_user = 'service_role'
  );

create policy "Users/admin can update profile" on public.profiles
  for update using (
    auth.uid() = user_id
    or current_user = 'postgres'
    or current_user = 'supabase_auth_admin'
    or current_user = 'service_role'
  )
  with check (
    company_id = public.current_company_id()
    or current_user = 'postgres'
    or current_user = 'supabase_auth_admin'
    or current_user = 'service_role'
  );

-- ------------------------------------------------------------
-- 3) AUDITORIA DE CLIENTES/PRODUCTOS (CREAR/EDITAR/ELIMINAR)
-- ------------------------------------------------------------

alter table public.audit_logs
  add column if not exists user_name text;

alter table public.clients
  add column if not exists created_by uuid,
  add column if not exists created_by_name text,
  add column if not exists updated_by uuid,
  add column if not exists updated_by_name text;

alter table public.products
  add column if not exists created_by uuid,
  add column if not exists created_by_name text,
  add column if not exists updated_by uuid,
  add column if not exists updated_by_name text;

create or replace function public.resolve_actor_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p.display_name, p.email, 'Usuario')
  from public.profiles p
  where p.user_id = p_user_id
  limit 1;
$$;

create or replace function public.set_actor_columns_clients_products()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_name text;
begin
  v_uid := auth.uid();
  v_name := public.resolve_actor_name(v_uid);

  if tg_op = 'INSERT' then
    if new.created_by is null then new.created_by := v_uid; end if;
    if coalesce(new.created_by_name, '') = '' then new.created_by_name := v_name; end if;
    new.updated_by := v_uid;
    new.updated_by_name := v_name;
  elsif tg_op = 'UPDATE' then
    new.updated_by := v_uid;
    new.updated_by_name := v_name;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_clients_set_actor_columns on public.clients;
create trigger trg_clients_set_actor_columns
before insert or update on public.clients
for each row execute function public.set_actor_columns_clients_products();

drop trigger if exists trg_products_set_actor_columns on public.products;
create trigger trg_products_set_actor_columns
before insert or update on public.products
for each row execute function public.set_actor_columns_clients_products();

create or replace function public.audit_clients_products_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_name text;
  v_company uuid;
  v_module text;
  v_action text;
  v_entity_id text;
  v_entity_label text;
  v_details text;
begin
  v_uid := auth.uid();
  v_name := public.resolve_actor_name(v_uid);

  if tg_table_name = 'clients' then
    v_module := 'Clientes';
    if tg_op = 'DELETE' then
      v_company := old.company_id;
      v_entity_id := coalesce(old.id::text, 'N/A');
      v_entity_label := coalesce(old.name, 'Cliente');
    else
      v_company := new.company_id;
      v_entity_id := coalesce(new.id::text, 'N/A');
      v_entity_label := coalesce(new.name, 'Cliente');
    end if;
  else
    v_module := 'Inventario';
    if tg_op = 'DELETE' then
      v_company := old.company_id;
      v_entity_id := coalesce(old.id::text, 'N/A');
      v_entity_label := coalesce(old.name, 'Producto');
    else
      v_company := new.company_id;
      v_entity_id := coalesce(new.id::text, 'N/A');
      v_entity_label := coalesce(new.name, 'Producto');
    end if;
  end if;

  if tg_op = 'INSERT' then
    v_action := case when tg_table_name = 'clients' then 'Crear Cliente' else 'Crear Producto' end;
    v_details := format('%s %s (%s) creado por %s', v_module, v_entity_label, v_entity_id, coalesce(v_name, 'Usuario'));
  elsif tg_op = 'UPDATE' then
    v_action := case when tg_table_name = 'clients' then 'Editar Cliente' else 'Editar Producto' end;
    v_details := format('%s %s (%s) editado por %s', v_module, v_entity_label, v_entity_id, coalesce(v_name, 'Usuario'));
  else
    v_action := case when tg_table_name = 'clients' then 'Eliminar Cliente' else 'Eliminar Producto' end;
    v_details := format('%s %s (%s) eliminado por %s', v_module, v_entity_label, v_entity_id, coalesce(v_name, 'Usuario'));
  end if;

  insert into public.audit_logs (user_id, user_name, company_id, timestamp, module, action, details)
  values (
    v_uid,
    coalesce(v_name, 'Usuario'),
    v_company,
    now(),
    v_module,
    v_action,
    v_details
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_clients_audit_changes on public.clients;
create trigger trg_clients_audit_changes
after insert or update or delete on public.clients
for each row execute function public.audit_clients_products_changes();

drop trigger if exists trg_products_audit_changes on public.products;
create trigger trg_products_audit_changes
after insert or update or delete on public.products
for each row execute function public.audit_clients_products_changes();

-- ------------------------------------------------------------
-- 4) HISTORIAL FORMAL DE ABONOS Y ESTADOS DE CARTERA
-- ------------------------------------------------------------

create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  payment_id text not null,
  paid_at timestamptz not null,
  amount numeric(15,2) not null default 0,
  method text,
  reference text,
  user_id uuid,
  user_name text,
  source text not null default 'mixed_details.cartera.abonos',
  created_at timestamptz not null default now(),
  unique(invoice_id, payment_id)
);

create index if not exists idx_invoice_payments_company_id on public.invoice_payments(company_id);
create index if not exists idx_invoice_payments_invoice_id on public.invoice_payments(invoice_id);
create index if not exists idx_invoice_payments_paid_at on public.invoice_payments(paid_at desc);

create table if not exists public.invoice_status_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_at timestamptz not null default now(),
  changed_by uuid,
  changed_by_name text,
  notes text
);

create index if not exists idx_invoice_status_history_company_id on public.invoice_status_history(company_id);
create index if not exists idx_invoice_status_history_invoice_id on public.invoice_status_history(invoice_id);
create index if not exists idx_invoice_status_history_changed_at on public.invoice_status_history(changed_at desc);

create or replace function public.sync_invoice_payments_from_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_abono jsonb;
  v_payment_id text;
  v_paid_at timestamptz;
  v_amount numeric(15,2);
  v_method text;
  v_reference text;
  v_user_id uuid;
  v_user_name text;
begin
  if new.mixed_details is null then
    return new;
  end if;

  for v_abono in
    select value
    from jsonb_array_elements(coalesce(new.mixed_details->'cartera'->'abonos', '[]'::jsonb))
  loop
    v_payment_id := coalesce(
      nullif(v_abono->>'id', ''),
      md5(
        coalesce(new.id::text, '') || '|' ||
        coalesce(v_abono->>'date', '') || '|' ||
        coalesce(v_abono->>'amount', '') || '|' ||
        coalesce(v_abono->>'method', '') || '|' ||
        coalesce(v_abono->>'reference', '') || '|' ||
        coalesce(v_abono->>'user_id', '')
      )
    );

    v_paid_at := coalesce((v_abono->>'date')::timestamptz, now());
    v_amount := coalesce((v_abono->>'amount')::numeric, 0);
    v_method := nullif(v_abono->>'method', '');
    v_reference := nullif(v_abono->>'reference', '');
    v_user_id := nullif(v_abono->>'user_id', '')::uuid;
    v_user_name := nullif(v_abono->>'user_name', '');

    if v_user_name is null then
      v_user_name := nullif(v_abono->>'user', '');
    end if;

    insert into public.invoice_payments (
      company_id,
      invoice_id,
      payment_id,
      paid_at,
      amount,
      method,
      reference,
      user_id,
      user_name
    )
    values (
      new.company_id,
      new.id,
      v_payment_id,
      v_paid_at,
      v_amount,
      v_method,
      v_reference,
      v_user_id,
      v_user_name
    )
    on conflict (invoice_id, payment_id) do nothing;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_sync_invoice_payments on public.invoices;
create trigger trg_sync_invoice_payments
after insert or update of mixed_details on public.invoices
for each row execute function public.sync_invoice_payments_from_invoice();

create or replace function public.log_invoice_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_name text;
begin
  if tg_op = 'UPDATE' and coalesce(old.status, '') is distinct from coalesce(new.status, '') then
    v_uid := auth.uid();
    v_name := public.resolve_actor_name(v_uid);

    insert into public.invoice_status_history (
      company_id,
      invoice_id,
      old_status,
      new_status,
      changed_by,
      changed_by_name,
      notes
    )
    values (
      new.company_id,
      new.id,
      old.status,
      new.status,
      v_uid,
      coalesce(v_name, 'Usuario'),
      'Cambio de estado de cartera/factura'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_invoice_status_history on public.invoices;
create trigger trg_invoice_status_history
after update of status on public.invoices
for each row execute function public.log_invoice_status_change();

alter table public.invoice_payments enable row level security;
alter table public.invoice_status_history enable row level security;

DO $$
DECLARE
  p record;
BEGIN
  for p in
    select policyname from pg_policies where schemaname = 'public' and tablename = 'invoice_payments'
  loop
    execute format('drop policy if exists %I on public.invoice_payments', p.policyname);
  end loop;

  for p in
    select policyname from pg_policies where schemaname = 'public' and tablename = 'invoice_status_history'
  loop
    execute format('drop policy if exists %I on public.invoice_status_history', p.policyname);
  end loop;
END $$;

create policy "Company can view invoice_payments" on public.invoice_payments
  for select using (company_id = public.current_company_id());
create policy "Company can insert invoice_payments" on public.invoice_payments
  for insert with check (company_id = public.current_company_id());

create policy "Company can view invoice_status_history" on public.invoice_status_history
  for select using (company_id = public.current_company_id());
create policy "Company can insert invoice_status_history" on public.invoice_status_history
  for insert with check (company_id = public.current_company_id());

-- Backfill inicial de invoice_payments desde mixed_details existentes
insert into public.invoice_payments (
  company_id,
  invoice_id,
  payment_id,
  paid_at,
  amount,
  method,
  reference,
  user_id,
  user_name
)
select
  i.company_id,
  i.id,
  coalesce(
    nullif(a.elem->>'id', ''),
    md5(
      coalesce(i.id::text, '') || '|' ||
      coalesce(a.elem->>'date', '') || '|' ||
      coalesce(a.elem->>'amount', '') || '|' ||
      coalesce(a.elem->>'method', '') || '|' ||
      coalesce(a.elem->>'reference', '') || '|' ||
      coalesce(a.elem->>'user_id', '')
    )
  ) as payment_id,
  coalesce((a.elem->>'date')::timestamptz, i.date, now()) as paid_at,
  coalesce((a.elem->>'amount')::numeric, 0) as amount,
  nullif(a.elem->>'method', '') as method,
  nullif(a.elem->>'reference', '') as reference,
  nullif(a.elem->>'user_id', '')::uuid as user_id,
  coalesce(nullif(a.elem->>'user_name', ''), nullif(a.elem->>'user', '')) as user_name
from public.invoices i
cross join lateral jsonb_array_elements(coalesce(i.mixed_details->'cartera'->'abonos', '[]'::jsonb)) as a(elem)
on conflict (invoice_id, payment_id) do nothing;

-- Vista util para cartera con estados y abonos consolidados
create or replace view public.vw_cartera_historial as
select
  i.company_id,
  i.id as invoice_id,
  coalesce(i.mixed_details->>'invoiceCode', i.id::text) as invoice_code,
  i.client_name,
  i.client_doc,
  i.date,
  i.due_date,
  i.status,
  i.total,
  coalesce((i.mixed_details->'cartera'->>'balance')::numeric, case when lower(coalesce(i.status,'')) = 'pendiente' then i.total else 0 end) as balance,
  coalesce(sum(ip.amount), 0) as total_abonos,
  max(ip.paid_at) as ultimo_abono_at
from public.invoices i
left join public.invoice_payments ip on ip.invoice_id = i.id
group by i.company_id, i.id, i.client_name, i.client_doc, i.date, i.due_date, i.status, i.total, i.mixed_details;

-- ------------------------------------------------------------
-- 5) VERIFICACION RAPIDA
-- ------------------------------------------------------------
-- select user_id, email, role, company_id from public.profiles order by created_at;
-- select status, count(*) from public.invoices group by status order by status;
-- select count(*) as abonos_registrados from public.invoice_payments;
-- select module, action, timestamp, user_name, details from public.audit_logs order by timestamp desc limit 50;
