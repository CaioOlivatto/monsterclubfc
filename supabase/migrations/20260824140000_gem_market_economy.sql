-- Economia final de gemas e mercado. Não altera saldos existentes.

-- Afeta apenas novas academias. Saldos existentes não são recalculados nem reduzidos.
ALTER TABLE public.academies ALTER COLUMN gems SET DEFAULT 10;

CREATE TABLE IF NOT EXISTS public.gem_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount > 0),
  direction text NOT NULL CHECK (direction IN ('credit', 'debit')),
  reason text NOT NULL,
  balance_before integer NOT NULL CHECK (balance_before >= 0),
  balance_after integer NOT NULL CHECK (balance_after >= 0),
  reference_type text,
  reference_id text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS gem_ledger_idempotency_idx
  ON public.gem_ledger(trainer_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS gem_ledger_trainer_created_idx ON public.gem_ledger(trainer_id, created_at DESC);
ALTER TABLE public.gem_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read own gem ledger" ON public.gem_ledger;
CREATE POLICY "read own gem ledger" ON public.gem_ledger FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = auth.uid()));
REVOKE INSERT, UPDATE, DELETE ON public.gem_ledger FROM authenticated, anon;
GRANT SELECT ON public.gem_ledger TO authenticated;
GRANT ALL ON public.gem_ledger TO service_role;

CREATE TABLE IF NOT EXISTS public.market_cycle_states (
  trainer_id uuid PRIMARY KEY REFERENCES public.trainers(id) ON DELETE CASCADE,
  cycle_number bigint NOT NULL,
  refresh_count integer NOT NULL DEFAULT 0 CHECK (refresh_count >= 0),
  rotation_number integer NOT NULL DEFAULT 0 CHECK (rotation_number >= 0),
  scout_position text CHECK (scout_position IS NULL OR scout_position IN ('GOL','DEF','MEI','ATA')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.market_cycle_states ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own market cycle" ON public.market_cycle_states;
CREATE POLICY "own market cycle" ON public.market_cycle_states FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = auth.uid()));
REVOKE INSERT, UPDATE, DELETE ON public.market_cycle_states FROM authenticated, anon;
GRANT SELECT ON public.market_cycle_states TO authenticated;
GRANT ALL ON public.market_cycle_states TO service_role;

-- Reserva uma operação antes de qualquer débito. A chave impede clique duplo,
-- repetição da rede e duas abas de cobrarem a mesma ação duas vezes.
CREATE TABLE IF NOT EXISTS public.economy_operations (
  trainer_id uuid NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  operation_type text NOT NULL,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trainer_id, idempotency_key)
);
ALTER TABLE public.economy_operations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read own economy operations" ON public.economy_operations;
CREATE POLICY "read own economy operations" ON public.economy_operations FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = auth.uid()));
REVOKE INSERT, UPDATE, DELETE ON public.economy_operations FROM authenticated, anon;
GRANT SELECT ON public.economy_operations TO authenticated;
GRANT ALL ON public.economy_operations TO service_role;

ALTER TABLE public.premium_signings DROP CONSTRAINT IF EXISTS premium_signings_trainer_id_key;
ALTER TABLE public.premium_signings ALTER COLUMN amount_cents DROP NOT NULL;
ALTER TABLE public.premium_signings ALTER COLUMN payment_provider DROP NOT NULL;
ALTER TABLE public.premium_signings ALTER COLUMN provider_payment_id DROP NOT NULL;
ALTER TABLE public.premium_signings ADD COLUMN IF NOT EXISTS amount_gems integer CHECK (amount_gems > 0);
CREATE UNIQUE INDEX IF NOT EXISTS premium_signings_season_division_idx
  ON public.premium_signings(trainer_id, season_number, division);

