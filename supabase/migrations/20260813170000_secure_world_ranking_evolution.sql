-- Prevent an authenticated player from evolving the global CPU ranking more
-- than once for the same personal season. Only the Edge Function service role
-- can read or write this table.

CREATE TABLE IF NOT EXISTS public.world_ranking_evolutions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trainer_id uuid NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  season_number integer NOT NULL CHECK (season_number > 0),
  evolved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, season_number)
);

ALTER TABLE public.world_ranking_evolutions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_world_ranking_evolutions_trainer
  ON public.world_ranking_evolutions (trainer_id, season_number DESC);
