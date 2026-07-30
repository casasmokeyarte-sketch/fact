# Correccion de inventario, ventas abiertas y usuarios

## 1. Aplicar la base de datos

1. Abra el proyecto de Supabase usado por `fact-ten.vercel.app`.
2. Entre a **SQL Editor**.
3. Abra el archivo `user_deactivation_and_inventory_access.sql`.
4. Copie todo su contenido, ejecutelo y confirme que el resultado final muestre:
   - `perfiles_sin_empresa = 0`
   - `productos_sin_empresa = 0`

Esta migracion no borra facturas, turnos, usuarios ni productos.

## 2. Copiar la correccion al proyecto local

Abra PowerShell:

```powershell
cd C:\Users\PC\OneDrive\Documents\fact
git switch -c agent/fix-inventory-drafts-users
Expand-Archive "$env:USERPROFILE\Downloads\fact-correcciones-2026-07-30.zip" -DestinationPath . -Force
npm install
npm run build
```

## 3. Guardar y publicar

```powershell
git add api/admin-users.js src/App.jsx src/components/InventoryModule.jsx src/components/SettingsModule.jsx src/lib/useSupabase.ts src/lib/userUtils.js user_deactivation_and_inventory_access.sql INSTRUCCIONES_CORRECCION_FACT.md
git commit -m "fix: inventario, ventas abiertas y usuarios inactivos"
git push -u origin agent/fix-inventory-drafts-users
git switch main
git merge --ff-only agent/fix-inventory-drafts-users
git push origin main
```

El ultimo `git push origin main` inicia el despliegue de produccion en Vercel.

## 4. Pruebas posteriores

1. Active el permiso **Inventario** a un usuario Cajero y confirme que puede ver los productos.
2. Abra una venta, agregue un producto, cambie de pestaña y vuelva. La venta debe restaurarse.
3. Desde Configuracion, desactive un usuario retirado. Su acceso debe bloquearse y su historial debe permanecer.
4. La eliminacion permanente solo debe funcionar para un usuario inactivo que no tenga movimientos.
