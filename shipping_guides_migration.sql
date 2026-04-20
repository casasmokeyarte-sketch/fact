-- ============================================================
-- MIGRACION: TABLA DE GUIAS DE ENVIO
-- Ejecutar en Supabase SQL Editor
-- Compatible con modo empresa compartida
-- ============================================================

create extension if not exists pgcrypto;

-- 1) Secuencia global para consecutivo interno de guias
create sequence if not exists public.shipping_guides_seq start 1;

-- 2) Tabla principal
create table if not exists public.shipping_guides (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id(),
  invoice_id uuid null references public.invoices(id) on delete set null,
  client_id uuid null references public.clients(id) on delete set null,
  user_id uuid not null default auth.uid(),

  guide_sequence bigint not null default nextval('public.shipping_guides_seq'),
  guide_number text not null,
  barcode_value text not null,

  recipient_name text not null,
  recipient_document text null,
  recipient_phone text null,
  recipient_address text null,
  destination_city text null,

  package_count integer not null default 1,
  declared_content text null,
  notes text null,
  delivery_instructions text null,
  courier_name text null,

  payment_status text not null default 'PAGADO',
  shipping_status text not null default 'GENERADA',
  amount_to_collect numeric(12,2) not null default 0,
  invoice_total numeric(12,2) not null default 0,

  printed_count integer not null default 0,
  last_printed_at timestamptz null,
  delivered_at timestamptz null,
  cancelled_at timestamptz null,

  policy_snapshot jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),

  constraint shipping_guides_package_count_check check (package_count >= 1),
  constraint shipping_guides_printed_count_check check (printed_count >= 0),
  constraint shipping_guides_amount_to_collect_check check (amount_to_collect >= 0),
  constraint shipping_guides_invoice_total_check check (invoice_total >= 0),
  constraint shipping_guides_payment_status_check check (payment_status in ('PAGADO', 'PENDIENTE', 'CONTRAENTREGA', 'PARCIAL')),
  constraint shipping_guides_shipping_status_check check (shipping_status in ('GENERADA', 'IMPRESA', 'DESPACHADA', 'EN_RUTA', 'ENTREGADA', 'DEVUELTA', 'CANCELADA'))
);

-- 3) Funcion para updated_at
create or replace function public.set_shipping_guides_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_shipping_guides_updated_at on public.shipping_guides;
create trigger trg_shipping_guides_updated_at
before update on public.shipping_guides
for each row execute function public.set_shipping_guides_updated_at();

-- 4) Funcion helper para generar consecutivo visible
create or replace function public.format_shipping_guide_number(seq_value bigint)
returns text
language sql
immutable
as $$
  select 'GE-' || lpad(seq_value::text, 8, '0');
$$;

-- 5) Autocompletar numero y barcode si llegan vacios
create or replace function public.fill_shipping_guide_defaults()
returns trigger
language plpgsql
as $$
begin
  if new.guide_sequence is null or new.guide_sequence <= 0 then
    new.guide_sequence := nextval('public.shipping_guides_seq');
  end if;

  if new.guide_number is null or btrim(new.guide_number) = '' then
    new.guide_number := public.format_shipping_guide_number(new.guide_sequence);
  end if;

  if new.barcode_value is null or btrim(new.barcode_value) = '' then
    new.barcode_value := new.guide_number;
  end if;

  if new.company_id is null then
    new.company_id := public.current_company_id();
  end if;

  if new.user_id is null then
    new.user_id := auth.uid();
  end if;

  if new.recipient_name is null or btrim(new.recipient_name) = '' then
    new.recipient_name := 'Destinatario pendiente';
  end if;

  if new.policy_snapshot is null then
    new.policy_snapshot := '[]'::jsonb;
  end if;

  if new.metadata is null then
    new.metadata := '{}'::jsonb;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_fill_shipping_guide_defaults on public.shipping_guides;
create trigger trg_fill_shipping_guide_defaults
before insert on public.shipping_guides
for each row execute function public.fill_shipping_guide_defaults();

-- 6) Indices
create unique index if not exists idx_shipping_guides_company_guide_number
  on public.shipping_guides(company_id, guide_number);

create index if not exists idx_shipping_guides_company_id
  on public.shipping_guides(company_id);

create index if not exists idx_shipping_guides_invoice_id
  on public.shipping_guides(invoice_id);

create index if not exists idx_shipping_guides_client_id
  on public.shipping_guides(client_id);

create index if not exists idx_shipping_guides_user_id
  on public.shipping_guides(user_id);

create index if not exists idx_shipping_guides_status
  on public.shipping_guides(company_id, shipping_status, payment_status);

create index if not exists idx_shipping_guides_created_at
  on public.shipping_guides(created_at desc);

-- 7) RLS
alter table public.shipping_guides enable row level security;

drop policy if exists "Company can view shipping_guides" on public.shipping_guides;
drop policy if exists "Company can insert shipping_guides" on public.shipping_guides;
drop policy if exists "Company can update shipping_guides" on public.shipping_guides;
drop policy if exists "Company can delete shipping_guides" on public.shipping_guides;

create policy "Company can view shipping_guides" on public.shipping_guides
  for select using (company_id = public.current_company_id());

create policy "Company can insert shipping_guides" on public.shipping_guides
  for insert with check (company_id = public.current_company_id());

create policy "Company can update shipping_guides" on public.shipping_guides
  for update using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy "Company can delete shipping_guides" on public.shipping_guides
  for delete using (company_id = public.current_company_id());

-- 8) Comentarios utiles
comment on table public.shipping_guides is 'Guias de envio para paquetes, ligadas opcionalmente a facturas y clientes.';
comment on column public.shipping_guides.guide_number is 'Consecutivo visible tipo GE-00000001';
comment on column public.shipping_guides.barcode_value is 'Valor usado para imprimir el codigo de barras';
comment on column public.shipping_guides.policy_snapshot is 'Politicas o condiciones impresas en el momento de generar la guia';
comment on column public.shipping_guides.metadata is 'Campos flexibles adicionales para transportadora, observaciones o integraciones';

-- 9) Verificacion rapida
-- select * from public.shipping_guides order by created_at desc limit 20;
-- insert into public.shipping_guides (recipient_name, recipient_document, recipient_phone, recipient_address, package_count, declared_content)
-- values ('Cliente Prueba', '123456', '3000000000', 'Direccion prueba', 1, 'Mercancia segun factura')
-- returning id, company_id, guide_number, barcode_value;
