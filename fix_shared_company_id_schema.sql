-- ============================================================
-- MIGRACION ADAPTADA: MODO EMPRESA COMPARTIDA
-- Para bases donde profiles usa "user_id" como PK
-- Ejecutar completo en Supabase SQL Editor
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- PASO 1: Agregar company_id a profiles
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_id uuid;

-- Asignar un company_id unico a todos los perfiles existentes
DO $$
DECLARE
  v_company_id uuid;
BEGIN
  -- Reusar uno existente si ya hay alguno (por ejecuciones parciales)
  SELECT company_id INTO v_company_id
  FROM public.profiles
  WHERE company_id IS NOT NULL
  ORDER BY created_at ASC NULLS LAST
  LIMIT 1;

  IF v_company_id IS NULL THEN
    v_company_id := gen_random_uuid();
    RAISE NOTICE 'Se genero un nuevo company_id: %', v_company_id;
  ELSE
    RAISE NOTICE 'Reutilizando company_id existente: %', v_company_id;
  END IF;

  UPDATE public.profiles
  SET company_id = v_company_id
  WHERE company_id IS NULL;
END $$;

ALTER TABLE public.profiles
  ALTER COLUMN company_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON public.profiles(company_id);

-- ============================================================
-- PASO 2: Funcion current_company_id() — profiles usa user_id como PK
-- ============================================================
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id
  FROM public.profiles
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO anon;

-- ============================================================
-- PASO 3: Agregar company_id a tablas de negocio
-- ============================================================
ALTER TABLE public.products              ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE public.clients               ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE public.invoices              ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE public.expenses              ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE public.purchases             ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE public.shift_history         ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE public.audit_logs            ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE public.external_cash_receipts ADD COLUMN IF NOT EXISTS company_id uuid;

-- ============================================================
-- PASO 4: Backfill — unir por user_id de cada tabla con profiles.user_id
-- ============================================================
UPDATE public.products t
SET company_id = p.company_id
FROM public.profiles p
WHERE t.company_id IS NULL AND t.user_id = p.user_id;

UPDATE public.clients t
SET company_id = p.company_id
FROM public.profiles p
WHERE t.company_id IS NULL AND t.user_id = p.user_id;

UPDATE public.invoices t
SET company_id = p.company_id
FROM public.profiles p
WHERE t.company_id IS NULL AND t.user_id = p.user_id;

UPDATE public.expenses t
SET company_id = p.company_id
FROM public.profiles p
WHERE t.company_id IS NULL AND t.user_id = p.user_id;

UPDATE public.purchases t
SET company_id = p.company_id
FROM public.profiles p
WHERE t.company_id IS NULL AND t.user_id = p.user_id;

UPDATE public.shift_history t
SET company_id = p.company_id
FROM public.profiles p
WHERE t.company_id IS NULL AND t.user_id = p.user_id;

UPDATE public.audit_logs t
SET company_id = p.company_id
FROM public.profiles p
WHERE t.company_id IS NULL AND t.user_id = p.user_id;

UPDATE public.external_cash_receipts t
SET company_id = p.company_id
FROM public.profiles p
WHERE t.company_id IS NULL AND t.user_id = p.user_id;

-- Cualquier fila remanente sin company_id la cae a la empresa principal
DO $$
DECLARE v_cid uuid;
BEGIN
  SELECT company_id INTO v_cid FROM public.profiles LIMIT 1;
  UPDATE public.products              SET company_id = v_cid WHERE company_id IS NULL;
  UPDATE public.clients               SET company_id = v_cid WHERE company_id IS NULL;
  UPDATE public.invoices              SET company_id = v_cid WHERE company_id IS NULL;
  UPDATE public.expenses              SET company_id = v_cid WHERE company_id IS NULL;
  UPDATE public.purchases             SET company_id = v_cid WHERE company_id IS NULL;
  UPDATE public.shift_history         SET company_id = v_cid WHERE company_id IS NULL;
  UPDATE public.audit_logs            SET company_id = v_cid WHERE company_id IS NULL;
  UPDATE public.external_cash_receipts SET company_id = v_cid WHERE company_id IS NULL;
END $$;

