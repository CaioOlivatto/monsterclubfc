-- Base neutra para conectar Stripe/Mercado Pago sem confiar em preço vindo do navegador.
CREATE TABLE IF NOT EXISTS public.payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  product_key text NOT NULL,
  amount_cents integer NOT NULL CHECK(amount_cents>0),
  currency text NOT NULL DEFAULT 'BRL' CHECK(currency='BRL'),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','paid','failed','cancelled','refunded')),
  provider text,
  provider_order_id text UNIQUE,
  idempotency_key uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own payment orders" ON public.payment_orders FOR SELECT TO authenticated
USING(EXISTS(SELECT 1 FROM trainers t WHERE t.id=trainer_id AND t.user_id=auth.uid()));
REVOKE INSERT,UPDATE,DELETE ON public.payment_orders FROM authenticated,anon;
GRANT ALL ON public.payment_orders TO service_role;
CREATE INDEX IF NOT EXISTS payment_orders_trainer_time_idx ON public.payment_orders(trainer_id,created_at DESC);

CREATE OR REPLACE FUNCTION public.create_payment_order(p_product_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tid uuid; cents integer; result jsonb;
BEGIN
  SELECT id INTO tid FROM trainers WHERE user_id=auth.uid();
  IF tid IS NULL THEN RAISE EXCEPTION 'Não autorizado'; END IF;
  cents:=CASE p_product_key
    WHEN 'club_monthly' THEN 2990 WHEN 'speed_4x' THEN 1490 WHEN 'instant_result' THEN 2990
    WHEN 'gems_100' THEN 790 WHEN 'gems_450' THEN 2490 WHEN 'gems_1050' THEN 4990
    WHEN 'gems_2500' THEN 9990 WHEN 'gems_6000' THEN 19990 ELSE NULL END;
  IF cents IS NULL THEN RAISE EXCEPTION 'Produto inválido'; END IF;
  INSERT INTO payment_orders(trainer_id,product_key,amount_cents) VALUES(tid,p_product_key,cents)
  RETURNING jsonb_build_object('order_id',id,'product_key',product_key,'amount_cents',amount_cents,'status',status,'idempotency_key',idempotency_key) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.create_payment_order(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_payment_order(text) TO authenticated;
