-- Asigna rol Supervisor al usuario dptoventas@casasmokeyarte.com
-- Ejecutar en Supabase SQL Editor

DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id
  INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower('dptoventas@casasmokeyarte.com')
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No existe usuario auth.users con email dptoventas@casasmokeyarte.com';
  END IF;

  INSERT INTO public.profiles (user_id, email, display_name, role, permissions)
  VALUES (
    v_user_id,
    'dptoventas@casasmokeyarte.com',
    'DPTO VENTAS',
    'Supervisor',
    jsonb_build_object(
      'facturacion', true,
      'cartera', true,
      'compras', true,
      'clientes', true,
      'caja', true,
      'inventario', true,
      'codigos', true,
      'reportes', true,
      'bitacora', true,
      'config', false,
      'trueque', true,
      'gastos', true,
      'notas', true,
      'historial', true,
      'cierres', true
    )
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    permissions = EXCLUDED.permissions,
    updated_at = now();
END $$;

-- Verificacion
SELECT user_id, email, display_name, role, permissions
FROM public.profiles
WHERE lower(email) = lower('dptoventas@casasmokeyarte.com');
