-- ============================================================
-- MIGRACION: Recordatorios Flash para Empleados
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- Table to store the flash reminders configured by admins
CREATE TABLE IF NOT EXISTS public.flash_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL DEFAULT public.current_company_id(),
    title TEXT NOT NULL,
    description TEXT,
    media_url TEXT, -- Base64 string or public URL
    media_type TEXT DEFAULT 'none', -- 'image', 'video', 'none'
    max_views INT DEFAULT 1, -- 0 = unlimited, >0 = limit of times to show
    target_roles TEXT[] DEFAULT '{}', -- roles to show to. If empty, show to all roles.
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table to track how many times a user has viewed each reminder
CREATE TABLE IF NOT EXISTS public.flash_reminder_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL DEFAULT public.current_company_id(),
    reminder_id UUID NOT NULL REFERENCES public.flash_reminders(id) ON DELETE CASCADE,
    user_id UUID NOT NULL DEFAULT auth.uid(),
    views_count INT DEFAULT 0,
    last_viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(reminder_id, user_id)
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.flash_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flash_reminder_views ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Company can view flash_reminders" ON public.flash_reminders;
DROP POLICY IF EXISTS "Company can insert flash_reminders" ON public.flash_reminders;
DROP POLICY IF EXISTS "Company can update flash_reminders" ON public.flash_reminders;
DROP POLICY IF EXISTS "Company can delete flash_reminders" ON public.flash_reminders;

DROP POLICY IF EXISTS "Company can view flash_reminder_views" ON public.flash_reminder_views;
DROP POLICY IF EXISTS "Company can insert flash_reminder_views" ON public.flash_reminder_views;
DROP POLICY IF EXISTS "Company can update flash_reminder_views" ON public.flash_reminder_views;

-- Create policies for public.flash_reminders
CREATE POLICY "Company can view flash_reminders" ON public.flash_reminders
    FOR SELECT USING (company_id = public.current_company_id());

CREATE POLICY "Company can insert flash_reminders" ON public.flash_reminders
    FOR INSERT WITH CHECK (company_id = public.current_company_id());

CREATE POLICY "Company can update flash_reminders" ON public.flash_reminders
    FOR UPDATE USING (company_id = public.current_company_id());

CREATE POLICY "Company can delete flash_reminders" ON public.flash_reminders
    FOR DELETE USING (company_id = public.current_company_id());

-- Create policies for public.flash_reminder_views
CREATE POLICY "Company can view flash_reminder_views" ON public.flash_reminder_views
    FOR SELECT USING (company_id = public.current_company_id());

CREATE POLICY "Company can insert flash_reminder_views" ON public.flash_reminder_views
    FOR INSERT WITH CHECK (company_id = public.current_company_id());

CREATE POLICY "Company can update flash_reminder_views" ON public.flash_reminder_views
    FOR UPDATE USING (company_id = public.current_company_id());

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_flash_reminders_company_id ON public.flash_reminders(company_id);
CREATE INDEX IF NOT EXISTS idx_flash_reminder_views_company_id ON public.flash_reminder_views(company_id);
CREATE INDEX IF NOT EXISTS idx_flash_reminder_views_user_id ON public.flash_reminder_views(user_id);
CREATE INDEX IF NOT EXISTS idx_flash_reminder_views_reminder_id ON public.flash_reminder_views(reminder_id);
