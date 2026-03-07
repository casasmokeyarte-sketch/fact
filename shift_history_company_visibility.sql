-- Corrige visibilidad compartida de cierres de jornada por empresa.
-- Ejecutar en Supabase SQL Editor.

create extension if not exists pgcrypto;

alter table public.shift_history
  add column if not exists company_id uuid;

update public.shift_history sh
set company_id = p.company_id
from public.profiles p
where sh.company_id is null
  and sh.user_id = p.user_id;

update public.shift_history
set company_id = (
  select company_id
  from public.profiles
  where company_id is not null
  limit 1
)
where company_id is null;

alter table public.shift_history
  alter column company_id set default public.current_company_id();

create index if not exists idx_shift_history_company_id
  on public.shift_history(company_id);

drop policy if exists "Users can view their own shift history" on public.shift_history;
drop policy if exists "Users can insert their own shift history" on public.shift_history;
drop policy if exists "Users can update their own shift history" on public.shift_history;
drop policy if exists "Company can view shift_history" on public.shift_history;
drop policy if exists "Company can insert shift_history" on public.shift_history;
drop policy if exists "Company can update shift_history" on public.shift_history;

create policy "Company can view shift_history" on public.shift_history
  for select using (company_id = public.current_company_id());

create policy "Company can insert shift_history" on public.shift_history
  for insert with check (company_id = public.current_company_id());

create policy "Company can update shift_history" on public.shift_history
  for update using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());
