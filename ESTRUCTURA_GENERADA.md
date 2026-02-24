# Estructura Generada (Supabase)

Resumen tecnico de lo integrado en FACT para trabajar con Supabase.

## 1. Configuracion base

- `.env.local`: variables de entorno del proyecto Supabase
- `src/lib/supabaseClient.js`: inicializacion del cliente Supabase
- `database.sql`: esquema, politicas RLS e indices

## 2. Servicios backend (`src/lib/`)

- `authService.js`
Funciones para registro, login, logout y manejo de sesion.

- `databaseService.js`
Operaciones CRUD para entidades de la app, con filtros por usuario.

- `storageService.js`
Subida, descarga y eliminacion de archivos en Supabase Storage.

- `useSupabase.js`
Hook para exponer estado de usuario y helpers de acceso a datos.

## 3. UI de autenticacion

- `AuthPage.jsx`
Pantalla de acceso (registro/inicio de sesion) conectada a `authService`.

## 4. Seguridad y datos

- RLS habilitado en tablas principales
- Acceso por `user_id` para aislamiento multiusuario
- Convencion de columnas en `snake_case`

## 5. Flujo de arranque recomendado

1. Configurar `.env.local`
2. Ejecutar `database.sql` en Supabase SQL Editor
3. Levantar app: `npm run dev`
4. Validar registro, login y logout
5. Validar aislamiento entre usuarios

## 6. Documentacion relacionada

- `00_LEE_ESTO_PRIMERO.md`
- `QUICKSTART_SUPABASE.md`
- `SUPABASE_INTEGRATION.md`
- `TROUBLESHOOTING.md`
- `INTEGRACION_CHECKLIST.md`

## 7. Verificacion minima

- [ ] Variables Supabase cargadas
- [ ] SQL aplicado sin errores
- [ ] RLS activo
- [ ] Inserts con `user_id`
- [ ] Multiusuario validado

Generado: 14 febrero 2026
Estado: vigente