CREATE TABLE IF NOT EXISTS public.weekly_mission_weeks (
  trainer_id uuid NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  mission_keys text[] NOT NULL,
  claimed_keys text[] NOT NULL DEFAULT '{}',
  active_days date[] NOT NULL DEFAULT '{}',
  completion_claimed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trainer_id, week_start)
);
ALTER TABLE public.weekly_mission_weeks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own weekly missions" ON public.weekly_mission_weeks;
CREATE POLICY "own weekly missions" ON public.weekly_mission_weeks FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = auth.uid()));
REVOKE INSERT, UPDATE, DELETE ON public.weekly_mission_weeks FROM authenticated, anon;
GRANT SELECT ON public.weekly_mission_weeks TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_gem_delta_atomic(
  p_amount integer,
  p_direction text,
  p_reason text,
  p_reference_type text DEFAULT NULL,
  p_reference_id text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_trainer uuid;
  v_before integer;
  v_after integer;
  v_existing public.gem_ledger%ROWTYPE;
BEGIN
  IF p_amount <= 0 OR p_direction NOT IN ('credit','debit') THEN RAISE EXCEPTION 'invalid gem movement'; END IF;
  SELECT id INTO v_trainer FROM public.trainers WHERE user_id = auth.uid();
  IF v_trainer IS NULL THEN RAISE EXCEPTION 'trainer not found'; END IF;
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.gem_ledger WHERE trainer_id = v_trainer AND idempotency_key = p_idempotency_key;
    IF FOUND THEN RETURN jsonb_build_object('balance', v_existing.balance_after, 'replayed', true); END IF;
  END IF;
  SELECT gems INTO v_before FROM public.academies WHERE trainer_id = v_trainer FOR UPDATE;
  IF v_before IS NULL THEN RAISE EXCEPTION 'academy not found'; END IF;
  v_after := v_before + CASE WHEN p_direction = 'credit' THEN p_amount ELSE -p_amount END;
  IF v_after < 0 THEN RAISE EXCEPTION 'insufficient gems'; END IF;
  UPDATE public.academies SET gems = v_after, updated_at = now() WHERE trainer_id = v_trainer;
  INSERT INTO public.gem_ledger(trainer_id, amount, direction, reason, balance_before, balance_after, reference_type, reference_id, idempotency_key)
  VALUES(v_trainer, p_amount, p_direction, p_reason, v_before, v_after, p_reference_type, p_reference_id, p_idempotency_key);
  RETURN jsonb_build_object('balance', v_after, 'replayed', false);
END $$;
REVOKE ALL ON FUNCTION public.apply_gem_delta_atomic(integer,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_gem_delta_atomic(integer,text,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_market_cycle_context()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trainer uuid; v_cycle bigint := floor(extract(epoch FROM now()) / 43200); v_state public.market_cycle_states%ROWTYPE;
BEGIN
  SELECT id INTO v_trainer FROM public.trainers WHERE user_id = auth.uid();
  IF v_trainer IS NULL THEN RAISE EXCEPTION 'trainer not found'; END IF;
  INSERT INTO public.market_cycle_states(trainer_id, cycle_number) VALUES(v_trainer, v_cycle)
  ON CONFLICT(trainer_id) DO UPDATE SET cycle_number=v_cycle, refresh_count=CASE WHEN market_cycle_states.cycle_number<>v_cycle THEN 0 ELSE market_cycle_states.refresh_count END, rotation_number=CASE WHEN market_cycle_states.cycle_number<>v_cycle THEN 0 ELSE market_cycle_states.rotation_number END, scout_position=CASE WHEN market_cycle_states.cycle_number<>v_cycle THEN NULL ELSE market_cycle_states.scout_position END, updated_at=now();
  SELECT * INTO v_state FROM public.market_cycle_states WHERE trainer_id=v_trainer;
  RETURN jsonb_build_object('cycle_number',v_state.cycle_number,'refresh_count',v_state.refresh_count,'rotation_number',v_state.rotation_number,'scout_position',v_state.scout_position,'cycle_ends_at',to_timestamp((v_cycle+1)*43200));
END $$;
REVOKE ALL ON FUNCTION public.get_market_cycle_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_market_cycle_context() TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_market_atomic(p_division text, p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_trainer uuid; v_cycle bigint := floor(extract(epoch FROM now())/43200); v_state public.market_cycle_states%ROWTYPE; v_next integer; v_cost integer:=0; v_currency text:='free'; v_before integer; v_after integer; v_money bigint; v_money_cost bigint:=0; v_claimed integer; v_result jsonb;
BEGIN
  SELECT id INTO v_trainer FROM public.trainers WHERE user_id=auth.uid(); IF v_trainer IS NULL THEN RAISE EXCEPTION 'trainer not found'; END IF;
  INSERT INTO public.economy_operations(trainer_id,idempotency_key,operation_type)
  VALUES(v_trainer,p_idempotency_key,'market_refresh') ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  IF v_claimed=0 THEN SELECT result INTO v_result FROM public.economy_operations WHERE trainer_id=v_trainer AND idempotency_key=p_idempotency_key; RETURN v_result || jsonb_build_object('replayed',true); END IF;
  PERFORM public.get_market_cycle_context();
  SELECT * INTO v_state FROM public.market_cycle_states WHERE trainer_id=v_trainer FOR UPDATE;
  v_next:=v_state.refresh_count+1;
  IF v_next=2 THEN v_currency:='money'; v_money_cost:=CASE p_division WHEN 'bronze' THEN 25000 WHEN 'prata' THEN 60000 WHEN 'ouro' THEN 140000 WHEN 'diamante' THEN 320000 ELSE 700000 END;
  ELSIF v_next>=3 THEN v_currency:='gems'; v_cost:=CASE v_next WHEN 3 THEN 5 WHEN 4 THEN 10 WHEN 5 THEN 20 ELSE 30 END; END IF;
  SELECT gems,money INTO v_before,v_money FROM public.academies WHERE trainer_id=v_trainer FOR UPDATE;
  IF v_currency='money' THEN IF v_money<v_money_cost THEN RAISE EXCEPTION 'insufficient club money'; END IF; UPDATE public.academies SET money=money-v_money_cost WHERE trainer_id=v_trainer;
  ELSIF v_currency='gems' THEN IF v_before<v_cost THEN RAISE EXCEPTION 'insufficient gems'; END IF; v_after:=v_before-v_cost; UPDATE public.academies SET gems=v_after WHERE trainer_id=v_trainer; INSERT INTO public.gem_ledger(trainer_id,amount,direction,reason,balance_before,balance_after,reference_type,reference_id,idempotency_key) VALUES(v_trainer,v_cost,'debit','market_refresh',v_before,v_after,'market_cycle',v_cycle::text,p_idempotency_key); END IF;
  UPDATE public.market_cycle_states SET refresh_count=v_next,rotation_number=rotation_number+1,scout_position=NULL,updated_at=now() WHERE trainer_id=v_trainer;
  v_result:=public.get_market_cycle_context() || jsonb_build_object('currency',v_currency,'amount',CASE WHEN v_currency='money' THEN v_money_cost ELSE v_cost END,'replayed',false);
  UPDATE public.economy_operations SET result=v_result WHERE trainer_id=v_trainer AND idempotency_key=p_idempotency_key;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.refresh_market_atomic(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_market_atomic(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.use_market_scout_atomic(p_position text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_trainer uuid; v_cycle bigint := floor(extract(epoch FROM now())/43200); v_before integer; v_after integer; v_claimed integer; v_result jsonb;
BEGIN
  IF p_position NOT IN ('GOL','DEF','MEI','ATA') THEN RAISE EXCEPTION 'invalid position'; END IF;
  SELECT id INTO v_trainer FROM public.trainers WHERE user_id=auth.uid(); IF v_trainer IS NULL THEN RAISE EXCEPTION 'trainer not found'; END IF;
  INSERT INTO public.economy_operations(trainer_id,idempotency_key,operation_type)
  VALUES(v_trainer,p_idempotency_key,'market_scout') ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  IF v_claimed=0 THEN SELECT result INTO v_result FROM public.economy_operations WHERE trainer_id=v_trainer AND idempotency_key=p_idempotency_key; RETURN v_result || jsonb_build_object('replayed',true); END IF;
  PERFORM public.get_market_cycle_context();
  SELECT gems INTO v_before FROM public.academies WHERE trainer_id=v_trainer FOR UPDATE;
  IF v_before<10 THEN RAISE EXCEPTION 'insufficient gems'; END IF; v_after:=v_before-10;
  UPDATE public.academies SET gems=v_after WHERE trainer_id=v_trainer;
  INSERT INTO public.gem_ledger(trainer_id,amount,direction,reason,balance_before,balance_after,reference_type,reference_id,idempotency_key) VALUES(v_trainer,10,'debit','scout',v_before,v_after,'market_cycle',v_cycle::text,p_idempotency_key);
  UPDATE public.market_cycle_states SET rotation_number=rotation_number+1,scout_position=p_position,updated_at=now() WHERE trainer_id=v_trainer;
  v_result:=public.get_market_cycle_context() || jsonb_build_object('balance',v_after,'replayed',false);
  UPDATE public.economy_operations SET result=v_result WHERE trainer_id=v_trainer AND idempotency_key=p_idempotency_key;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.use_market_scout_atomic(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.use_market_scout_atomic(text,text) TO authenticated;

-- Compra completa em uma única transação: saldo, criatura, histórico e limite.
-- A oferta é reconstruída e validada pela função de servidor antes desta RPC;
-- o banco garante atomicidade, propriedade, limite e idempotência.
CREATE OR REPLACE FUNCTION public.purchase_market_creature_atomic(
  p_listing jsonb,
  p_currency text,
  p_price bigint,
  p_season_number integer,
  p_division text,
  p_is_premium boolean,
  p_salary_mult real,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_trainer uuid;
  v_creature uuid;
  v_roster_count integer;
  v_roster_slots integer;
  v_money bigint;
  v_gems integer;
  v_gems_after integer;
  v_claimed integer;
  v_result jsonb;
  v_half_stars integer;
  v_listing_id text := p_listing->>'id';
  v_name text := p_listing->>'name';
BEGIN
  IF p_currency NOT IN ('money','gems') OR p_price <= 0 OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'invalid market purchase';
  END IF;
  IF p_is_premium AND p_currency <> 'gems' THEN RAISE EXCEPTION 'premium offer requires gems'; END IF;
  IF v_listing_id IS NULL OR v_name IS NULL OR p_division NOT IN ('bronze','prata','ouro','diamante','lendaria') THEN
    RAISE EXCEPTION 'invalid listing snapshot';
  END IF;

  SELECT id INTO v_trainer FROM public.trainers WHERE user_id=auth.uid();
  IF v_trainer IS NULL THEN RAISE EXCEPTION 'trainer not found'; END IF;

  INSERT INTO public.economy_operations(trainer_id,idempotency_key,operation_type)
  VALUES(v_trainer,p_idempotency_key,CASE WHEN p_is_premium THEN 'premium_market_purchase' ELSE 'market_purchase' END)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  IF v_claimed=0 THEN
    SELECT result INTO v_result FROM public.economy_operations
      WHERE trainer_id=v_trainer AND idempotency_key=p_idempotency_key;
    RETURN v_result || jsonb_build_object('replayed',true);
  END IF;

  SELECT money,gems,roster_slots INTO v_money,v_gems,v_roster_slots
    FROM public.academies WHERE trainer_id=v_trainer FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'academy not found'; END IF;
  SELECT count(*) INTO v_roster_count FROM public.creatures WHERE owner_trainer_id=v_trainer;
  IF v_roster_count >= v_roster_slots THEN RAISE EXCEPTION 'roster full'; END IF;

  IF p_is_premium THEN
    IF EXISTS(SELECT 1 FROM public.premium_signings WHERE trainer_id=v_trainer AND season_number=p_season_number AND division=p_division::public.division_type) THEN
      RAISE EXCEPTION 'premium offer already used this season and division';
    END IF;
  ELSIF EXISTS(SELECT 1 FROM public.market_purchases WHERE trainer_id=v_trainer AND season_number=p_season_number AND division=p_division AND listing_id=v_listing_id) THEN
    RAISE EXCEPTION 'listing already purchased';
  END IF;

  IF p_currency='money' THEN
    IF v_money < p_price THEN RAISE EXCEPTION 'insufficient club money'; END IF;
    UPDATE public.academies SET money=money-p_price,updated_at=now() WHERE trainer_id=v_trainer;
    INSERT INTO public.financial_transactions(trainer_id,transaction_type,amount,description)
    VALUES(v_trainer,'expense',p_price,'Contratação: '||v_name);
  ELSE
    IF v_gems < p_price OR p_price > 2147483647 THEN RAISE EXCEPTION 'insufficient gems'; END IF;
    v_gems_after:=v_gems-p_price::integer;
    UPDATE public.academies SET gems=v_gems_after,updated_at=now() WHERE trainer_id=v_trainer;
    INSERT INTO public.gem_ledger(trainer_id,amount,direction,reason,balance_before,balance_after,reference_type,reference_id,idempotency_key)
    VALUES(v_trainer,p_price::integer,'debit',CASE WHEN p_is_premium THEN 'premium_player_purchase' ELSE 'market_player_purchase' END,v_gems,v_gems_after,'market_listing',v_listing_id,p_idempotency_key);
  END IF;

  v_half_stars:=greatest(0,least(10,round(coalesce((p_listing->>'overall')::numeric,0)/10)::integer));
  INSERT INTO public.creatures(
    owner_trainer_id,name,species,epithet,element,suggested_position,is_goalkeeper,power_key,
    attr_defender,attr_passar,attr_atacar,attr_tecnica,attr_forca,attr_pique,
    attr_maos,attr_concentracao,attr_elasticidade,overall,half_stars_earned,
    career_baseline_xp,energy,market_value,age,aff_fogo,aff_agua,aff_terra,aff_ar,aff_gelo,
    is_prodigy,salary_mult
  ) VALUES (
    v_trainer,v_name,p_listing->>'species',p_listing->>'epithet',p_listing->>'element',p_listing->>'suggested_position',
    coalesce((p_listing->>'is_goalkeeper')::boolean,false),p_listing->>'power_key',
    coalesce((p_listing->>'attr_defender')::integer,0),coalesce((p_listing->>'attr_passar')::integer,0),
    coalesce((p_listing->>'attr_atacar')::integer,0),coalesce((p_listing->>'attr_tecnica')::integer,0),
    coalesce((p_listing->>'attr_forca')::integer,0),coalesce((p_listing->>'attr_pique')::integer,0),
    coalesce((p_listing->>'attr_maos')::integer,0),coalesce((p_listing->>'attr_concentracao')::integer,0),
    coalesce((p_listing->>'attr_elasticidade')::integer,0),coalesce((p_listing->>'overall')::integer,0),v_half_stars,
    coalesce((p_listing->>'career_baseline_xp')::integer,0),100,coalesce((p_listing->>'market_value')::bigint,0),
    coalesce((p_listing->>'age')::integer,18),0,0,0,0,0,coalesce((p_listing->>'is_prodigy')::boolean,false),p_salary_mult
  ) RETURNING id INTO v_creature;

  INSERT INTO public.transfers(trainer_id,creature_id,transfer_type,amount)
  VALUES(v_trainer,v_creature,'buy',p_price);
  IF p_is_premium THEN
    INSERT INTO public.premium_signings(trainer_id,creature_id,offer_id,division,season_number,amount_gems)
    VALUES(v_trainer,v_creature,v_listing_id,p_division::public.division_type,p_season_number,p_price::integer);
  ELSE
    INSERT INTO public.market_purchases(trainer_id,season_number,division,listing_id)
    VALUES(v_trainer,p_season_number,p_division,v_listing_id);
  END IF;

  v_result:=jsonb_build_object(
    'creature_id',v_creature,'name',v_name,'price',p_price,'currency',p_currency,
    'balance',CASE WHEN p_currency='money' THEN v_money-p_price ELSE v_gems_after END,
    'roster_count_after',v_roster_count+1,'roster_slots',v_roster_slots,'replayed',false
  );
  UPDATE public.economy_operations SET result=v_result WHERE trainer_id=v_trainer AND idempotency_key=p_idempotency_key;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.purchase_market_creature_atomic(jsonb,text,bigint,integer,text,boolean,real,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_market_creature_atomic(jsonb,text,bigint,integer,text,boolean,real,text) TO authenticated;

-- Missões semanais: progresso e resgate são controlados no servidor.
ALTER TABLE public.weekly_mission_weeks
  ADD COLUMN IF NOT EXISTS progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS completion_claimed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_active_date date;

CREATE OR REPLACE FUNCTION public.get_weekly_mission_state()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_trainer uuid;
  v_week date := date_trunc('week', timezone('America/Sao_Paulo',now()))::date;
  v_row public.weekly_mission_weeks%ROWTYPE;
BEGIN
  SELECT id INTO v_trainer FROM public.trainers WHERE user_id=auth.uid();
  IF v_trainer IS NULL THEN RAISE EXCEPTION 'trainer not found'; END IF;
  INSERT INTO public.weekly_mission_weeks(trainer_id,week_start,mission_keys)
  VALUES(v_trainer,v_week,ARRAY['active_days_5','play_matches_3','win_matches_2','score_goals_5','training_1','market_visit_1','sign_player_1'])
  ON CONFLICT(trainer_id,week_start) DO NOTHING;
  SELECT * INTO v_row FROM public.weekly_mission_weeks WHERE trainer_id=v_trainer AND week_start=v_week;
  RETURN jsonb_build_object(
    'week_start',v_week,'mission_keys',v_row.mission_keys,'claimed_keys',v_row.claimed_keys,
    'progress',v_row.progress,'active_days',v_row.active_days,'completion_claimed',v_row.completion_claimed,
    'weekly_ceiling',20
  );
END $$;
REVOKE ALL ON FUNCTION public.get_weekly_mission_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_weekly_mission_state() TO authenticated;

CREATE OR REPLACE FUNCTION public.record_weekly_mission_progress(
  p_event text,
  p_amount integer DEFAULT 1,
  p_event_date date DEFAULT timezone('America/Sao_Paulo',now())::date
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_trainer uuid;
  v_week date := date_trunc('week',p_event_date)::date;
  v_key text;
  v_row public.weekly_mission_weeks%ROWTYPE;
  v_current integer;
BEGIN
  IF p_amount<=0 THEN RAISE EXCEPTION 'invalid progress amount'; END IF;
  v_key:=CASE p_event
    WHEN 'match_played' THEN 'play_matches_3' WHEN 'match_won' THEN 'win_matches_2'
    WHEN 'goal_scored' THEN 'score_goals_5' WHEN 'training_started' THEN 'training_1'
    WHEN 'market_opened' THEN 'market_visit_1' WHEN 'player_signed' THEN 'sign_player_1'
    WHEN 'building_upgraded' THEN 'building_upgrade_1' WHEN 'strategy_changed' THEN 'strategy_change_1'
    WHEN 'substitution_made' THEN 'substitution_1' ELSE NULL END;
  SELECT id INTO v_trainer FROM public.trainers WHERE user_id=auth.uid();
  IF v_trainer IS NULL THEN RAISE EXCEPTION 'trainer not found'; END IF;
  PERFORM public.get_weekly_mission_state();
  SELECT * INTO v_row FROM public.weekly_mission_weeks WHERE trainer_id=v_trainer AND week_start=v_week FOR UPDATE;
  IF v_row.last_active_date IS DISTINCT FROM p_event_date THEN
    v_row.active_days:=least(5,v_row.active_days+1);
    v_row.last_active_date:=p_event_date;
  END IF;
  IF v_key IS NOT NULL AND v_key=ANY(v_row.mission_keys) THEN
    v_current:=coalesce((v_row.progress->>v_key)::integer,0)+p_amount;
    v_row.progress:=jsonb_set(v_row.progress,ARRAY[v_key],to_jsonb(v_current),true);
  END IF;
  UPDATE public.weekly_mission_weeks SET progress=v_row.progress,active_days=v_row.active_days,last_active_date=v_row.last_active_date
    WHERE trainer_id=v_trainer AND week_start=v_week;
  RETURN public.get_weekly_mission_state();
END $$;
REVOKE ALL ON FUNCTION public.record_weekly_mission_progress(text,integer,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_weekly_mission_progress(text,integer,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_weekly_mission_atomic(p_mission_key text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_trainer uuid; v_week date:=date_trunc('week',timezone('America/Sao_Paulo',now()))::date;
  v_row public.weekly_mission_weeks%ROWTYPE; v_target integer; v_reward integer; v_progress integer;
  v_before integer; v_after integer; v_completed integer; v_claimed integer; v_result jsonb;
BEGIN
  SELECT id INTO v_trainer FROM public.trainers WHERE user_id=auth.uid(); IF v_trainer IS NULL THEN RAISE EXCEPTION 'trainer not found'; END IF;
  PERFORM public.get_weekly_mission_state();
  INSERT INTO public.economy_operations(trainer_id,idempotency_key,operation_type) VALUES(v_trainer,p_idempotency_key,'weekly_mission_claim') ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_claimed=ROW_COUNT;
  IF v_claimed=0 THEN SELECT result INTO v_result FROM public.economy_operations WHERE trainer_id=v_trainer AND idempotency_key=p_idempotency_key; RETURN v_result||jsonb_build_object('replayed',true); END IF;
  SELECT * INTO v_row FROM public.weekly_mission_weeks WHERE trainer_id=v_trainer AND week_start=v_week FOR UPDATE;
  IF NOT (p_mission_key=ANY(v_row.mission_keys)) OR p_mission_key=ANY(v_row.claimed_keys) THEN RAISE EXCEPTION 'mission unavailable'; END IF;
  SELECT target,reward INTO v_target,v_reward FROM (VALUES
    ('active_days_5',5,3),('play_matches_3',3,2),('win_matches_2',2,2),('score_goals_5',5,2),
    ('training_1',1,2),('market_visit_1',1,1),('sign_player_1',1,3),('building_upgrade_1',1,2),
    ('strategy_change_1',1,1),('substitution_1',1,1)
  ) AS m(key,target,reward) WHERE key=p_mission_key;
  v_progress:=CASE WHEN p_mission_key='active_days_5' THEN v_row.active_days ELSE coalesce((v_row.progress->>p_mission_key)::integer,0) END;
  IF v_progress<v_target THEN RAISE EXCEPTION 'mission incomplete'; END IF;
  SELECT gems INTO v_before FROM public.academies WHERE trainer_id=v_trainer FOR UPDATE; v_after:=v_before+v_reward;
  UPDATE public.academies SET gems=v_after,updated_at=now() WHERE trainer_id=v_trainer;
  UPDATE public.weekly_mission_weeks SET claimed_keys=array_append(claimed_keys,p_mission_key) WHERE trainer_id=v_trainer AND week_start=v_week;
  INSERT INTO public.gem_ledger(trainer_id,amount,direction,reason,balance_before,balance_after,reference_type,reference_id,idempotency_key)
  VALUES(v_trainer,v_reward,'credit','weekly_mission',v_before,v_after,'weekly_mission',v_week::text||':'||p_mission_key,p_idempotency_key);
  SELECT cardinality(claimed_keys) INTO v_completed FROM public.weekly_mission_weeks WHERE trainer_id=v_trainer AND week_start=v_week;
  v_result:=jsonb_build_object('reward',v_reward,'balance',v_after,'claimed',p_mission_key,'completed',v_completed,'replayed',false);
  UPDATE public.economy_operations SET result=v_result WHERE trainer_id=v_trainer AND idempotency_key=p_idempotency_key;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.claim_weekly_mission_atomic(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_weekly_mission_atomic(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_weekly_completion_atomic(p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_trainer uuid; v_week date:=date_trunc('week',timezone('America/Sao_Paulo',now()))::date;
  v_row public.weekly_mission_weeks%ROWTYPE; v_before integer; v_after integer;
  v_inserted integer; v_result jsonb; v_reward constant integer:=5;
BEGIN
  SELECT id INTO v_trainer FROM public.trainers WHERE user_id=auth.uid();
  IF v_trainer IS NULL THEN RAISE EXCEPTION 'trainer not found'; END IF;
  PERFORM public.get_weekly_mission_state();
  INSERT INTO public.economy_operations(trainer_id,idempotency_key,operation_type)
  VALUES(v_trainer,p_idempotency_key,'weekly_completion_claim') ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted=ROW_COUNT;
  IF v_inserted=0 THEN
    SELECT result INTO v_result FROM public.economy_operations WHERE trainer_id=v_trainer AND idempotency_key=p_idempotency_key;
    RETURN coalesce(v_result,'{}'::jsonb)||jsonb_build_object('replayed',true);
  END IF;
  SELECT * INTO v_row FROM public.weekly_mission_weeks WHERE trainer_id=v_trainer AND week_start=v_week FOR UPDATE;
  IF v_row.completion_claimed THEN RAISE EXCEPTION 'weekly completion already claimed'; END IF;
  IF cardinality(v_row.claimed_keys)<cardinality(v_row.mission_keys) THEN RAISE EXCEPTION 'weekly missions incomplete'; END IF;
  SELECT gems INTO v_before FROM public.academies WHERE trainer_id=v_trainer FOR UPDATE;
  v_after:=v_before+v_reward;
  UPDATE public.academies SET gems=v_after,updated_at=now() WHERE trainer_id=v_trainer;
  UPDATE public.weekly_mission_weeks SET completion_claimed=true WHERE trainer_id=v_trainer AND week_start=v_week;
  INSERT INTO public.gem_ledger(trainer_id,amount,direction,reason,balance_before,balance_after,reference_type,reference_id,idempotency_key)
  VALUES(v_trainer,v_reward,'credit','weekly_completion',v_before,v_after,'weekly_mission_week',v_week::text,p_idempotency_key);
  v_result:=jsonb_build_object('reward',v_reward,'balance',v_after,'replayed',false);
  UPDATE public.economy_operations SET result=v_result WHERE trainer_id=v_trainer AND idempotency_key=p_idempotency_key;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.claim_weekly_completion_atomic(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_weekly_completion_atomic(text) TO authenticated;
