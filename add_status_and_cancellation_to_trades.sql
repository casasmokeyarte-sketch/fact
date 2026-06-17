-- ============================================================
-- MIGRACION: Agregar campos de estado y anulacion a Tabla de Trueques (trades)
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completado';
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS cancelled_by TEXT;
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
