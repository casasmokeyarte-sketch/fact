-- Ejecutar en Supabase SQL Editor si shift_history no tiene policy UPDATE.
-- Permite cerrar una jornada abierta actualizando el mismo registro.

-- Esquema original por usuario
drop policy if exists "Users can update their own shift history" on public.shift_history;
create policy "Users can update their own shift history" on public.shift_history
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Esquema compartido por company_id
drop policy if exists "Company can update shift_history" on public.shift_history;
create policy "Company can update shift_history" on public.shift_history
  for update using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());