-- ============================================================
-- PASO 5: Defaults y NOT NULL en tablas de negocio
-- ============================================================
ALTER TABLE public.products               ALTER COLUMN company_id SET DEFAULT public.current_company_id();
ALTER TABLE public.clients                ALTER COLUMN company_id SET DEFAULT public.current_company_id();
ALTER TABLE public.invoices               ALTER COLUMN company_id SET DEFAULT public.current_company_id();
ALTER TABLE public.expenses               ALTER COLUMN company_id SET DEFAULT public.current_company_id();
ALTER TABLE public.purchases              ALTER COLUMN company_id SET DEFAULT public.current_company_id();
ALTER TABLE public.shift_history          ALTER COLUMN company_id SET DEFAULT public.current_company_id();
ALTER TABLE public.audit_logs             ALTER COLUMN company_id SET DEFAULT public.current_company_id();
ALTER TABLE public.external_cash_receipts ALTER COLUMN company_id SET DEFAULT public.current_company_id();

ALTER TABLE public.products               ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.clients                ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.invoices               ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.expenses               ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.purchases              ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.shift_history          ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.audit_logs             ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.external_cash_receipts ALTER COLUMN company_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_company_id               ON public.products(company_id);
CREATE INDEX IF NOT EXISTS idx_clients_company_id                ON public.clients(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_company_id               ON public.invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_expenses_company_id               ON public.expenses(company_id);
CREATE INDEX IF NOT EXISTS idx_purchases_company_id              ON public.purchases(company_id);
CREATE INDEX IF NOT EXISTS idx_shift_history_company_id          ON public.shift_history(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_id             ON public.audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_external_cash_receipts_company_id ON public.external_cash_receipts(company_id);

-- ============================================================
-- PASO 6: Trigger de signup — nuevos usuarios van a la misma empresa
-- (adaptado para profiles con PK "id")
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  SELECT company_id INTO v_company_id
  FROM public.profiles
  WHERE company_id IS NOT NULL
  LIMIT 1;

  IF v_company_id IS NULL THEN
    v_company_id := gen_random_uuid();
  END IF;

  BEGIN
    INSERT INTO public.profiles (user_id, email, display_name, company_id)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1)),
      v_company_id
    )
    ON CONFLICT (user_id) DO UPDATE
      SET company_id = EXCLUDED.company_id
      WHERE public.profiles.company_id IS NULL;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user error: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- PASO 7: RLS — eliminar policies antiguas y crear por company_id
-- ============================================================
DO $$
DECLARE
  t text;
  pol record;
  tabs text[] := ARRAY[
    'products','clients','invoices','invoice_items','expenses','purchases',
    'shift_history','audit_logs','profiles','external_cash_receipts'
  ];
BEGIN
  FOREACH t IN ARRAY tabs LOOP
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE FORMAT('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- PRODUCTS
CREATE POLICY "Company can view products"   ON public.products FOR SELECT USING (company_id = public.current_company_id());
CREATE POLICY "Company can insert products" ON public.products FOR INSERT WITH CHECK (company_id = public.current_company_id());
CREATE POLICY "Company can update products" ON public.products FOR UPDATE USING (company_id = public.current_company_id()) WITH CHECK (company_id = public.current_company_id());
CREATE POLICY "Company can delete products" ON public.products FOR DELETE USING (company_id = public.current_company_id());

-- CLIENTS
CREATE POLICY "Company can view clients"   ON public.clients FOR SELECT USING (company_id = public.current_company_id());
CREATE POLICY "Company can insert clients" ON public.clients FOR INSERT WITH CHECK (company_id = public.current_company_id());
CREATE POLICY "Company can update clients" ON public.clients FOR UPDATE USING (company_id = public.current_company_id()) WITH CHECK (company_id = public.current_company_id());
CREATE POLICY "Company can delete clients" ON public.clients FOR DELETE USING (company_id = public.current_company_id());

-- INVOICES
CREATE POLICY "Company can view invoices"   ON public.invoices FOR SELECT USING (company_id = public.current_company_id());
CREATE POLICY "Company can insert invoices" ON public.invoices FOR INSERT WITH CHECK (company_id = public.current_company_id());
CREATE POLICY "Company can update invoices" ON public.invoices FOR UPDATE USING (company_id = public.current_company_id()) WITH CHECK (company_id = public.current_company_id());
CREATE POLICY "Company can delete invoices" ON public.invoices FOR DELETE USING (company_id = public.current_company_id());

-- INVOICE ITEMS (via invoices.company_id)
CREATE POLICY "Company can view invoice_items" ON public.invoice_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_items.invoice_id AND i.company_id = public.current_company_id())
  );
