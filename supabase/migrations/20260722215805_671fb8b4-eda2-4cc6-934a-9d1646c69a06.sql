
ALTER TABLE public.trainers
  ADD COLUMN IF NOT EXISTS current_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS seasons_at_current_club INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consecutive_bad_seasons INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_final_position INT;

UPDATE public.trainers t
SET current_team_id = te.id
FROM public.teams te
WHERE te.trainer_id = t.id
  AND t.current_team_id IS NULL;

CREATE TABLE IF NOT EXISTS public.trainer_career (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trainer_id UUID NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  team_name TEXT NOT NULL,
  division division_type NOT NULL,
  season_start INT NOT NULL,
  season_end INT,
  final_position INT,
  event TEXT NOT NULL CHECK (event IN ('arrived','hired','promoted','relegated','champion','fired','left')),
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trainer_career TO authenticated;
GRANT ALL ON public.trainer_career TO service_role;

ALTER TABLE public.trainer_career ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trainers manage their own career"
  ON public.trainer_career
  FOR ALL
  TO authenticated
  USING (trainer_id IN (SELECT id FROM public.trainers WHERE user_id = auth.uid()))
  WITH CHECK (trainer_id IN (SELECT id FROM public.trainers WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS trainer_career_trainer_idx
  ON public.trainer_career (trainer_id, season_start DESC);

INSERT INTO public.trainer_career (trainer_id, team_id, team_name, division, season_start, event)
SELECT
  t.id,
  te.id,
  te.name,
  COALESCE(te.division, 'bronze'::division_type),
  COALESCE((SELECT season_number FROM public.game_seasons gs WHERE gs.trainer_id = t.id ORDER BY season_number DESC LIMIT 1), 1),
  'arrived'
FROM public.trainers t
JOIN public.teams te ON te.id = t.current_team_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.trainer_career tc WHERE tc.trainer_id = t.id
);
