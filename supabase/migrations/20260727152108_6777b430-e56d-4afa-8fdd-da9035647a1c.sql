ALTER TABLE public.creatures
  ADD COLUMN IF NOT EXISTS career_baseline_xp integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS xp_spent_training integer NOT NULL DEFAULT 0;