CREATE POLICY "Company can insert invoice_items" ON public.invoice_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_items.invoice_id AND i.company_id = public.current_company_id())
  );

-- EXPENSES
CREATE POLICY "Company can view expenses"   ON public.expenses FOR SELECT USING (company_id = public.current_company_id());
CREATE POLICY "Company can insert expenses" ON public.expenses FOR INSERT WITH CHECK (company_id = public.current_company_id());
CREATE POLICY "Company can update expenses" ON public.expenses FOR UPDATE USING (company_id = public.current_company_id()) WITH CHECK (company_id = public.current_company_id());

-- PURCHASES
CREATE POLICY "Company can view purchases"   ON public.purchases FOR SELECT USING (company_id = public.current_company_id());
CREATE POLICY "Company can insert purchases" ON public.purchases FOR INSERT WITH CHECK (company_id = public.current_company_id());
CREATE POLICY "Company can update purchases" ON public.purchases FOR UPDATE USING (company_id = public.current_company_id()) WITH CHECK (company_id = public.current_company_id());

-- SHIFT HISTORY
CREATE POLICY "Company can view shift_history"   ON public.shift_history FOR SELECT USING (company_id = public.current_company_id());
CREATE POLICY "Company can insert shift_history" ON public.shift_history FOR INSERT WITH CHECK (company_id = public.current_company_id());
CREATE POLICY "Company can update shift_history" ON public.shift_history FOR UPDATE USING (company_id = public.current_company_id()) WITH CHECK (company_id = public.current_company_id());

-- AUDIT LOGS
CREATE POLICY "Company can view audit_logs"   ON public.audit_logs FOR SELECT USING (company_id = public.current_company_id());
CREATE POLICY "Company can insert audit_logs" ON public.audit_logs FOR INSERT WITH CHECK (company_id = public.current_company_id());

-- EXTERNAL CASH RECEIPTS
CREATE POLICY "Company can view external_cash_receipts"   ON public.external_cash_receipts FOR SELECT USING (company_id = public.current_company_id());
CREATE POLICY "Company can insert external_cash_receipts" ON public.external_cash_receipts FOR INSERT WITH CHECK (company_id = public.current_company_id());
CREATE POLICY "Company can update external_cash_receipts" ON public.external_cash_receipts FOR UPDATE USING (company_id = public.current_company_id()) WITH CHECK (company_id = public.current_company_id());
CREATE POLICY "Company can delete external_cash_receipts" ON public.external_cash_receipts FOR DELETE USING (company_id = public.current_company_id());

-- PROFILES
CREATE POLICY "Company can view profiles" ON public.profiles
  FOR SELECT USING (company_id = public.current_company_id());

CREATE POLICY "Users/admin can insert profile" ON public.profiles
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    OR current_user = 'postgres'
    OR current_user = 'supabase_auth_admin'
  );

CREATE POLICY "Users/admin can update profile" ON public.profiles
  FOR UPDATE USING (
    auth.uid() = user_id
    OR current_user = 'postgres'
    OR current_user = 'supabase_auth_admin'
  )
  WITH CHECK (
    company_id = public.current_company_id()
    OR current_user = 'postgres'
    OR current_user = 'supabase_auth_admin'
  );

-- ============================================================
-- PASO 8: Habilitar RLS (idempotente)
-- ============================================================
ALTER TABLE public.clients                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_history          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_cash_receipts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- VERIFICACION FINAL
-- ============================================================
SELECT user_id, email, role, company_id FROM public.profiles ORDER BY created_at;

SELECT
  count(*)                     AS total_productos,
  count(company_id)            AS con_company_id,
  count(*) - count(company_id) AS sin_company_id
FROM public.products;

-- Debe devolver un UUID (ejecutar autenticado como cualquier usuario)
SELECT public.current_company_id();
