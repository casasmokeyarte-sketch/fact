# Correccion integral y Facturacion tactil para cafeteria

## 1. Aplicar la base de datos

1. Abra el proyecto de Supabase usado por `fact-ten.vercel.app`.
2. Entre a **SQL Editor**.
3. Abra el archivo `user_deactivation_and_inventory_access.sql`.
4. Copie todo su contenido, ejecutelo y confirme que el resultado final muestre:
   - `perfiles_sin_empresa = 0`
   - `productos_sin_empresa = 0`
   - `empresas_en_perfiles = 1`
   - `empresas_en_productos = 1`

Esta migracion alinea al Supervisor y a los productos con la organizacion principal. No borra facturas, turnos, usuarios ni productos.

## 2. Copiar la correccion al proyecto local

Abra PowerShell:

```powershell
cd C:\Users\PC\OneDrive\Documents\fact
git switch -c agent/fix-inventory-drafts-users
Expand-Archive "$env:USERPROFILE\Downloads\fact-cafeteria-touch-inventario-2026-08-01.zip" -DestinationPath . -Force
npm install
npm run build
```

## 3. Guardar y publicar

```powershell
git add api/admin-users.js src/App.css src/App.jsx src/components/InventoryModule.jsx src/components/InvoiceTable.jsx src/components/ProductSelector.jsx src/components/SettingsModule.jsx src/lib/useSupabase.ts src/lib/userUtils.js user_deactivation_and_inventory_access.sql INSTRUCCIONES_CORRECCION_FACT.md
git commit -m "feat: facturacion tactil y acceso compartido a inventario"
git push -u origin agent/fix-inventory-drafts-users
git switch main
git merge --ff-only agent/fix-inventory-drafts-users
git push origin main
```

El ultimo `git push origin main` inicia el despliegue de produccion en Vercel.

## 4. Pruebas posteriores

1. Inicie sesion como Supervisor y confirme que Inventario muestra los mismos productos del Administrador.
2. En Facturacion, pruebe la busqueda, las categorias y agregar productos tocando las tarjetas grandes.
3. Use los botones `+` y `-` de la orden y confirme que el total se actualiza correctamente.
4. Abra una venta, agregue un producto, cambie de pestaña y vuelva. La venta debe restaurarse.
5. Desde Configuracion, desactive un usuario retirado. Su acceso debe bloquearse y su historial debe permanecer.
6. La eliminacion permanente solo debe funcionar para un usuario inactivo que no tenga movimientos.
