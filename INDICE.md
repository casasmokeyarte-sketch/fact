# Indice de Documentacion Supabase (FACT)

Guia rapida para saber que archivo abrir segun tu objetivo.

## Si quieres empezar ya

1. `00_LEE_ESTO_PRIMERO.md`
2. `QUICKSTART_SUPABASE.md`

Tiempo estimado: 20-25 min.

## Si quieres integrar modulos

1. `SUPABASE_INTEGRATION.md`
2. `EJEMPLO_ClientModule_Supabase.jsx`
3. `INTEGRACION_CHECKLIST.md`

## Si quieres entender la arquitectura

1. `ESTRUCTURA_GENERADA.md`
2. `RESUMEN_FINAL.md`

## Si tienes errores

1. `TROUBLESHOOTING.md`
2. `FIXES_APLICADOS.md`

## Archivos operativos clave

- `.env.local`: credenciales del proyecto Supabase
- `database.sql`: esquema y politicas RLS
- `src/lib/supabaseClient.js`: inicializacion del cliente
- `src/lib/authService.js`: autenticacion
- `src/lib/databaseService.js`: operaciones CRUD
- `src/lib/storageService.js`: storage
- `src/lib/useSupabase.js`: hook de integracion
- `src/components/AuthPage.jsx`: pantalla login/signup

## Orden recomendado de ejecucion

1. Configurar `.env.local`
2. Ejecutar `database.sql` en Supabase
3. Levantar la app con `npm run dev`
4. Probar registro/login/logout
5. Validar aislamiento multiusuario por `user_id`

## Checklist express

- [ ] Variables Supabase correctas en `.env.local`
- [ ] SQL aplicado completo
- [ ] RLS activo en tablas
- [ ] Inserts con `user_id`
- [ ] `.env.local` fuera de git

---

Referencia principal: `QUICKSTART_SUPABASE.md`

Actualizado: 14 febrero 2026
Estado: vigente
