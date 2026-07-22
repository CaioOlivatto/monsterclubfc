-- Fase 3 — Carreira: propostas e demissão
CREATE TYPE public.job_offer_status AS ENUM ('pending','accepted','declined','expired');
CREATE TYPE public.job_offer_reason AS ENUM ('top_finish','higher_division','after_dismissal');

CREATE TABLE public.job_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id UUID NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  team_name TEXT NOT NULL,
  division TEXT NOT NULL,
  season_offered INT NOT NULL,
  reason public.job_offer_reason NOT NULL,
  status public.job_offer_status NOT NULL DEFAULT 'pending',
  signing_bonus INT NOT NULL DEFAULT 0,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trainer_id, team_id, season_offered)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_offers TO authenticated;
GRANT ALL ON public.job_offers TO service_role;

ALTER TABLE public.job_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trainers view their offers" ON public.job_offers
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = auth.uid())
);
CREATE POLICY "Trainers update their offers" ON public.job_offers
FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = auth.uid())
);

CREATE TRIGGER job_offers_updated_at BEFORE UPDATE ON public.job_offers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_job_offers_trainer_status ON public.job_offers(trainer_id, status);

-- Sinalizador de treinador demitido (sem clube) aguardando escolha
ALTER TABLE public.trainers
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'employed',
  ADD COLUMN IF NOT EXISTS pending_transition BOOLEAN NOT NULL DEFAULT false;
