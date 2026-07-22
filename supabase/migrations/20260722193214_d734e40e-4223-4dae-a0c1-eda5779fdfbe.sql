-- Táticas ao vivo — infraestrutura

-- 1) Coluna default_tactics em team_lineups
ALTER TABLE public.team_lineups
  ADD COLUMN IF NOT EXISTS default_tactics JSONB NOT NULL DEFAULT
    '{"mentalidade":0,"verticalidade":"eq","pressao":"media","cortes":"normal"}'::jsonb;

-- 2) Colunas em matches
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tactics_history JSONB;

-- 3) Tabela live_matches (estado transiente)
CREATE TABLE IF NOT EXISTS public.live_matches (
  match_id UUID PRIMARY KEY REFERENCES public.matches(id) ON DELETE CASCADE,
  trainer_id UUID NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  current_minute INT NOT NULL DEFAULT 0,
  seed BIGINT NOT NULL,
  state JSONB NOT NULL,
  player_tactics JSONB NOT NULL,
  cpu_tactics JSONB NOT NULL,
  events_buffered JSONB NOT NULL DEFAULT '[]'::jsonb,
  ended BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_matches TO authenticated;
GRANT ALL ON public.live_matches TO service_role;

ALTER TABLE public.live_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trainer can manage own live match"
  ON public.live_matches
  FOR ALL
  USING (trainer_id IN (SELECT id FROM public.trainers WHERE user_id = auth.uid()))
  WITH CHECK (trainer_id IN (SELECT id FROM public.trainers WHERE user_id = auth.uid()));

-- Índice único: uma partida ativa por trainer
CREATE UNIQUE INDEX IF NOT EXISTS live_matches_one_active_per_trainer
  ON public.live_matches(trainer_id) WHERE ended = false;

CREATE INDEX IF NOT EXISTS live_matches_updated_at_idx ON public.live_matches(updated_at);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_live_matches_updated ON public.live_matches;
CREATE TRIGGER trg_live_matches_updated
  BEFORE UPDATE ON public.live_matches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();