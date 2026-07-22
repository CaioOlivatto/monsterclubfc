ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS finance_summary jsonb;
ALTER TABLE public.financial_transactions ADD COLUMN IF NOT EXISTS category text;