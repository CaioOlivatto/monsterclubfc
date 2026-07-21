CREATE TYPE public.strategy_type AS ENUM ('ofensiva', 'equilibrada', 'defensiva');

CREATE TABLE public.team_lineups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trainer_id UUID NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE UNIQUE,
  formation TEXT NOT NULL DEFAULT '4-4-2',
  strategy public.strategy_type NOT NULL DEFAULT 'equilibrada',
  starters JSONB NOT NULL DEFAULT '[]'::jsonb,
  bench JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_lineups TO authenticated;
GRANT ALL ON public.team_lineups TO service_role;

ALTER TABLE public.team_lineups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trainers manage own lineup"
ON public.team_lineups FOR ALL
USING (trainer_id IN (SELECT id FROM public.trainers WHERE user_id = auth.uid()))
WITH CHECK (trainer_id IN (SELECT id FROM public.trainers WHERE user_id = auth.uid()));

CREATE TRIGGER update_team_lineups_updated_at
BEFORE UPDATE ON public.team_lineups
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();