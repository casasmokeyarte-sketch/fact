-- Crear tabla de saldos de caja por usuario para sincronizar entre equipos.

create table if not exists public.user_cash_balances (
  cash_key text primary key,
  user_id uuid not null references auth.users(id),
  user_name text,
  balance numeric(15,2) not null default 0,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_user_cash_balances_user_id on public.user_cash_balances(user_id);

alter table public.user_cash_balances enable row level security;

drop policy if exists "Users can view their own user cash balances" on public.user_cash_balances;
create policy "Users can view their own user cash balances" on public.user_cash_balances
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert their own user cash balances" on public.user_cash_balances;
create policy "Users can insert their own user cash balances" on public.user_cash_balances
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own user cash balances" on public.user_cash_balances;
create policy "Users can update their own user cash balances" on public.user_cash_balances
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Si tu proyecto usa company_id compartido, ejecuta tambien esto:
alter table public.user_cash_balances add column if not exists company_id uuid;
create index if not exists idx_user_cash_balances_company_id on public.user_cash_balances(company_id);

drop policy if exists "Company can view user_cash_balances" on public.user_cash_balances;
create policy "Company can view user_cash_balances" on public.user_cash_balances
  for select using (company_id = public.current_company_id());

drop policy if exists "Company can insert user_cash_balances" on public.user_cash_balances;
create policy "Company can insert user_cash_balances" on public.user_cash_balances
  for insert with check (company_id = public.current_company_id());

drop policy if exists "Company can update user_cash_balances" on public.user_cash_balances;
create policy "Company can update user_cash_balances" on public.user_cash_balances
  for update using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());
