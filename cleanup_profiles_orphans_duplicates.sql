-- ============================================================
-- LIMPIEZA: perfiles huerfanos y duplicados en public.profiles
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1) Diagnostico de perfiles sin usuario en auth.users
select p.user_id, p.email, p.company_id, p.created_at, p.updated_at
from public.profiles p
left join auth.users u on u.id = p.user_id
where u.id is null
order by p.updated_at desc nulls last, p.created_at desc nulls last;

-- 2) Diagnostico de emails duplicados dentro de la misma empresa
select
  p.company_id,
  lower(p.email) as email_normalizado,
  count(*) as total
from public.profiles p
where p.email is not null
  and btrim(p.email) <> ''
group by p.company_id, lower(p.email)
having count(*) > 1
order by total desc, email_normalizado;

-- 3) Eliminar perfiles huerfanos (sin fila en auth.users)
delete from public.profiles p
where not exists (
  select 1 from auth.users u where u.id = p.user_id
);

-- 4) Eliminar duplicados por (company_id, email), conservando el mas reciente
with ranked as (
  select
    p.ctid,
    row_number() over (
      partition by p.company_id, lower(p.email)
      order by coalesce(p.updated_at, p.created_at) desc nulls last,
               p.created_at desc nulls last,
               p.user_id desc
    ) as rn
  from public.profiles p
  where p.email is not null
    and btrim(p.email) <> ''
)
delete from public.profiles p
using ranked r
where p.ctid = r.ctid
  and r.rn > 1;

-- 5) Verificacion final
select p.user_id, p.email, p.company_id, p.created_at, p.updated_at
from public.profiles p
left join auth.users u on u.id = p.user_id
where u.id is null;

select
  p.company_id,
  lower(p.email) as email_normalizado,
  count(*) as total
from public.profiles p
where p.email is not null
  and btrim(p.email) <> ''
group by p.company_id, lower(p.email)
having count(*) > 1;
