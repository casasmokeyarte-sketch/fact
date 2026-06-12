-- ============================================================
-- MIGRACION: Tabla de Trueques y Retencion de Movimientos de Usuarios Eliminados
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- 1) CREAR TABLA DE TRUEQUES (TRADES)
CREATE TABLE IF NOT EXISTS public.trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL DEFAULT public.current_company_id(),
    user_id UUID, -- No constraint so it remains if user is deleted
    user_name TEXT,
    client_name TEXT,
    client_doc TEXT,
    product_id_given UUID, -- No strict foreign key cascade
    product_name_given TEXT,
    quantity_given INT,
    product_id_received UUID,
    product_name_received TEXT,
    quantity_received INT,
    affects_inventory BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for trades
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Company can view trades" ON public.trades;
DROP POLICY IF EXISTS "Company can insert trades" ON public.trades;
DROP POLICY IF EXISTS "Company can update trades" ON public.trades;
DROP POLICY IF EXISTS "Company can delete trades" ON public.trades;

-- Create RLS policies for public.trades
CREATE POLICY "Company can view trades" ON public.trades
    FOR SELECT USING (company_id = public.current_company_id());

CREATE POLICY "Company can insert trades" ON public.trades
    FOR INSERT WITH CHECK (company_id = public.current_company_id());

CREATE POLICY "Company can update trades" ON public.trades
    FOR UPDATE USING (company_id = public.current_company_id());

CREATE POLICY "Company can delete trades" ON public.trades
    FOR DELETE USING (company_id = public.current_company_id());

-- Create performance indexes for trades
CREATE INDEX IF NOT EXISTS idx_trades_company_id ON public.trades(company_id);
CREATE INDEX IF NOT EXISTS idx_trades_created_at ON public.trades(created_at DESC);


-- 2) ELIMINAR CONSTRICCIONES DE FOREIGN KEY QUE ELIMINAN DATOS (CASCADE DELETE)
-- Este bloque detecta dinamicamente cualquier clave foranea en la base de datos
-- que apunte a "auth.users" y la elimina de las tablas de negocio.
-- Esto previene que al borrar un empleado se borren sus facturas, gastos, bitacoras, etc.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT 
            tc.table_name, 
            tc.constraint_name
        FROM 
            information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' 
          AND ccu.table_name = 'users'
          AND ccu.table_schema = 'auth'
          AND tc.table_schema = 'public'
          AND tc.table_name <> 'profiles' -- Mantener la cascada en profiles por seguridad
    LOOP
        RAISE NOTICE 'Dropping constraint % from table %', r.constraint_name, r.table_name;
        EXECUTE 'ALTER TABLE public.' || quote_ident(r.table_name) || ' DROP CONSTRAINT ' || quote_ident(r.constraint_name) || ';';
    END LOOP;
END $$;
