
-- Times ganham divisão, cores e flag CPU
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS division division_type,
  ADD COLUMN IF NOT EXISTS colors jsonb NOT NULL DEFAULT '{"primary":"#666","secondary":"#eee"}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_cpu boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_teams_trainer_division ON public.teams(trainer_id, division);

-- Partidas ganham resumo e divisão
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS is_summary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS division division_type;

CREATE INDEX IF NOT EXISTS idx_matches_competition_division_round
  ON public.matches(competition_id, division, round);

-- Standings ganham divisão para consulta direta
ALTER TABLE public.standings
  ADD COLUMN IF NOT EXISTS division division_type;

CREATE INDEX IF NOT EXISTS idx_standings_competition_division_points
  ON public.standings(competition_id, division, points DESC);

-- Estado do mundo por treinador
CREATE TABLE IF NOT EXISTS public.world_state (
  trainer_id uuid PRIMARY KEY REFERENCES public.trainers(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES public.game_seasons(id) ON DELETE CASCADE,
  current_round integer NOT NULL DEFAULT 1,
  seeded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.world_state TO authenticated;
GRANT ALL ON public.world_state TO service_role;

ALTER TABLE public.world_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own world state" ON public.world_state
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = world_state.trainer_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = world_state.trainer_id AND t.user_id = auth.uid()));

CREATE TRIGGER trg_world_state_updated
  BEFORE UPDATE ON public.world_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
