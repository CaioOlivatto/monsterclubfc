ALTER TABLE public.creatures
  ADD COLUMN IF NOT EXISTS attr_training_key text,
  ADD COLUMN IF NOT EXISTS attr_training_completes_at timestamp with time zone;