
# Quickstart Supabase (FACT)

Guia corta para dejar FACT funcionando con Supabase.

## 1. Crear proyecto en Supabase

1. Entra a `https://supabase.com`
2. Crea un proyecto nuevo
3. Espera a que termine el aprovisionamiento

## 2. Configurar credenciales

En Supabase: `Settings > API`, copia:

- `Project URL` -> `VITE_SUPABASE_URL`
- `anon public` -> `VITE_SUPABASE_ANON_KEY`

Pegalos en `.env.local`.

## 3. Crear estructura de base de datos

1. Abre `SQL Editor` en Supabase
2. Crea una query nueva
3. Pega todo el contenido de `database.sql`
4. Ejecuta

## 4. Levantar y probar la app

```bash
npm run dev
```

Abre `http://localhost:5173` y prueba:

1. Registro
2. Login
3. Logout

## 5. Validacion minima

- Usuario nuevo aparece en `Authentication > Users`
- No hay errores de variables de entorno
- Puedes leer/escribir datos con usuario autenticado
- Un usuario no ve datos de otro (RLS)

## Errores frecuentes

- Variables vacias: revisa `.env.local` y reinicia `npm run dev`
- Login invalido: valida email/password
- Email ya existe: usa otro email o elimina el usuario de prueba
- Sin datos: revisa `user_id` en inserts y policies RLS

## Siguiente paso

1. `SUPABASE_INTEGRATION.md`
2. `EJEMPLO_ClientModule_Supabase.jsx`
3. `INTEGRACION_CHECKLIST.md`

Actualizado: 14 febrero 2026
Estado: vigente
