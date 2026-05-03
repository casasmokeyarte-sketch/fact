-- Resoluciones de numeracion DIAN por empresa
-- Ejecutar en Supabase SQL Editor (schema public)
-- Prerequisito: dian_software_propio_base.sql ejecutado

-- Tabla de resoluciones de facturacion
create table if not exists public.fe_numbering_resolutions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id(),
  doc_type text not null default 'factura' check (doc_type in ('factura', 'nota_credito', 'nota_debito')),
  prefix text not null,
  resolution_number text not null,
  resolution_date date not null,
  technical_key text not null,
  from_number bigint not null,
  to_number bigint not null,
  valid_date_from date not null,
  valid_date_to date not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, doc_type, prefix, resolution_number)
);

-- Tabla de consecutivo actual por resolucion
create table if not exists public.fe_numbering_counters (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id(),
  resolution_id uuid not null references public.fe_numbering_resolutions(id) on delete cascade,
  last_number bigint not null default 0,
  updated_at timestamptz not null default now(),
  unique (company_id, resolution_id)
);

-- Trigger de updated_at (reutiliza funcion ya creada)
drop trigger if exists trg_fe_numbering_resolutions_updated_at on public.fe_numbering_resolutions;
create trigger trg_fe_numbering_resolutions_updated_at
before update on public.fe_numbering_resolutions
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_fe_numbering_counters_updated_at on public.fe_numbering_counters;
create trigger trg_fe_numbering_counters_updated_at
before update on public.fe_numbering_counters
for each row execute function public.set_updated_at_timestamp();

-- Indices
create index if not exists idx_fe_numbering_resolutions_company
  on public.fe_numbering_resolutions(company_id, doc_type, active);

create index if not exists idx_fe_numbering_counters_resolution
  on public.fe_numbering_counters(resolution_id);

-- Funcion: obtener siguiente numero de la resolucion activa (serializado)
create or replace function public.fe_next_sequence(
  p_company_id uuid,
  p_doc_type text,
  p_prefix text
)
returns table(
  resolution_id uuid,
  resolution_number text,
  technical_key text,
  prefix text,
  sequence_number bigint,
  valid_date_from date,
  valid_date_to date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_uid uuid;
  v_jwt_role text;
  v_user_company_id uuid;
  v_resolution_id uuid;
  v_resolution_number text;
  v_technical_key text;
  v_from bigint;
  v_to bigint;
  v_last bigint;
  v_next bigint;
  v_valid_from date;
  v_valid_to date;
begin
  -- Autorizacion:
  -- 1) Si hay usuario autenticado, su company_id debe coincidir con p_company_id.
  -- 2) Si no hay auth.uid(), solo permitimos service_role/supabase_admin/postgres.
  v_auth_uid := auth.uid();
  v_jwt_role := coalesce(current_setting('request.jwt.claim.role', true), '');

  if p_company_id is null then
    raise exception 'company_id es obligatorio';
  end if;

  if v_auth_uid is not null then
    select pr.company_id
    into v_user_company_id
    from public.profiles pr
    where pr.user_id = v_auth_uid
    limit 1;

    if v_user_company_id is null or v_user_company_id <> p_company_id then
      raise exception 'No autorizado para company_id=%', p_company_id;
    end if;
  elsif v_jwt_role not in ('service_role', 'supabase_admin', 'postgres') then
    raise exception 'No autorizado para ejecutar fe_next_sequence sin sesion de usuario';
  end if;

  -- Tomar la resolucion activa con lock para evitar concurrencia
  select
    r.id, r.resolution_number, r.technical_key, r.from_number, r.to_number,
    r.valid_date_from, r.valid_date_to
  into
    v_resolution_id, v_resolution_number, v_technical_key, v_from, v_to,
    v_valid_from, v_valid_to
  from public.fe_numbering_resolutions r
  where r.company_id = p_company_id
    and r.doc_type = p_doc_type
    and r.prefix = p_prefix
    and r.active = true
    and r.valid_date_from <= current_date
    and r.valid_date_to >= current_date
  order by r.resolution_date desc
  limit 1
  for update;

  if v_resolution_id is null then
    raise exception 'No hay resolucion activa para company_id=%, doc_type=%, prefix=%',
      p_company_id, p_doc_type, p_prefix;
  end if;

  -- Obtener o crear el contador
  insert into public.fe_numbering_counters (company_id, resolution_id, last_number)
  values (p_company_id, v_resolution_id, v_from - 1)
  on conflict (company_id, resolution_id) do nothing;

  select c.last_number into v_last
  from public.fe_numbering_counters c
  where c.company_id = p_company_id and c.resolution_id = v_resolution_id
  for update;

  v_next := v_last + 1;

  if v_next > v_to then
    raise exception 'Resolucion % agotada: ultimo numero disponible fue %', v_resolution_number, v_to;
  end if;

  update public.fe_numbering_counters
  set last_number = v_next, updated_at = now()
  where company_id = p_company_id and resolution_id = v_resolution_id;

  return query select
    v_resolution_id,
    v_resolution_number,
    v_technical_key,
    p_prefix,
    v_next,
    v_valid_from,
    v_valid_to;
end;
$$;

-- Cerrar ejecucion por defecto para roles no deseados
revoke execute on function public.fe_next_sequence(uuid, text, text) from public;
revoke execute on function public.fe_next_sequence(uuid, text, text) from anon;

grant execute on function public.fe_next_sequence(uuid, text, text) to authenticated;
grant execute on function public.fe_next_sequence(uuid, text, text) to service_role;

-- Permisos y RLS
grant usage on schema public to authenticated;
grant select, insert, update on table public.fe_numbering_resolutions to authenticated;
grant select, insert, update on table public.fe_numbering_counters to authenticated;

alter table public.fe_numbering_resolutions enable row level security;
alter table public.fe_numbering_counters enable row level security;

drop policy if exists "FE numbering resolutions read" on public.fe_numbering_resolutions;
create policy "FE numbering resolutions read"
on public.fe_numbering_resolutions for select to authenticated
using (public.current_company_id() is not null and company_id = public.current_company_id());

drop policy if exists "FE numbering resolutions write" on public.fe_numbering_resolutions;
create policy "FE numbering resolutions write"
on public.fe_numbering_resolutions for all to authenticated
using (public.current_company_id() is not null and company_id = public.current_company_id())
with check (public.current_company_id() is not null and company_id = public.current_company_id());

drop policy if exists "FE numbering counters read" on public.fe_numbering_counters;
create policy "FE numbering counters read"
on public.fe_numbering_counters for select to authenticated
using (public.current_company_id() is not null and company_id = public.current_company_id());

drop policy if exists "FE numbering counters write" on public.fe_numbering_counters;
create policy "FE numbering counters write"
on public.fe_numbering_counters for all to authenticated
using (public.current_company_id() is not null and company_id = public.current_company_id())
with check (public.current_company_id() is not null and company_id = public.current_company_id());

-- Ejemplo: insertar resolucion de habilitacion de pruebas
-- insert into public.fe_numbering_resolutions (
--   company_id, doc_type, prefix, resolution_number, resolution_date,
--   technical_key, from_number, to_number, valid_date_from, valid_date_to
-- ) values (
--   public.current_company_id(), 'factura', 'SETP', '18760000001',
--   '2019-01-19',
--   'fc8eac422eba16e22ffd8c6f94b3f40a6e38162c',
--   990000000, 995000000,
--   '2019-01-19', '2030-01-19'
-- );
