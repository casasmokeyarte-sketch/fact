-- ============================================================
-- REPARACION: Usuarios no pueden ver el inventario
-- Ejecutar en Supabase SQL Editor (dashboard.supabase.com)
-- ============================================================
-- Este script diagnostica y repara las causas mas comunes por
-- las que Cajero/Supervisor no ven productos en Inventario.
-- ============================================================

-- ---- PASO 1: DIAGNOSTICO ----

-- Ver perfiles actuales (debes ver todos los usuarios con company_id)
-- Si alguno tiene company_id = NULL, ese usuario no puede ver nada.
SELECT user_id, email, role, company_id
FROM public.profiles
ORDER BY role, created_at;

-- Ver cuantos productos existen y si tienen company_id
SELECT
  count(*)                        AS total_productos,
  count(company_id)               AS con_company_id,
  count(*) - count(company_id)    AS sin_company_id,
  count(DISTINCT company_id)      AS empresas_distintas
FROM public.products;

-- Verificar que la funcion current_company_id() existe y devuelve algo
-- (Ejecutar logeado como cualquier usuario autenticado)
-- SELECT public.current_company_id();

-- Ver las politicas RLS activas en productos
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'products';

-- Ver las politicas RLS activas en perfiles
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles';


-- ---- PASO 2: REPARAR function current_company_id() ----
-- (idempotente: reemplaza si ya existe)

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


-- ---- PASO 3: UNIFICAR company_id EN TODOS LOS PERFILES ----
-- Toma el company_id del administrador (o cualquier perfil que ya tenga uno)
-- y lo asigna a todos los perfiles que no lo tienen.

DO $$
DECLARE
  v_company_id uuid;
BEGIN
  -- Preferir el company_id del administrador
  SELECT company_id INTO v_company_id
  FROM public.profiles
  WHERE company_id IS NOT NULL
  ORDER BY
    CASE WHEN lower(coalesce(role, '')) = 'administrador' THEN 0 ELSE 1 END,
    created_at ASC NULLS LAST
  LIMIT 1;

  IF v_company_id IS NULL THEN
    v_company_id := gen_random_uuid();
    RAISE NOTICE 'No habia company_id existente; se genero uno nuevo: %', v_company_id;
  END IF;

  -- Asignar a todos los perfiles sin company_id
  UPDATE public.profiles
  SET company_id = v_company_id
  WHERE company_id IS NULL;

  RAISE NOTICE 'Perfiles reparados con company_id = %', v_company_id;
END $$;


-- ---- PASO 4: BACKFILL company_id EN PRODUCTOS ----
-- Asigna el company_id del creador (user_id) a los productos que no lo tienen.

UPDATE public.products t
SET company_id = p.company_id
FROM public.profiles p
WHERE t.company_id IS NULL AND t.user_id = p.user_id;

-- Si quedan productos sin company_id (porque no tienen user_id valido),
-- asignarles el de la empresa principal:
UPDATE public.products
SET company_id = (
  SELECT company_id FROM public.profiles
  ORDER BY CASE WHEN lower(coalesce(role, '')) = 'administrador' THEN 0 ELSE 1 END
  LIMIT 1
)
WHERE company_id IS NULL;


-- ---- PASO 5: REPARAR POLITICAS RLS EN PRODUCTS ----
-- Asegura que existan las 4 politicas CRUD con company_id.

-- SELECT
DROP POLICY IF EXISTS "Company can view products" ON public.products;
CREATE POLICY "Company can view products" ON public.products
  FOR SELECT USING (company_id = public.current_company_id());

-- INSERT
DROP POLICY IF EXISTS "Company can insert products" ON public.products;
CREATE POLICY "Company can insert products" ON public.products
  FOR INSERT WITH CHECK (company_id = public.current_company_id());

-- UPDATE
DROP POLICY IF EXISTS "Company can update products" ON public.products;
CREATE POLICY "Company can update products" ON public.products
  FOR UPDATE
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

-- DELETE
DROP POLICY IF EXISTS "Company can delete products" ON public.products;
CREATE POLICY "Company can delete products" ON public.products
  FOR DELETE USING (company_id = public.current_company_id());

-- Activar RLS (idempotente)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;


-- ---- PASO 6: REPARAR POLITICA RLS DE PERFILES (corte dependencia circular) ----
-- Se agrega "OR user_id = auth.uid()" para que cada usuario siempre
-- pueda leer su propio perfil incluso si current_company_id() retorna NULL.

DROP POLICY IF EXISTS "Company can view profiles" ON public.profiles;
CREATE POLICY "Company can view profiles" ON public.profiles
  FOR SELECT USING (
    company_id = public.current_company_id()
    OR user_id = auth.uid()
  );

-- Politica de INSERT (preservar la que ya existe o crearla)
DROP POLICY IF EXISTS "Users/admin can insert profile" ON public.profiles;
CREATE POLICY "Users/admin can insert profile" ON public.profiles
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    OR current_user = 'postgres'
    OR current_user = 'supabase_auth_admin'
    OR current_user = 'service_role'
  );

-- Politica de UPDATE
DROP POLICY IF EXISTS "Users/admin can update profile" ON public.profiles;
CREATE POLICY "Users/admin can update profile" ON public.profiles
  FOR UPDATE
  USING (
    auth.uid() = user_id
    OR current_user = 'postgres'
    OR current_user = 'supabase_auth_admin'
    OR current_user = 'service_role'
  )
  WITH CHECK (
    company_id = public.current_company_id()
    OR current_user = 'postgres'
    OR current_user = 'supabase_auth_admin'
    OR current_user = 'service_role'
  );

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;


-- ---- PASO 7: VERIFICACION FINAL ----
-- Ejecutar estas queries para confirmar que todo esta correcto:

-- 1. Todos los perfiles deben tener el MISMO company_id
SELECT user_id, email, role, company_id
FROM public.profiles
ORDER BY role;

-- 2. Todos los productos deben tener company_id
SELECT count(*) AS total, count(company_id) AS con_company_id
FROM public.products;

-- 3. Las politicas deben aparecer en la lista
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('products', 'profiles')
ORDER BY tablename, cmd;
