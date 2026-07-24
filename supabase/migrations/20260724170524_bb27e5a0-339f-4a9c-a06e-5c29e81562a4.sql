ALTER TABLE public.creatures
  ADD COLUMN IF NOT EXISTS is_prodigy boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS training_element text NULL,
  ADD COLUMN IF NOT EXISTS training_completes_at timestamptz NULL;

ALTER TABLE public.creatures
  DROP CONSTRAINT IF EXISTS creatures_training_element_check;
ALTER TABLE public.creatures
  ADD CONSTRAINT creatures_training_element_check
  CHECK (training_element IS NULL OR training_element IN ('fogo','agua','terra','ar','gelo'));