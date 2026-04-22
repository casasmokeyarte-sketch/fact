-- Permite guardar una imagen por producto directamente en la tabla products.
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS image_url TEXT;
