
ALTER TABLE public.academies
  ADD COLUMN IF NOT EXISTS paid_4x boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paid_instant boolean NOT NULL DEFAULT false;

ALTER TABLE public.trainers
  ADD COLUMN IF NOT EXISTS xp_burst_multiplier real NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS xp_burst_matches_left integer NOT NULL DEFAULT 0;
