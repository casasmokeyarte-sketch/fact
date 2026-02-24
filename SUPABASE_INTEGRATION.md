# 📚 GUÍA DE INTEGRACIÓN SUPABASE - FACT

## ✅ Completado

1. **✅ Variables de entorno** configuradas en `.env.local`
2. **✅ Cliente Supabase** importado desde variables de entorno
3. **✅ Servicios creados:**
   - `authService.js` - Autenticación (signup, signin, signout)
   - `databaseService.js` - CRUD para todas las tablas
   - `storageService.js` - Subir/descargar archivos
   - `useSupabase.js` - Hook personalizado para React

4. **✅ Componente AuthPage** para login/registro
5. **✅ Integración auth en App.jsx**
6. **✅ Database schema** con RLS (Row Level Security)

---

## 🚀 PRÓXIMOS PASOS

### 1. **Crear Proyecto en Supabase**
   - Ir a https://supabase.com
   - Crear nuevo proyecto (ejemplo: "fact-app")
   - Copiar la URL y anon key
   - Pegar en `.env.local`

### 2. **Ejecutar SQL en Supabase**
   - En Dashboard → SQL Editor → New Query
   - Copiar TODO el contenido de `database.sql`
   - Pegar en el editor
   - Ejecutar (▶️)

### 3. **Crear Buckets de Storage** (opcional para fotos de productos)
   - Dashboard → Storage → New Bucket
   - Crear: `products-images` (público)
   - Crear: `invoices-pdf` (privado)

### 4. **Integrar en cada módulo**

#### Ejemplo: ClientModule.jsx
```javascript
import { useSupabase } from '../lib/useSupabase'
import { createClient, getClients, updateClient, deleteClient } from '../lib/databaseService'

export function ClientModule() {
  const { user, fetchData, addData, updateData, deleteData } = useSupabase()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(false)

  // Cargar clientes
  useEffect(() => {
    if (!user) return

    const loadClients = async () => {
      setLoading(true)
      const { data, error } = await getClients(user.id)
      if (!error) {
        setClients(data)
      }
      setLoading(false)
    }

    loadClients()
  }, [user])

  // Agregar cliente
  const handleAddClient = async (clientData) => {
    const { data, error } = await createClient({
      ...clientData,
      user_id: user.id
    })
    if (!error) {
      setClients([...clients, data])
    }
  }

  // Resto del código...
}
```

#### Ejemplo: InventoryModule.jsx
```javascript
import { getProducts, createProduct, updateProduct } from '../lib/databaseService'

export function InventoryModule() {
  const { user } = useSupabase()
  const [products, setProducts] = useState([])

  useEffect(() => {
    if (!user) return
    
    const loadProducts = async () => {
      const { data } = await getProducts(user.id)
      setProducts(data || [])
    }

    loadProducts()
  }, [user])

  // Resto del código...
}
```

### 5. **Integración con MainCashier (Facturación)**

```javascript
import { createInvoice } from '../lib/databaseService'
import { uploadFile } from '../lib/storageService'

const handleCreateInvoice = async (invoiceData) => {
  const { data: invoice, error } = await createInvoice({
    user_id: currentUser.id,
    ...invoiceData,
    status: 'pending'
  })

  if (!error) {
    // Guardar PDF si lo tienes
    // await uploadFile('invoices-pdf', `${invoice.id}.pdf`, pdfBlob)
    console.log('Factura creada:', invoice)
  }
}
```

### 6. **Realizar sync de datos locales → Supabase**

Si ya tienes datos en `mockData.js`, crea un script de migración:

```javascript
import { MOCK_PRODUCTS } from './data/mockData'
import { createProduct } from './lib/databaseService'

async function migrateProducts(userId) {
  for (const product of MOCK_PRODUCTS) {
    await createProduct({
      ...product,
      user_id: userId
    })
  }
  console.log('Migración completada')
}

// Ejecutar en la consola del navegador cuando sea necesario
```

---

## 🔐 SEGURIDAD

- **RLS Habilitado**: Cada usuario solo ve sus datos
- **Variables de entorno**: Mantener `.env.local` en `.gitignore`
- **Tokens JWT**: Supabase maneja automáticamente
- **HTTPS**: Obligatorio en producción

---

## 📊 TABLAS DISPONIBLES

| Tabla | Descripción | Campos |
|-------|-------|--------|
| `products` | Catálogo de productos | id, user_id, name, price, quantity, barcode... |
| `clients` | Clientes registrados | id, user_id, name, email, document, credit_limit... |
| `invoices` | Facturas/recibos | id, user_id, client_id, total, status, date... |
| `invoice_items` | Ítems de facturas | invoice_id, product_id, quantity, price... |
| `expenses` | Gastos/egresos | id, user_id, category, amount, date... |
| `shifts` | Histórico de turnos | id, user_id, start_time, end_time, sales_total... |
| `payments` | Registro de pagos | id, user_id, invoice_id, amount, date... |
| `bartering` | Registro de trueques | id, user_id, date, items_given, items_received... |
| `audit_logs` | Bitácora de auditoría | id, user_id, action, table_name, timestamp... |

---

## 🆘 SOLUCIÓN DE PROBLEMAS

### Error: "Las variables de entorno de Supabase no están configuradas"
- Verifica que `.env.local` tenga `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
- Reinicia el servidor: `npm run dev`

### Error: "user has no role"
- Habilita RLS en la tabla
- Crea las policies correspondientes

### No puedo ver mis datos
- Verifica que `user_id` en la BD coincida con `auth.uid()`
- Revisa las policies de RLS

### ¿Necesito migrar datos existentes?
- Usa el script de migración mencionado arriba
- O importa CSV desde el Dashboard de Supabase

---

## 💡 TIPS

1. **Testing en Supabase Studio**:
   - Dashboard → Editor SQL
   - Escribe queries directamente

2. **Ver logs de errores**:
   - Console del navegador (F12)
   - Dashboard Supabase → Logs

3. **Realizar backups**:
   - Dashboard → Settings → Database Backup

4. **Escalabilidad**:
   - Supabase es serverless y auto-escala
   - Ideal para apps medianas

---

## 📞 SOPORTE

Documentación oficial: https://supabase.com/docs
Community: https://supabase.com/community

¡Éxito con la integración! 🚀
