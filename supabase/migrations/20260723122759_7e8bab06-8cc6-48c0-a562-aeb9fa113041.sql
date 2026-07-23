
-- Expandir tipos de competição
ALTER TABLE public.competitions DROP CONSTRAINT IF EXISTS competitions_type_check;
ALTER TABLE public.competitions ADD CONSTRAINT competitions_type_check
  CHECK (type = ANY (ARRAY['league','cup','world_league','world_cup']));

-- Permitir status 'skipped' e 'preview' para a Temporada 1
ALTER TABLE public.competitions DROP CONSTRAINT IF EXISTS competitions_status_check;
ALTER TABLE public.competitions ADD CONSTRAINT competitions_status_check
  CHECK (status = ANY (ARRAY['active','finished','skipped']));

-- Fase adicional para partidas de mata-mata / grupos (ex: 'group','r16','qf','sf','final')
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS phase text;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS leg smallint;  -- 1=ida, 2=volta (nulo=jogo único)
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS tie_group text; -- identifica confronto ida/volta

-- Qualificações: registra a cada fim de temporada quem se classificou para a próxima
CREATE TABLE IF NOT EXISTS public.qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  season_number int NOT NULL, -- temporada em que a classificação passa a valer (ex: 2)
  qualifies_for text NOT NULL CHECK (qualifies_for IN ('world_league','world_cup')),
  source_division division_type NOT NULL,
  source_position int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.qualifications TO authenticated;
GRANT ALL ON public.qualifications TO service_role;

ALTER TABLE public.qualifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own qualifications" ON public.qualifications
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = qualifications.trainer_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = qualifications.trainer_id AND t.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_qualifications_trainer_season ON public.qualifications(trainer_id, season_number);
