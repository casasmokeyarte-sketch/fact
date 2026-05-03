-- Base tecnica minima para Facturacion Electronica DIAN (Software Propio)
-- Ejecutar en Supabase SQL Editor (schema public)
-- Objetivo: dejar configuracion DIAN + cola documental + trazabilidad

create extension if not exists pgcrypto;

-- 1) Configuracion DIAN por empresa
create table if not exists public.fe_dian_settings (
  company_id uuid primary key default public.current_company_id(),
  environment text not null default 'habilitacion' check (environment in ('habilitacion', 'produccion')),
  software_id text,
  software_pin text,
  test_set_id text,
  issuer_nit text,
  issuer_dv text,
  issuer_legal_name text,
  cert_storage_path text,
  cert_alias text,
  fe_prefix text not null default 'SETP',
  issuer_address text,
  issuer_email text,
  enabled boolean not null default false,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Cola de documentos electronicos
create table if not exists public.fe_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id(),
  invoice_id uuid references public.invoices(id) on delete set null,
  source_type text not null default 'invoice' check (source_type in ('invoice', 'manual', 'api')),
  doc_type text not null check (doc_type in ('factura', 'nota_credito', 'nota_debito')),
  prefix text not null,
  sequence_number bigint not null,
  issue_date timestamptz not null default now(),
  currency text not null default 'COP',
  xml_unsigned text,
  xml_signed text,
  cufe text,
  qr_payload text,
  dian_track_id text,
  status text not null default 'pending' check (status in ('pending', 'signed', 'sent', 'validated', 'rejected', 'error')),
  attempt_count int not null default 0,
  last_error text,
  sent_at timestamptz,
  validated_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, doc_type, prefix, sequence_number)
);

create index if not exists idx_fe_documents_company_status_date
  on public.fe_documents(company_id, status, created_at desc);

create index if not exists idx_fe_documents_company_prefix_seq
  on public.fe_documents(company_id, prefix, sequence_number desc);

create unique index if not exists uq_fe_documents_company_cufe
  on public.fe_documents(company_id, cufe)
  where cufe is not null;

-- 3) Eventos y trazas de interaccion con DIAN
create table if not exists public.fe_document_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id(),
  document_id uuid not null references public.fe_documents(id) on delete cascade,
  event_type text not null check (event_type in (
    'xml_generated',
    'sign_attempt',
    'sign_error',
    'signed',
    'send_attempt',
    'send_error',
    'sent',
    'status_check',
    'status_polled',
    'validated',
    'rejected',
    'error'
  )),
  detail text,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_fe_document_events_document_created
  on public.fe_document_events(document_id, created_at desc);

create index if not exists idx_fe_document_events_company_created
  on public.fe_document_events(company_id, created_at desc);

-- 4) Trigger de updated_at
create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_fe_dian_settings_updated_at on public.fe_dian_settings;
create trigger trg_fe_dian_settings_updated_at
before update on public.fe_dian_settings
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_fe_documents_updated_at on public.fe_documents;
create trigger trg_fe_documents_updated_at
before update on public.fe_documents
for each row execute function public.set_updated_at_timestamp();

-- 5) Permisos y RLS
grant usage on schema public to authenticated;
grant select, insert, update on table public.fe_dian_settings to authenticated;
grant select, insert, update on table public.fe_documents to authenticated;
grant select, insert on table public.fe_document_events to authenticated;

alter table public.fe_dian_settings enable row level security;
alter table public.fe_documents enable row level security;
alter table public.fe_document_events enable row level security;

-- fe_dian_settings policies

drop policy if exists "FE settings read" on public.fe_dian_settings;
create policy "FE settings read"
on public.fe_dian_settings
for select
to authenticated
using (public.current_company_id() is not null and company_id = public.current_company_id());

drop policy if exists "FE settings write" on public.fe_dian_settings;
create policy "FE settings write"
on public.fe_dian_settings
for all
to authenticated
using (public.current_company_id() is not null and company_id = public.current_company_id())
with check (public.current_company_id() is not null and company_id = public.current_company_id());

-- fe_documents policies

drop policy if exists "FE documents read" on public.fe_documents;
create policy "FE documents read"
on public.fe_documents
for select
to authenticated
using (public.current_company_id() is not null and company_id = public.current_company_id());

drop policy if exists "FE documents insert" on public.fe_documents;
create policy "FE documents insert"
on public.fe_documents
for insert
to authenticated
with check (public.current_company_id() is not null and company_id = public.current_company_id());

drop policy if exists "FE documents update" on public.fe_documents;
create policy "FE documents update"
on public.fe_documents
for update
to authenticated
using (public.current_company_id() is not null and company_id = public.current_company_id())
with check (public.current_company_id() is not null and company_id = public.current_company_id());

-- fe_document_events policies

drop policy if exists "FE events read" on public.fe_document_events;
create policy "FE events read"
on public.fe_document_events
for select
to authenticated
using (public.current_company_id() is not null and company_id = public.current_company_id());

drop policy if exists "FE events insert" on public.fe_document_events;
create policy "FE events insert"
on public.fe_document_events
for insert
to authenticated
with check (public.current_company_id() is not null and company_id = public.current_company_id());

-- 6) Comentarios de uso rapido
-- Inserta o actualiza configuracion base en public.fe_dian_settings por empresa.
-- Crea filas en public.fe_documents cuando una factura quede lista para FE.
-- Registra cada intento/respuesta en public.fe_document_events.

-- Si ya ejecutaste la migracion anterior sin fe_prefix/issuer_address/issuer_email, aplica:
alter table public.fe_dian_settings add column if not exists fe_prefix text not null default 'SETP';
alter table public.fe_dian_settings add column if not exists issuer_address text;
alter table public.fe_dian_settings add column if not exists issuer_email text;

-- Compatibilidad: permitir todos los event_type usados por los endpoints FE.
do $$
declare
  _constraint_name text;
begin
  select c.conname
    into _constraint_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'fe_document_events'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%event_type%'
  limit 1;

  if _constraint_name is not null then
    execute format('alter table public.fe_document_events drop constraint %I', _constraint_name);
  end if;
end $$;

alter table public.fe_document_events
  add constraint fe_document_events_event_type_check
  check (event_type in (
    'xml_generated',
    'sign_attempt',
    'sign_error',
    'signed',
    'send_attempt',
    'send_error',
    'sent',
    'status_check',
    'status_polled',
    'validated',
    'rejected',
    'error'
  ));
