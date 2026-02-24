# FACT + Supabase: empieza aqui

Integracion completada. Solo te faltan 4 pasos para tener todo funcionando.

## Estado actual

- Backend Supabase integrado
- Login/Signup listo
- `database.sql` preparado con RLS
- Servicios en `src/lib/`
- Documentacion y ejemplos disponibles

## Inicio rapido (25 min)

1. Lee `QUICKSTART_SUPABASE.md` (5 min)
2. Crea tu proyecto en Supabase y copia URL + KEY a `.env.local` (10 min)
3. Ejecuta `database.sql` en Supabase SQL Editor (5 min)
4. Prueba autenticacion local (5 min)

```bash
npm run dev
```

Abre `http://localhost:5173`, registrate y valida login/logout.

## Checklist minimo

- [ ] `.env.local` tiene las credenciales correctas
- [ ] `database.sql` ejecutado completo
- [ ] RLS habilitado en tablas
- [ ] Inserts incluyen `user_id`
- [ ] Prueba multiusuario (A no ve datos de B)
- [ ] `.env.local` fuera de git

## Convenciones clave

- Base de datos en `snake_case`: `user_id`, `created_at`
- Reinicia `npm run dev` despues de cambiar `.env.local`
- Usa `useSupabase()` para centralizar auth y fetch

## Archivos que usaras primero

1. `QUICKSTART_SUPABASE.md` (obligatorio)
2. `INDICE.md` (mapa)
3. `EJEMPLO_ClientModule_Supabase.jsx` (referencia practica)
4. `TROUBLESHOOTING.md` (si algo falla)

## Donde seguir despues

- Integrar `AuthPage.jsx` en la app
- Integrar `ClientModule` con servicios Supabase
- Repetir el patron en Inventory, MainCashier y Gastos

## Si algo falla

1. Abre `TROUBLESHOOTING.md`
2. Busca el error exacto
3. Aplica la solucion sugerida

---

Proximo paso: abre `QUICKSTART_SUPABASE.md`.

Generado: 14 febrero 2026
Estado: listo para ejecutar
