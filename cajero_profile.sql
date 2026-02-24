-- ========================================
-- CREAR PERFIL DE ROL CAJERO
-- ========================================
-- INSTRUCCIONES: 
-- 1. Reemplaza 'EMAIL_DEL_CAJERO_AQUI' con el email real del usuario cajero
-- 2. Ejecuta este SQL en el SQL Editor de Supabase
-- ========================================

INSERT INTO profiles (user_id, email, display_name, role, permissions)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'EMAIL_DEL_CAJERO_AQUI'),
  'EMAIL_DEL_CAJERO_AQUI',
  'Cajero',
  'Cajero',
  jsonb_build_object(
    -- FACTURACIÓN: Acceso normal para facturar
    'facturacion', true,
    
    -- CARTERA: Solo ver y abonar (no cancelar facturas completas)
    'cartera', jsonb_build_object(
      'ver', true,
      'abonar', true,
      'cancelar', false,
      'notificar', false
    ),
    
    -- COMPRAS: Acceso completo
    'compras', true,
    
    -- CLIENTES: Solo crear clientes ESTÁNDAR (sin niveles de crédito ni exportación)
    'clientes', jsonb_build_object(
      'ver', true,
      'crear', true,
      'editar', false,
      'eliminar', false,
      'exportar', false,
      'importar', false,
      'solo_estandar', true
    ),
    
    -- CAJA: Modo Transferencia (recibir/devolver dinero de/a caja mayor)
    'caja', jsonb_build_object(
      'ver', true,
      'transferir', true,
      'mover_efectivo', false,
      'distribuir_inventario', false
    ),
    
    -- INVENTARIO: Solo lectura (no puede editar ni eliminar)
    'inventario', jsonb_build_object(
      'ver', true,
      'crear', false,
      'editar', false,
      'eliminar', false,
      'exportar', false,
      'importar', false,
      'hacer_conteo', false
    ),
    
    -- CÓDIGOS DE BARRAS: Acceso completo
    'codigos', true,
    
    -- REPORTES: Solo imprimir (no exportar a Excel/JSON)
    'reportes', jsonb_build_object(
      'ver', true,
      'imprimir', true,
      'exportar', false
    ),
    
    -- BITÁCORA: Sin acceso
    'bitacora', false,
    
    -- CONFIGURACIÓN: Sin acceso
    'config', false,
    
    -- TRUEQUE: Acceso normal
    'trueque', true,
    
    -- GASTOS: Solo registro normal (no edición)
    'gastos', jsonb_build_object(
      'ver', true,
      'crear', true,
      'editar', false,
      'eliminar', false
    ),
    
    -- NOTAS: Acceso normal
    'notas', true,
    
    -- HISTORIAL: Acceso completo
    'historial', true,
    
    -- CIERRES DE TURNO: Sin acceso
    'cierres', false
  )
)
ON CONFLICT (user_id) 
DO UPDATE SET
  role = EXCLUDED.role,
  permissions = EXCLUDED.permissions,
  updated_at = NOW();
