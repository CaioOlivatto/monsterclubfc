
CREATE TABLE public.world_academies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  academy_name TEXT NOT NULL,
  trainer_name TEXT NOT NULL,
  division TEXT NOT NULL,
  level INT NOT NULL DEFAULT 1,
  wins INT NOT NULL DEFAULT 0,
  patrimony BIGINT NOT NULL DEFAULT 0,
  is_player BOOLEAN NOT NULL DEFAULT false,
  trainer_id UUID REFERENCES public.trainers(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  primary_color TEXT NOT NULL DEFAULT '#6B7280',
  secondary_color TEXT NOT NULL DEFAULT '#111827',
  last_position INT,
  current_position INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX world_academies_level_idx ON public.world_academies (level DESC);
CREATE INDEX world_academies_wins_idx ON public.world_academies (wins DESC);
CREATE INDEX world_academies_patrimony_idx ON public.world_academies (patrimony DESC);
CREATE INDEX world_academies_current_position_idx ON public.world_academies (current_position);
CREATE UNIQUE INDEX world_academies_trainer_id_uniq ON public.world_academies (trainer_id) WHERE trainer_id IS NOT NULL;

GRANT SELECT ON public.world_academies TO anon, authenticated;
GRANT ALL ON public.world_academies TO service_role;

ALTER TABLE public.world_academies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "world_academies public read"
  ON public.world_academies FOR SELECT
  USING (true);

CREATE TRIGGER world_academies_updated_at
  BEFORE UPDATE ON public.world_academies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
