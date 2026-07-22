
CREATE TABLE IF NOT EXISTS public.market_purchases (
  trainer_id uuid NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  season_number integer NOT NULL,
  division text NOT NULL,
  listing_id text NOT NULL,
  bought_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trainer_id, season_number, division, listing_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_purchases TO authenticated;
GRANT ALL ON public.market_purchases TO service_role;

ALTER TABLE public.market_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own market purchases" ON public.market_purchases
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = market_purchases.trainer_id AND t.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = market_purchases.trainer_id AND t.user_id = auth.uid())
  );

ALTER TABLE public.academies ALTER COLUMN roster_slots SET DEFAULT 26;
UPDATE public.academies SET roster_slots = 26 WHERE roster_slots = 24;
