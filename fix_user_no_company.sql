-- ============================================================
-- REPARAR: Usuario sin company_id (pantalla "Sin Organizacion")
-- Usuario: dptoventas@casasmokeyarte.com
-- UUID:    29714b02-ad7e-4d3d-96d0-a3179d8296e5
-- Ejecutar en: Supabase SQL Editor (dashboard.supabase.com)
-- ============================================================

-- PASO 1: Ver que company_id tienen los demas perfiles
SELECT user_id, email, role, company_id
FROM public.profiles
ORDER BY CASE WHEN lower(coalesce(role,'')) = 'administrador' THEN 0 ELSE 1 END, created_at;

-- PASO 2: Asignar el company_id del administrador (o cualquier usuario que ya lo tenga)
--         al perfil de dptoventas@casasmokeyarte.com
DO $$
DECLARE
  v_company_id uuid;
BEGIN
  -- Tomar el company_id del administrador (o el primero disponible)
  SELECT company_id INTO v_company_id
  FROM public.profiles
  WHERE company_id IS NOT NULL
  ORDER BY
    CASE WHEN lower(coalesce(role,'')) = 'administrador' THEN 0 ELSE 1 END,
    created_at ASC NULLS LAST
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No existe ningun perfil con company_id. Revisa la tabla companies o contacta soporte.';
  END IF;

  UPDATE public.profiles
  SET company_id = v_company_id
  WHERE user_id = '29714b02-ad7e-4d3d-96d0-a3179d8296e5'
    AND company_id IS NULL;

  IF FOUND THEN
    RAISE NOTICE 'OK - company_id % asignado a dptoventas@casasmokeyarte.com', v_company_id;
  ELSE
    RAISE NOTICE 'El perfil ya tenia company_id o no se encontro el user_id.';
  END IF;
END $$;

-- PASO 3: Verificar resultado
SELECT user_id, email, role, company_id
FROM public.profiles
WHERE user_id = '29714b02-ad7e-4d3d-96d0-a3179d8296e5';
