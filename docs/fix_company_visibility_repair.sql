-- Reparacion: unificar company_id para que todos los usuarios vean
-- los mismos clientes, productos y demas datos compartidos.
-- Ejecutar en Supabase SQL Editor.

create extension if not exists pgcrypto;

do $$
declare
  v_company_id uuid;
  t text;
  tables_with_company text[] := array[
    'profiles',
    'products',
    'clients',
    'invoices',
    'expenses',
    'purchases',
    'audit_logs',
    'shift_history',
    'user_cash_balances',
    'company_settings',
    'inventory_transfer_requests',
    'commercial_notes',
    'external_cash_receipts'
  ];
begin
  select company_id into v_company_id
  from public.profiles
  where company_id is not null
  order by case when lower(coalesce(role, '')) = 'administrador' then 0 else 1 end, created_at asc nulls last
  limit 1;

  if v_company_id is null then
    v_company_id := gen_random_uuid();
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'company_id'
  ) then
    execute format(
      'update public.profiles set company_id = %L where company_id is distinct from %L',
      v_company_id,
      v_company_id
    );
  end if;

  foreach t in array tables_with_company loop
    if t = 'profiles' then
      continue;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = t
        and column_name = 'company_id'
    ) then
      execute format(
        'update public.%I set company_id = %L where company_id is distinct from %L or company_id is null',
        t,
        v_company_id,
        v_company_id
      );
    end if;
  end loop;
end $$;

-- Verificacion rapida:
-- select user_id, email, role, company_id from public.profiles order by created_at;
-- select count(*) as products_ok from public.products where company_id = public.current_company_id();
-- select count(*) as clients_ok from public.clients where company_id = public.current_company_id();
