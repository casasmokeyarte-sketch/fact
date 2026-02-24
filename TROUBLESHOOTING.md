# 🆘 TROUBLESHOOTING - INTEGRACIÓN SUPABASE

## 🚫 Errores Comunes y Soluciones

### 1. "Las variables de entorno de Supabase no están configuradas"

**Causa:** `.env.local` falta o está vacío

**Solución:**
```bash
# Verifica que .env.local existe en la raíz del proyecto
cat .env.local

# Debe contenerse:
# VITE_SUPABASE_URL=https://xxxxx.supabase.co
# VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

**Pasos:**
1. Abre [.env.local](.env.local)
2. Pega tu URL y Key de Supabase
3. Guarda el archivo
4. Reinicia: `npm run dev`

---

### 2. "Auth error: invalid_request or invalid_grant"

**Causa:** Las credenciales son incorrectas o el usuario no existe

**Solución:**
1. Verifica email y contraseña
2. Verifica en Supabase Dashboard → Authentication → Users
3. Si no existe, regístrate primero
4. Usa un password fuerte (mínimo 6 caracteres)

**Prueba:**
```
Email: test@example.com
Password: Test123456! (con número y mayúscula)
```

---

### 3. "Column 'user_id' doesn't exist" o error RLS

**Causa:** La tabla no se creó correctamente o falta el campo user_id

**Solución:**
1. Ir a Dashboard → SQL Editor
2. Ejecutar:
```sql
-- Ver estructura de la tabla
\d products;

-- Si falta user_id, agregarlo:
ALTER TABLE products ADD COLUMN user_id UUID NOT NULL DEFAULT auth.uid();
ALTER TABLE products ADD CONSTRAINT fk_products_user 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
```

---

### 4. "user_id is not in the list of column definitions"

**Causa:** El INSERT no incluye user_id

**Solución:**
```javascript
// ❌ INCORRECTO
const { data } = await supabase
  .from('products')
  .insert([{ name: 'Test' }])

// ✅ CORRECTO
const { data } = await supabase
  .from('products')
  .insert([{ 
    name: 'Test',
    user_id: currentUser.id  // Agregar esto
  }])
```

---

### 5. "SELECT policy for 'public.products' violates RLS"

**Causa:** No hay policy SELECT configurada

**Solución:**
Ejecutar en SQL Editor:
```sql
CREATE POLICY "Users can view their own products" ON products
  FOR SELECT USING (auth.uid() = user_id);
```

---

### 6. "no rows returned" cuando hay datos

**Causa:** RLS policy bloquea la query

**Solución:**
Verificar:
1. ¿El user_id en la fila = auth.uid() actual?
2. ¿La policy existe?

```sql
-- Verificar políticas
SELECT * FROM pg_policies 
WHERE tablename = 'products';

-- Ver datos sin filtro (como admin)
SELECT * FROM products;

-- Ver datos del usuario actual (debe funcionar)
SELECT * FROM products WHERE user_id = auth.uid();
```

---

### 7. Auth state no persiste después de recargar

**Causa:** No se llama a `onAuthStateChange`

**Solución:**
En [App.jsx](src/App.jsx) debe estar:
```javascript
useEffect(() => {
  const subscription = onAuthStateChange((event, session) => {
    if (session?.user) {
      setIsLoggedIn(true)
      setCurrentUser(session.user)
    }
  })
  return subscription?.unsubscribe
}, [])
```

---

### 8. "Cannot read property 'id' of undefined" cuando accedes a user

**Causa:** user es null/undefined, código intenta acceder antes de cargar

**Solución:**
```javascript
// ❌ INCORRECTO
const userId = user.id  // user podría ser undefined

// ✅ CORRECTO
const userId = user?.id  // Optional chaining

// ✅ MEJOR AÚN
useEffect(() => {
  if (!user) return  // No continuar si no hay user
  // Ahora user está garantizado
}, [user])
```

---

### 9. Datos de otro usuario visible

**CRÍTICO:** ¡Problema de seguridad!

**Causa:** Falta RLS o policy incorrecta

**Solución Inmediata:**
```sql
-- Habilitar RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Crear policy correcta
DROP POLICY IF EXISTS "Users can view their own products" ON products;

CREATE POLICY "Users can view their own products" ON products
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own products" ON products
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own products" ON products
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own products" ON products
  FOR DELETE USING (auth.uid() = user_id);
```

---

### 10. "CORS error" o "No 'Access-Control-Allow-Origin'"

**Causa:** CORS no configurado en Supabase

**Solución:**
1. Dashboard → Settings → API
2. Bajo CORS, agregar tu dominio:
   - Local: `http://localhost:5173`
   - Producción: `https://tudominio.com`

---

### 11. Storage: "Permission denied" al subir archivo

**Causa:** Bucket no es público o no hay policy

**Solución:**
```sql
-- Crear policy para storage
CREATE POLICY "Allow authenticated uploads" ON storage.objects
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow public downloads" ON storage.objects
  FOR SELECT USING (true);
```

