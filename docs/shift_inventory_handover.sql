-- Control de inventario por turno
-- Ejecutar en Supabase SQL Editor

alter table public.shift_history
  add column if not exists inventory_assignment jsonb not null default '[]'::jsonb;

alter table public.shift_history
  add column if not exists inventory_assigned_at timestamptz;

alter table public.shift_history
  add column if not exists inventory_closure jsonb not null default '{}'::jsonb;

alter table public.shift_history
  add column if not exists inventory_status text not null default 'OPEN';

create index if not exists idx_shift_history_inventory_status
  on public.shift_history(inventory_status);
