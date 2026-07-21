
ALTER TABLE public.competitions
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'league',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS champion_team_id uuid;

ALTER TABLE public.competitions
  DROP CONSTRAINT IF EXISTS competitions_type_check;
ALTER TABLE public.competitions
  ADD CONSTRAINT competitions_type_check CHECK (type IN ('league','cup'));

ALTER TABLE public.competitions
  DROP CONSTRAINT IF EXISTS competitions_status_check;
ALTER TABLE public.competitions
  ADD CONSTRAINT competitions_status_check CHECK (status IN ('active','finished'));

CREATE INDEX IF NOT EXISTS idx_competitions_trainer_status ON public.competitions(trainer_id, status);