O desde Dashboard:
1. Storage → Seleccionar bucket
2. Policies → New Policy
3. Seleccionar template "Enable insert for authenticated users"

---

### 12. Variables de entorno no se actualizan

**Causa:** Vite cachea variables

**Solución:**
```bash
# Limpiar y reiniciar
rm -rf node_modules/.vite
npm run dev
```

---

### 13. "VITE_SUPABASE_URL is undefined"

**Causa:** Variable no se lee en tiempo de compilación

**Solución:**
1. Las variables DEBEN empezar con `VITE_`
2. Reinicia después de editar `.env.local`
3. Usa `import.meta.env.VITE_SUPABASE_URL`

```javascript
// ❌ INCORRECTO
const url = process.env.VITE_SUPABASE_URL

// ✅ CORRECTO
const url = import.meta.env.VITE_SUPABASE_URL
```

---

### 14. RLS policy funciona pero es lenta

**Causa:** Falta índice o query ineficiente

**Solución:**
```sql
-- Crear índice
CREATE INDEX idx_products_user_id ON products(user_id);
CREATE INDEX idx_invoices_user_id ON invoices(user_id);
CREATE INDEX idx_invoices_client_id ON invoices(client_id);

-- Ver índices
SELECT * FROM pg_indexes WHERE schemaname = 'public';
```

---

### 15. "Trying to show a toast but no toast manager exists"

**Causa:** Componente intenta mostrar notificación sin contexto

**Solución:**
```javascript
// ✅ Usa alert() simple por ahora
alert('Error: ' + error.message)

// ✅ O crea un simple div de error
const [error, setError] = useState(null)

{error && <div style={{ color: 'red' }}>{error}</div>}
```

---

## 🔍 CHECKLIST DE DEBUG

Cuando algo no funciona:

```javascript
// 1. Ver usuario actual
const { user } = await supabase.auth.getUser()
console.log('Usuario actual:', user)

// 2. Ver token
const { data } = await supabase.auth.getSession()
console.log('Token:', data?.session?.access_token)

// 3. Probar query directa
const { data, error } = await supabase
  .from('products')
  .select('*')
console.log('Datos:', data, 'Error:', error)

// 4. Verificar en consola
// Abre: Dashboard → Logs
// Busca: mensajes de error
```

---

## 📊 QUERIES DE DEBUG EN SQL EDITOR

```sql
-- Ver usuarios autenticados
SELECT id, email, created_at FROM auth.users;

-- Ver todas las tablas
SELECT tablename FROM pg_tables WHERE schemaname = 'public';

-- Ver structure de una tabla
\d products

-- Ver si RLS está activado
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';

-- Ver policies
SELECT * FROM pg_policies 
WHERE tablename = 'products';

-- Ver datos de un usuario específico
SELECT * FROM products 
WHERE user_id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';

-- Contar registros por usuario
SELECT user_id, COUNT(*) as total 
FROM products 
GROUP BY user_id;
```

---

## 🔧 RESETEAR TODO (Nuclear Option)

Si está muy dañado:

```bash
# 1. Eliminar datos locales
rm -rf node_modules
rm -rf .next (si aplica)
npm cache clean --force

# 2. Reinstalar
npm install

# 3. Limpiar env
rm .env.local
# Crea .env.local nuevamente con credenciales

# 4. Reiniciar servidor
npm run dev
```

En Supabase:
1. Dashboard → SQL Editor
2. Ejecutar:
```sql
-- CUIDADO: Esto elimina TODO
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
```
3. Volver a ejecutar [database.sql](database.sql)

---

## 📞 DÓNDE PEDIR AYUDA

- **Docs oficiales:** https://supabase.com/docs
- **Stack Overflow:** Tag `supabase`
- **Discord:** https://discord.supabase.io
- **GitHub Issues:** https://github.com/supabase/supabase

---

## 💡 TIPS FINALES

1. **Siempre verifica user_id**
   ```javascript
   console.log('Usuario actual:', currentUser?.id)
   ```

2. **Habilita logs en Supabase**
   - Dashboard → Logs → Selecciona tabla

3. **Usa debounce en búsquedas**
   ```javascript
   const [searchTerm, setSearchTerm] = useState('')
   
   useEffect(() => {
     const timer = setTimeout(() => {
       // Query aquí
     }, 500)
     return () => clearTimeout(timer)
   }, [searchTerm])
   ```

4. **Prueba en incógnito** para testing multi-user
   - Ventana normal: Usuario 1
   - Incógnito: Usuario 2

5. **Mantén columnas consistentes**
   - Siempre user_id (never userId)
   - Siempre user_email (not email)
   - Siempre created_at (not createdAt)

---

**¿Aún con problemas?** 
Revisa los logs en Supabase Dashboard → Logs y comparte el error exacto.

Buena suerte! 🚀
