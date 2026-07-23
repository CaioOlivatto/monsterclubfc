-- Fase B: dados extras para Liga/Copa Mundial
ALTER TABLE public.competitions ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.standings ADD COLUMN IF NOT EXISTS group_key text;
CREATE INDEX IF NOT EXISTS idx_standings_group ON public.standings(competition_id, group_key);