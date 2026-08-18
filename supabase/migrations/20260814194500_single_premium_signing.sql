CREATE TABLE IF NOT EXISTS public.premium_signings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid NOT NULL UNIQUE REFERENCES public.trainers(id) ON DELETE CASCADE,
  creature_id uuid REFERENCES public.creatures(id) ON DELETE SET NULL,
  offer_id text NOT NULL,
  division public.division_type NOT NULL,
  season_number integer NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  payment_provider text NOT NULL,
  provider_payment_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.premium_signings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read own premium signing" ON public.premium_signings;
CREATE POLICY "read own premium signing"
ON public.premium_signings FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.trainers
    WHERE trainers.id = premium_signings.trainer_id
      AND trainers.user_id = auth.uid()
  )
);

REVOKE INSERT, UPDATE, DELETE ON public.premium_signings FROM authenticated, anon;
GRANT SELECT ON public.premium_signings TO authenticated;
GRANT ALL ON public.premium_signings TO service_role;

CREATE INDEX IF NOT EXISTS premium_signings_trainer_id_idx
  ON public.premium_signings(trainer_id);
