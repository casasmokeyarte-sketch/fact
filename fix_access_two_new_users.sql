-- ============================================================
-- REPARAR ACCESO: usuarios nuevos no pueden entrar
-- Usuarios:
--   j.sebascarrillo@hotmail.com
--   kata.bermeo@gmail.com
-- Ejecutar en Supabase SQL Editor
-- ============================================================

create extension if not exists pgcrypto;

-- 1) Diagnostico inicial
select u.id as auth_user_id, u.email
from auth.users u
where lower(u.email) in (
  'j.sebascarrillo@hotmail.com',
  'kata.bermeo@gmail.com'
)
order by u.email;

select p.user_id, p.email, p.role, p.company_id
from public.profiles p
where lower(p.email) in (
  'j.sebascarrillo@hotmail.com',
  'kata.bermeo@gmail.com'
)
order by p.email;

-- Diagnostico consolidado: estado por email
with target_emails as (
  select 'j.sebascarrillo@hotmail.com'::text as email
  union all
  select 'kata.bermeo@gmail.com'::text as email
)
select
  t.email,
  u.id as auth_user_id,
  p.user_id as profile_user_id,
  p.company_id,
  case
    when u.id is null then 'NO_EXISTE_EN_AUTH_USERS'
    when p.user_id is null then 'FALTA_PROFILE'
    when p.company_id is null then 'SIN_COMPANY_ID'
    else 'LISTO_PARA_LOGIN'
  end as diagnostico
from target_emails t
left join auth.users u on lower(u.email) = t.email
left join public.profiles p on p.user_id = u.id
order by t.email;

-- 2) Repara/crea perfil de esos usuarios con company_id valido
do $$
declare
  v_company_id uuid;
begin
  select company_id
    into v_company_id
  from public.profiles
  where company_id is not null
  order by case when lower(coalesce(role, '')) = 'administrador' then 0 else 1 end,
           created_at asc nulls last
  limit 1;

  if v_company_id is null then
    v_company_id := gen_random_uuid();
  end if;

  insert into public.profiles (user_id, email, display_name, role, company_id)
  select
    u.id,
    lower(u.email),
    coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), split_part(lower(u.email), '@', 1)),
    'Cajero',
    v_company_id
  from auth.users u
  where lower(u.email) in (
    'j.sebascarrillo@hotmail.com',
    'kata.bermeo@gmail.com'
  )
  on conflict (user_id) do update
    set email = excluded.email,
        display_name = coalesce(public.profiles.display_name, excluded.display_name),
        company_id = coalesce(public.profiles.company_id, excluded.company_id);

  update public.profiles p
  set company_id = v_company_id
  where lower(p.email) in (
    'j.sebascarrillo@hotmail.com',
    'kata.bermeo@gmail.com'
  )
    and p.company_id is null;
end $$;

-- 3) Verificacion final (ambos deben salir con company_id no nulo)
select
  p.user_id,
  p.email,
  p.role,
  p.company_id,
  case when p.company_id is null then 'PENDIENTE' else 'OK' end as estado
from public.profiles p
where lower(p.email) in (
  'j.sebascarrillo@hotmail.com',
  'kata.bermeo@gmail.com'
)
order by p.email;

-- Verificacion consolidada final
with target_emails as (
  select 'j.sebascarrillo@hotmail.com'::text as email
  union all
  select 'kata.bermeo@gmail.com'::text as email
)
select
  t.email,
  u.id as auth_user_id,
  p.user_id as profile_user_id,
  p.company_id,
  case
    when u.id is null then 'NO_EXISTE_EN_AUTH_USERS'
    when p.user_id is null then 'FALTA_PROFILE'
    when p.company_id is null then 'SIN_COMPANY_ID'
    else 'OK'
  end as estado_final
from target_emails t
left join auth.users u on lower(u.email) = t.email
left join public.profiles p on p.user_id = u.id
order by t.email;

-- 4) (Opcional) Si no existe trigger de alta para futuros usuarios, recrearlo
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
  order by created_at asc nulls last
  limit 1;

  if v_company_id is null then
    v_company_id := gen_random_uuid();
  end if;

  insert into public.profiles (user_id, email, display_name, role, company_id)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(lower(new.email), '@', 1)),
    'Cajero',
    v_company_id
  )
  on conflict (user_id) do update
    set email = excluded.email,
        company_id = coalesce(public.profiles.company_id, excluded.company_id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
