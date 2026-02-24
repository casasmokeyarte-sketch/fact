# ✅ CHECKLIST DE INTEGRACIÓN SUPABASE

## 📋 FASE 1: SETUP INICIAL

- [ ] Crear proyecto en Supabase (https://supabase.com)
- [ ] Copiar credenciales a `.env.local`
- [ ] Verificar que `npm run dev` inicia sin errores
- [ ] Probar página de login/registro
- [ ] Crear usuario de prueba en auth

## 📊 FASE 2: BASE DE DATOS

- [ ] Ejecutar `database.sql` en SQL Editor
- [ ] Verificar que se crearon todas las tablas
- [ ] Habilitar RLS en todas las tablas
- [ ] Crear policies de seguridad
- [ ] Crear índices para rendimiento

**Verificación:**
```sql
-- Verificar tablas
SELECT * FROM information_schema.tables WHERE table_schema = 'public';

-- Verificar RLS habilitado
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
AND rowsecurity = true;
```

## 🔐 FASE 3: AUTENTICACIÓN

- [ ] Login funciona
- [ ] Signup funciona
- [ ] Logout funciona
- [ ] El usuario se persiste al recargar
- [ ] El token se guarda en localStorage

**Pruebas:**
```
- Registrar: test@example.com / Test123456!
- Verificar en Dashboard → Authentication → Users
- Logout y login nuevamente
- Recargar página - debe mantener sesión
```

## 📱 FASE 4: INTEGRACIÓN POR MÓDULO

### ClientModule
- [ ] Lee clientes de Supabase (en lugar de mock)
- [ ] Crear cliente guarda en BD
- [ ] Editar cliente actualiza en BD
- [ ] Eliminar cliente borra de BD
- [ ] Verificar user_id se guarda correctamente
- [ ] RLS funciona (solo ve sus clientes)

**Código base:**
```javascript
import { useSupabase } from '../lib/useSupabase'
import { getClients, createClient } from '../lib/databaseService'

// Ver EJEMPLO_ClientModule_Supabase.jsx
```

### InventoryModule
- [ ] Lee productos de Supabase
- [ ] Crear producto guarda en BD
- [ ] Editar producto actualiza en BD
- [ ] Stock se guarda en BD
- [ ] Búsqueda funciona
- [ ] Reorden level se respeta

**Código base:**
```javascript
import { useSupabase } from '../lib/useSupabase'
import { getProducts, createProduct, updateProduct } from '../lib/databaseService'

// Ver EJEMPLO_InventoryModule_Supabase.jsx
```

### MainCashier (Facturación)
- [ ] Crear factura guarda en BD
- [ ] Crear items de factura
- [ ] Obtener último número de factura
- [ ] Buscar clientes desde BD
- [ ] Buscar productos desde BD
- [ ] Calcular totales correctamente

**Código base:**
```javascript
import { createInvoice } from '../lib/databaseService'

const { data: invoice, error } = await createInvoice({
  user_id: currentUser.id,
  client_id: selectedClient?.id,
  invoice_date: new Date().toISOString().split('T')[0],
  subtotal,
  tax,
  total,
  status: 'pending'
})
```

### GastosModule
- [ ] Crear gasto guarda en BD
- [ ] Listar gastos desde BD
- [ ] Filtrar por fecha
- [ ] Totales calculan correctamente

### ShiftManager/Turnos
- [ ] Crear turno guarda en BD
- [ ] Cerrar turno actualiza en BD
- [ ] Historial de turnos se lee de BD
- [ ] Sales total calcula correctamente

### CarteraModule (Créditos)
- [ ] Historial de pagos se guarda en BD
- [ ] Saldos se actualizan
- [ ] RLS funciona (solo ve sus créditos)

### ReportsModule
- [ ] Reportes leen desde BD
- [ ] Filtros por fecha funcionan
- [ ] Exportar Excel funciona

### AuditLog
- [ ] Cada acción se registra en `audit_logs`
- [ ] Mostrar logs por usuario
- [ ] Filtrar por fecha y tipo de acción

## 🎨 FASE 5: STORAGE (Opcional)

- [ ] Crear buckets de storage
- [ ] Subir imagen de producto
- [ ] Obtener URL pública
- [ ] Mostrar imagen en producto

```javascript
import { uploadFile, getPublicUrl } from '../lib/storageService'

// Subir imagen
const { data, error } = await uploadFile(
  'products-images',
  `${productId}.jpg`,
  imageFile
)

// Obtener URL
const url = getPublicUrl('products-images', `${productId}.jpg`)
```

## 🔄 FASE 6: TIEMPO REAL (Opcional)

- [ ] Suscribirse a cambios en una tabla
- [ ] Actualizar UI cuando cambian datos en otra sesión
- [ ] Unsubscribe al desmontar componente

```javascript
const { subscribe } = useSupabase()

useEffect(() => {
  const unsubscribe = subscribe('products', (payload) => {
    console.log('Cambio detectado:', payload)
    // Actualizar estado
  })

  return unsubscribe
}, [])
```

## 🧪 FASE 7: TESTING

### Pruebas de Seguridad
- [ ] Usuario A no puede ver datos de Usuario B
- [ ] Cambiar token inválido → error
- [ ] RLS bloquea queries sin user_id

```javascript
// Test manual: cambiar token en base de datos
// No deberías poder acceder a datos de otros usuarios
```

### Pruebas de Funcionalidad
- [ ] Crear → Leer → Actualizar → Eliminar (CRUD)
- [ ] Búsqueda funciona
- [ ] Filtros funcionan
- [ ] Totales calculan correctamente
- [ ] Relaciones entre tablas funcionan (clientes → facturas)

### Pruebas de Rendimiento
- [ ] Página carga en <2 segundos
- [ ] Lista de 1000+ items funciona
- [ ] Búsqueda es rápida

## 📈 FASE 8: PRODUCCIÓN

- [ ] Variables de entorno en hosting
- [ ] Enable realtime policies en Supabase
- [ ] Auto-scaling configurado
- [ ] Backups configurados
- [ ] Logs monitoreados

---

## 🚀 COMANDOS ÚTILES

```bash
# Desarrollo
npm run dev

# Compilar
npm run build

# Preview
npm run preview

# Linting
npm run lint

# Ver variables de entorno (sin exponerlas)
echo $VITE_SUPABASE_URL

# Tests (si tienes)
npm test
```

---

## 📞 CHECKLIST DE DEBUGGING

Si algo no funciona:

1. ¿Hay error en consola? (F12)
2. ¿Token de autenticación es válido?
3. ¿Usuario existe en `auth.users`?
4. ¿RLS policy existe para esa acción?
5. ¿user_id en la fila coincide con auth.uid()?
6. ¿Column names usan snake_case (user_id, not userId)?
7. ¿Importaste el módulo correcto?

```sql
-- Debug útil
SELECT * FROM auth.users;
SELECT * FROM clients WHERE user_id = 'xxxxxxx';
SELECT * FROM information_schema.role_table_grants 
WHERE table_schema = 'public';
```

---

## 📚 RECURSOS

- Documentación: https://supabase.com/docs
- API Docs: https://supabase.com/docs/reference/javascript
- Community: https://supabase.com/community

---

## ✨ NOTAS IMPORTANTES

- **Nunca commits `.env.local`** - Agrega a `.gitignore`
- **RLS es obligatorio** para segurid
- **user_id es la clave** para multi-tenancy
- **snake_case en BD**, camelCase en JS
- **Siempre usa `import.meta.env`** en Vite

---

Última actualización: 13 feb 2026
Versión: 1.0
