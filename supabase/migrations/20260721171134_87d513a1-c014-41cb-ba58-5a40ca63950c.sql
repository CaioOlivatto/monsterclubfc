
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS clima text;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS speed_paid jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.creatures ADD COLUMN IF NOT EXISTS pending_half_stars smallint NOT NULL DEFAULT 0;
ALTER TABLE public.trainers ADD COLUMN IF NOT EXISTS xp_burst_until timestamptz;

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trainer_id uuid NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_trainer_date ON public.messages(trainer_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own messages" ON public.messages
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = messages.trainer_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = messages.trainer_id AND t.user_id = auth.uid()));
