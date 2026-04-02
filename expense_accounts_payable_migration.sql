ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS beneficiary TEXT,
  ADD COLUMN IF NOT EXISTS doc_id TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Pagado',
  ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS user_name TEXT;

UPDATE public.expenses
SET
  status = COALESCE(NULLIF(status, ''), 'Pagado'),
  paid_amount = CASE
    WHEN COALESCE(paid_amount, 0) <= 0 THEN COALESCE(amount, 0)
    ELSE paid_amount
  END;
