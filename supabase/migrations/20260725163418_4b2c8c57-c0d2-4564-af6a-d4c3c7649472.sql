
ALTER TABLE public.trainers
  ADD COLUMN IF NOT EXISTS rest_free_charges integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS rest_pool_zeroed_at timestamptz,
  ADD COLUMN IF NOT EXISTS rest_paid_uses integer NOT NULL DEFAULT 0;

ALTER TABLE public.creatures
  ADD COLUMN IF NOT EXISTS rest_completes_at timestamptz;
