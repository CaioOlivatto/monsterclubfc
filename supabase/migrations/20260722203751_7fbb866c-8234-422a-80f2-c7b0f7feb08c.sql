ALTER TABLE public.creatures
  ADD COLUMN IF NOT EXISTS injury_matches_remaining SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS injury_severity TEXT;
ALTER TABLE public.creatures
  DROP CONSTRAINT IF EXISTS creatures_injury_severity_check;
ALTER TABLE public.creatures
  ADD CONSTRAINT creatures_injury_severity_check
  CHECK (injury_severity IS NULL OR injury_severity IN ('leve','moderada','grave'));
CREATE INDEX IF NOT EXISTS idx_creatures_injured
  ON public.creatures (owner_trainer_id) WHERE injury_matches_remaining > 0;