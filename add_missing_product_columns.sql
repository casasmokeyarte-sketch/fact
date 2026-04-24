-- ============================================================
-- MIGRACION: Agregar columnas faltantes a la tabla products
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- Agregar columnas faltantes si no existen
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS is_visible BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS full_price_only BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS stock DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS warehouse_stock DECIMAL(15,2) DEFAULT 0;

-- Comentario para verificar
COMMENT ON COLUMN public.products.is_visible IS 'Indica si el producto es visible en la web/pagina';
COMMENT ON COLUMN public.products.full_price_only IS 'Indica si el producto no acepta descuentos automaticos';
COMMENT ON COLUMN public.products.stock IS 'Inventario disponible para ventas';
COMMENT ON COLUMN public.products.warehouse_stock IS 'Inventario disponible en bodega';
