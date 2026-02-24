# FACT

Aplicacion FACT con frontend en React + Vite e integracion backend con Supabase.

## Requisitos

- Node.js 18+
- npm
- Cuenta en Supabase

## Inicio rapido

1. Instala dependencias:

```bash
npm install
```

2. Configura variables en `.env.local`:

```env
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_ANON_KEY
```

3. En Supabase SQL Editor ejecuta `database.sql` completo.

4. Ejecuta en local:

```bash
npm run dev
```

5. Abre `http://localhost:5173` y prueba registro/login.

## Scripts principales

- `npm run dev`: desarrollo local
- `npm run build`: build de produccion
- `npm run preview`: previsualizar build

## Estructura clave

- `src/lib/supabaseClient.js`: cliente Supabase
- `src/lib/authService.js`: autenticacion
- `src/lib/databaseService.js`: CRUD
- `src/lib/storageService.js`: storage
- `src/lib/useSupabase.js`: hook de integracion
- `src/components/AuthPage.jsx`: UI de login/signup
- `database.sql`: esquema y politicas RLS

## Documentacion del proyecto

1. `00_LEE_ESTO_PRIMERO.md`
2. `QUICKSTART_SUPABASE.md`
3. `INDICE.md`
4. `ESTRUCTURA_GENERADA.md`
5. `TROUBLESHOOTING.md`

## Checklist de verificacion

- [ ] `.env.local` configurado correctamente
- [ ] `database.sql` ejecutado sin errores
- [ ] RLS activo en tablas
- [ ] Inserciones con `user_id`
- [ ] Prueba multiusuario validada

Actualizado: 14 febrero 2026
