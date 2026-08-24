-- Prontidao tecnica de monetizacao: movimentos de gemas atomicos, auditaveis e idempotentes.
-- Migration estritamente aditiva; nao recalibra precos nem altera saldos existentes.

REVOKE ALL ON FUNCTION public.apply_gem_delta_atomic(integer,text,text,text,text,text) FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_gem_delta_atomic(integer,text,text,text,text,text) TO service_role;

CREATE TABLE IF NOT EXISTS public.gem_ledger_baselines (
  trainer_id uuid PRIMARY KEY REFERENCES public.trainers(id) ON DELETE CASCADE,
  balance_at_baseline integer NOT NULL CHECK (balance_at_baseline >= 0),
  baseline_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.gem_ledger_baselines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gem_ledger_baselines FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.gem_ledger_baselines TO service_role;
INSERT INTO public.gem_ledger_baselines(trainer_id,balance_at_baseline)
SELECT trainer_id, gems FROM public.academies
ON CONFLICT (trainer_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.private_gem_move(
  p_trainer uuid, p_amount integer, p_direction text, p_reason text,
  p_reference_type text DEFAULT NULL, p_reference_id text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_before integer; v_after integer; v_existing public.gem_ledger%ROWTYPE;
BEGIN
  IF p_amount < 0 OR p_direction NOT IN ('credit','debit') THEN RAISE EXCEPTION 'invalid gem movement'; END IF;
  IF p_amount = 0 THEN SELECT gems INTO v_before FROM academies WHERE trainer_id=p_trainer; RETURN jsonb_build_object('balance',v_before,'replayed',false); END IF;
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM gem_ledger WHERE trainer_id=p_trainer AND idempotency_key=p_idempotency_key;
    IF FOUND THEN RETURN jsonb_build_object('balance',v_existing.balance_after,'replayed',true); END IF;
  END IF;
  SELECT gems INTO v_before FROM academies WHERE trainer_id=p_trainer FOR UPDATE;
  IF v_before IS NULL THEN RAISE EXCEPTION 'academy not found'; END IF;
  v_after := v_before + CASE WHEN p_direction='credit' THEN p_amount ELSE -p_amount END;
  IF v_after < 0 THEN RAISE EXCEPTION 'insufficient gems'; END IF;
  UPDATE academies SET gems=v_after,updated_at=now() WHERE trainer_id=p_trainer;
  INSERT INTO gem_ledger(trainer_id,amount,direction,reason,balance_before,balance_after,reference_type,reference_id,idempotency_key)
  VALUES(p_trainer,p_amount,p_direction,p_reason,v_before,v_after,p_reference_type,p_reference_id,p_idempotency_key);
  RETURN jsonb_build_object('balance',v_after,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.private_gem_move(uuid,integer,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.private_gem_move(uuid,integer,text,text,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_building_with_gems_atomic(p_type text, p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t uuid; team uuid; b buildings%ROWTYPE; cost integer; moved jsonb;
BEGIN
 SELECT id,current_team_id INTO t,team FROM trainers WHERE user_id=auth.uid(); IF t IS NULL THEN RAISE EXCEPTION 'trainer not found'; END IF;
 SELECT * INTO b FROM buildings WHERE team_id=team AND building_type::text=p_type FOR UPDATE;
 IF b.id IS NULL OR b.upgrade_completes_at IS NULL THEN RETURN jsonb_build_object('spent',0); END IF;
 cost:=GREATEST(0,CEIL(EXTRACT(EPOCH FROM (b.upgrade_completes_at-now()))/600)::integer);
 moved:=private_gem_move(t,cost,'debit','building_rush','building',b.id::text,p_idempotency_key);
 IF COALESCE((moved->>'replayed')::boolean,false) THEN RETURN moved || jsonb_build_object('spent',cost); END IF;
 UPDATE buildings SET level=level+1,upgrade_completes_at=NULL WHERE id=b.id;
 RETURN moved || jsonb_build_object('spent',cost);
END $$;
REVOKE ALL ON FUNCTION public.finish_building_with_gems_atomic(text,text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.finish_building_with_gems_atomic(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rush_timer_with_gems_atomic(p_kind text,p_creature uuid,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t uuid; ts timestamptz; cost integer; moved jsonb; used_credit boolean:=false;
BEGIN
 SELECT id INTO t FROM trainers WHERE user_id=auth.uid(); IF t IS NULL THEN RAISE EXCEPTION 'trainer not found'; END IF;
 IF p_kind='rest' THEN SELECT rest_completes_at INTO ts FROM creatures WHERE id=p_creature AND owner_trainer_id=t FOR UPDATE;
 ELSIF p_kind='morale' THEN SELECT morale_session_completes_at INTO ts FROM creatures WHERE id=p_creature AND owner_trainer_id=t FOR UPDATE;
 ELSIF p_kind='training' THEN SELECT attr_training_completes_at INTO ts FROM creatures WHERE id=p_creature AND owner_trainer_id=t FOR UPDATE;
 ELSE RAISE EXCEPTION 'invalid timer'; END IF;
 IF ts IS NULL THEN RAISE EXCEPTION 'timer not active'; END IF;
 IF p_kind='training' THEN used_credit:=consume_club_training_rush(t); END IF;
 cost:=CASE WHEN used_credit THEN 0 ELSE GREATEST(0,CEIL(EXTRACT(EPOCH FROM (ts-now()))/600)::integer) END;
 moved:=private_gem_move(t,cost,'debit',p_kind||'_rush','creature',p_creature::text,p_idempotency_key);
 IF NOT COALESCE((moved->>'replayed')::boolean,false) THEN
   IF p_kind='rest' THEN UPDATE creatures SET rest_completes_at=now() WHERE id=p_creature;
   ELSIF p_kind='morale' THEN UPDATE creatures SET morale_session_completes_at=now() WHERE id=p_creature;
   ELSE UPDATE creatures SET attr_training_completes_at=now() WHERE id=p_creature; END IF;
 END IF;
 RETURN moved || jsonb_build_object('spent',cost);
END $$;
REVOKE ALL ON FUNCTION public.rush_timer_with_gems_atomic(text,uuid,text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.rush_timer_with_gems_atomic(text,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.start_rest_atomic(p_creature uuid,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t trainers%ROWTYPE; c creatures%ROWTYPE; cost integer:=0; moved jsonb; completes timestamptz;
BEGIN
 SELECT * INTO t FROM trainers WHERE user_id=auth.uid() FOR UPDATE;
 IF t.id IS NULL THEN RAISE EXCEPTION 'trainer not found'; END IF;
 IF t.rest_free_charges<=0 AND t.rest_pool_zeroed_at IS NOT NULL AND t.rest_pool_zeroed_at<=now()-interval '12 hours' THEN
   UPDATE trainers SET rest_free_charges=3,rest_paid_uses=0,rest_pool_zeroed_at=NULL WHERE id=t.id RETURNING * INTO t;
 END IF;
 SELECT * INTO c FROM creatures WHERE id=p_creature AND owner_trainer_id=t.id FOR UPDATE;
 IF c.id IS NULL OR c.retired THEN RAISE EXCEPTION 'creature unavailable'; END IF;
 IF c.rest_completes_at>now() THEN RAISE EXCEPTION 'rest already active'; END IF;
 IF COALESCE(c.energy,0)>=100 THEN RAISE EXCEPTION 'energy already full'; END IF;
 IF t.rest_free_charges>0 THEN
   UPDATE trainers SET rest_free_charges=rest_free_charges-1,rest_pool_zeroed_at=CASE WHEN rest_free_charges=1 THEN now() ELSE rest_pool_zeroed_at END WHERE id=t.id;
 ELSE
   cost:=CASE t.rest_paid_uses WHEN 0 THEN 15 WHEN 1 THEN 25 WHEN 2 THEN 40 ELSE 60 END;
   moved:=private_gem_move(t.id,cost,'debit','paid_rest','creature',c.id::text,p_idempotency_key);
   IF NOT COALESCE((moved->>'replayed')::boolean,false) THEN UPDATE trainers SET rest_paid_uses=rest_paid_uses+1 WHERE id=t.id; END IF;
 END IF;
 completes:=now()+interval '15 minutes';
 UPDATE creatures SET rest_completes_at=completes WHERE id=c.id;
 RETURN COALESCE(moved,'{}'::jsonb)||jsonb_build_object('completes_at',completes,'paid_cost',cost);
END $$;
REVOKE ALL ON FUNCTION public.start_rest_atomic(uuid,text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.start_rest_atomic(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rush_morale_meeting_with_gems_atomic(p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t uuid; ts timestamptz; cost integer; moved jsonb;
BEGIN
 SELECT tr.id,a.morale_meeting_completes_at INTO t,ts FROM trainers tr JOIN academies a ON a.trainer_id=tr.id WHERE tr.user_id=auth.uid() FOR UPDATE OF a;
 IF ts IS NULL THEN RAISE EXCEPTION 'meeting not active'; END IF;
 cost:=GREATEST(0,CEIL(EXTRACT(EPOCH FROM (ts-now()))/600)::integer);
 moved:=private_gem_move(t,cost,'debit','morale_meeting_rush','academy',t::text,p_idempotency_key);
 IF NOT COALESCE((moved->>'replayed')::boolean,false) THEN UPDATE academies SET morale_meeting_completes_at=now() WHERE trainer_id=t; END IF;
 RETURN moved || jsonb_build_object('spent',cost);
END $$;
REVOKE ALL ON FUNCTION public.rush_morale_meeting_with_gems_atomic(text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.rush_morale_meeting_with_gems_atomic(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.heal_creature_with_gems_atomic(p_creature uuid,p_mode text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t uuid; remaining integer; healed integer; cost integer; moved jsonb;
BEGIN
 SELECT id INTO t FROM trainers WHERE user_id=auth.uid(); SELECT injury_matches_remaining INTO remaining FROM creatures WHERE id=p_creature AND owner_trainer_id=t FOR UPDATE;
 IF COALESCE(remaining,0)<=0 THEN RAISE EXCEPTION 'creature is not injured'; END IF;
 healed:=CASE WHEN p_mode='all' THEN remaining WHEN p_mode='one' THEN 1 ELSE 0 END; IF healed=0 THEN RAISE EXCEPTION 'invalid heal mode'; END IF; cost:=healed*40;
 moved:=private_gem_move(t,cost,'debit','injury_heal','creature',p_creature::text,p_idempotency_key);
 IF NOT COALESCE((moved->>'replayed')::boolean,false) THEN UPDATE creatures SET injury_matches_remaining=remaining-healed,injury_severity=CASE WHEN remaining-healed=0 THEN NULL ELSE injury_severity END WHERE id=p_creature; END IF;
 RETURN moved || jsonb_build_object('spent',cost,'remaining',remaining-healed);
END $$;
REVOKE ALL ON FUNCTION public.heal_creature_with_gems_atomic(uuid,text,text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.heal_creature_with_gems_atomic(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.buy_academy_capacity_atomic(p_kind text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t uuid; a academies%ROWTYPE; cost integer; target integer; moved jsonb;
BEGIN
 SELECT id INTO t FROM trainers WHERE user_id=auth.uid(); SELECT * INTO a FROM academies WHERE trainer_id=t FOR UPDATE;
 IF p_kind='builder' THEN cost:=CASE a.builders WHEN 1 THEN 250 WHEN 2 THEN 600 WHEN 3 THEN 1200 ELSE NULL END; target:=a.builders+1;
 ELSIF p_kind='roster' THEN cost:=CASE a.roster_slots WHEN 26 THEN 400 WHEN 32 THEN 900 ELSE NULL END; target:=CASE a.roster_slots WHEN 26 THEN 32 WHEN 32 THEN 38 END;
 ELSE RAISE EXCEPTION 'invalid capacity'; END IF;
 IF cost IS NULL THEN RAISE EXCEPTION 'maximum capacity reached'; END IF;
 moved:=private_gem_move(t,cost,'debit',p_kind||'_purchase','academy',a.id::text,p_idempotency_key);
 IF NOT COALESCE((moved->>'replayed')::boolean,false) THEN
   IF p_kind='builder' THEN UPDATE academies SET builders=target WHERE id=a.id; ELSE UPDATE academies SET roster_slots=target WHERE id=a.id; END IF;
 END IF;
 RETURN moved || jsonb_build_object('spent',cost,'target',target);
END $$;
REVOKE ALL ON FUNCTION public.buy_academy_capacity_atomic(text,text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.buy_academy_capacity_atomic(text,text) TO authenticated;

ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS gems integer CHECK(gems>0);
ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS provider_transaction_id text;
ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_provider_tx_idx ON public.payment_orders(provider,provider_transaction_id) WHERE provider_transaction_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_payment_order(p_product_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t uuid; cents integer; qty integer; oid uuid;
BEGIN
 SELECT id INTO t FROM trainers WHERE user_id=auth.uid(); IF t IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
 SELECT c,q INTO cents,qty FROM (VALUES ('gem_pack_100',790,100),('gem_pack_450',2490,450),('gem_pack_1050',4990,1050),('gem_pack_2200',8490,2200),('gem_pack_6000',19990,6000)) v(k,c,q) WHERE k=p_product_key;
 IF cents IS NULL THEN RAISE EXCEPTION 'invalid product'; END IF;
 INSERT INTO payment_orders(trainer_id,product_key,sku,amount_cents,gems) VALUES(t,p_product_key,p_product_key,cents,qty) RETURNING id INTO oid;
 RETURN jsonb_build_object('order_id',oid,'sku',p_product_key,'amount_cents',cents,'currency','BRL','gems',qty,'status','pending');
END $$;

CREATE OR REPLACE FUNCTION public.confirm_payment_order_atomic(p_order uuid,p_provider text,p_transaction text,p_sku text,p_amount integer,p_currency text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o payment_orders%ROWTYPE; moved jsonb; uid uuid;
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'service role required'; END IF;
 SELECT * INTO o FROM payment_orders WHERE id=p_order FOR UPDATE; IF o.id IS NULL THEN RAISE EXCEPTION 'order not found'; END IF;
 IF o.status='paid' THEN RETURN jsonb_build_object('confirmed',true,'replayed',true); END IF;
 IF o.status NOT IN ('pending','processing') OR o.sku<>p_sku OR o.amount_cents<>p_amount OR o.currency<>p_currency THEN RAISE EXCEPTION 'purchase validation failed'; END IF;
 IF EXISTS(SELECT 1 FROM payment_orders WHERE provider=p_provider AND provider_transaction_id=p_transaction AND id<>p_order) THEN RAISE EXCEPTION 'transaction already processed'; END IF;
 moved:=private_gem_move(o.trainer_id,o.gems,'credit','package_purchased','payment_order',o.id::text,'payment:'||p_provider||':'||p_transaction);
 UPDATE payment_orders SET status='paid',provider=p_provider,provider_transaction_id=p_transaction,provider_order_id=p_transaction,paid_at=now(),confirmed_at=now(),updated_at=now() WHERE id=o.id;
 SELECT user_id INTO uid FROM trainers WHERE id=o.trainer_id;
 INSERT INTO game_telemetry_events(user_id,trainer_id,event_name,route,metadata) VALUES(uid,o.trainer_id,'package_purchased','webhook',jsonb_build_object('order_id',o.id,'sku',o.sku,'provider',p_provider));
 RETURN moved || jsonb_build_object('confirmed',true);
END $$;
REVOKE ALL ON FUNCTION public.confirm_payment_order_atomic(uuid,text,text,text,integer,text) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.confirm_payment_order_atomic(uuid,text,text,text,integer,text) TO service_role;

CREATE OR REPLACE VIEW public.gem_reconciliation WITH (security_invoker=true) AS
SELECT b.trainer_id,a.gems AS actual_balance,
 b.balance_at_baseline + COALESCE(SUM(CASE WHEN l.direction='credit' THEN l.amount ELSE -l.amount END) FILTER(WHERE l.created_at>=b.baseline_at),0) AS expected_balance,
 a.gems-(b.balance_at_baseline + COALESCE(SUM(CASE WHEN l.direction='credit' THEN l.amount ELSE -l.amount END) FILTER(WHERE l.created_at>=b.baseline_at),0)) AS difference
FROM gem_ledger_baselines b JOIN academies a ON a.trainer_id=b.trainer_id LEFT JOIN gem_ledger l ON l.trainer_id=b.trainer_id GROUP BY b.trainer_id,a.gems,b.balance_at_baseline;
REVOKE ALL ON public.gem_reconciliation FROM PUBLIC,anon,authenticated; GRANT SELECT ON public.gem_reconciliation TO service_role;

-- Substitui o débito legado das velocidades por uma operação registrada no ledger.
CREATE OR REPLACE FUNCTION public.unlock_match_speed_with_gems(p_mode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t uuid; a academies%ROWTYPE; cost integer; moved jsonb;
BEGIN
 SELECT id INTO t FROM trainers WHERE user_id=auth.uid();
 IF t IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
 IF p_mode NOT IN ('2x','4x','instant','bundle') THEN RAISE EXCEPTION 'invalid speed mode'; END IF;
 SELECT * INTO a FROM academies WHERE trainer_id=t FOR UPDATE;
 IF (p_mode='2x' AND a.paid_2x) OR (p_mode='4x' AND a.paid_4x) OR
    (p_mode='instant' AND a.paid_instant) OR
    (p_mode='bundle' AND a.paid_2x AND a.paid_4x AND a.paid_instant) THEN
   RETURN jsonb_build_object('ok',true,'already_owned',true,'gems',a.gems);
 END IF;
 cost:=CASE p_mode WHEN '2x' THEN 100 WHEN '4x' THEN 300 WHEN 'instant' THEN 800
   ELSE LEAST(1050,(CASE WHEN a.paid_2x THEN 0 ELSE 100 END)+(CASE WHEN a.paid_4x THEN 0 ELSE 300 END)+(CASE WHEN a.paid_instant THEN 0 ELSE 800 END)) END;
 moved:=private_gem_move(t,cost,'debit','speed_unlock','academy',a.id::text,
   'speed:'||t::text||':'||p_mode);
 IF NOT COALESCE((moved->>'replayed')::boolean,false) THEN
   UPDATE academies SET paid_2x=paid_2x OR p_mode IN ('2x','bundle'),
     paid_4x=paid_4x OR p_mode IN ('4x','bundle'),
     paid_instant=paid_instant OR p_mode IN ('instant','bundle') WHERE id=a.id;
 END IF;
 RETURN moved||jsonb_build_object('ok',true,'mode',p_mode,'gems_spent',cost);
END $$;
REVOKE ALL ON FUNCTION public.unlock_match_speed_with_gems(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.unlock_match_speed_with_gems(text) TO authenticated;

-- Créditos de fim de temporada têm catálogo fechado e idempotência obrigatória.
CREATE OR REPLACE FUNCTION public.award_season_gems_atomic(
 p_amount integer,p_reason text,p_season_id text,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t uuid;
BEGIN
 SELECT id INTO t FROM trainers WHERE user_id=auth.uid();
 IF t IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
 IF p_reason NOT IN ('season_champion','division_promotion') OR p_amount<1 OR p_amount>500 THEN
   RAISE EXCEPTION 'invalid season reward';
 END IF;
 RETURN private_gem_move(t,p_amount,'credit',p_reason,'season',p_season_id,p_idempotency_key);
END $$;
REVOKE ALL ON FUNCTION public.award_season_gems_atomic(integer,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.award_season_gems_atomic(integer,text,text,text) TO authenticated;
