-- A coluna creatures.element usa o enum public.element_type. A função de compra
-- recebia o elemento dentro de JSONB e o inseria como text, o que fazia o Postgres
-- rejeitar a contratação. Recriar a função com o cast explícito preserva a mesma
-- transação atômica, limites e idempotência já existentes.
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
  IF p_currency NOT IN ('money','gems') OR p_price <= 0 OR p_idempotency_key IS NULL THEN RAISE EXCEPTION 'invalid market purchase'; END IF;
  IF p_is_premium AND p_currency <> 'gems' THEN RAISE EXCEPTION 'premium offer requires gems'; END IF;
  IF v_listing_id IS NULL OR v_name IS NULL OR p_division NOT IN ('bronze','prata','ouro','diamante','lendaria') THEN RAISE EXCEPTION 'invalid listing snapshot'; END IF;
  IF (p_listing->>'element') NOT IN ('fogo','agua','terra','ar','gelo') THEN RAISE EXCEPTION 'invalid creature element'; END IF;

  SELECT id INTO v_trainer FROM public.trainers WHERE user_id=auth.uid();
  IF v_trainer IS NULL THEN RAISE EXCEPTION 'trainer not found'; END IF;
  INSERT INTO public.economy_operations(trainer_id,idempotency_key,operation_type)
  VALUES(v_trainer,p_idempotency_key,CASE WHEN p_is_premium THEN 'premium_market_purchase' ELSE 'market_purchase' END) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  IF v_claimed=0 THEN
    SELECT result INTO v_result FROM public.economy_operations WHERE trainer_id=v_trainer AND idempotency_key=p_idempotency_key;
    RETURN v_result || jsonb_build_object('replayed',true);
  END IF;

  SELECT money,gems,roster_slots INTO v_money,v_gems,v_roster_slots FROM public.academies WHERE trainer_id=v_trainer FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'academy not found'; END IF;
  SELECT count(*) INTO v_roster_count FROM public.creatures WHERE owner_trainer_id=v_trainer;
  IF v_roster_count >= v_roster_slots THEN RAISE EXCEPTION 'roster full'; END IF;
  IF p_is_premium THEN
    IF EXISTS(SELECT 1 FROM public.premium_signings WHERE trainer_id=v_trainer AND season_number=p_season_number AND division=p_division::public.division_type) THEN RAISE EXCEPTION 'premium offer already used this season and division'; END IF;
  ELSIF EXISTS(SELECT 1 FROM public.market_purchases WHERE trainer_id=v_trainer AND season_number=p_season_number AND division=p_division AND listing_id=v_listing_id) THEN RAISE EXCEPTION 'listing already purchased'; END IF;

  IF p_currency='money' THEN
    IF v_money < p_price THEN RAISE EXCEPTION 'insufficient club money'; END IF;
    UPDATE public.academies SET money=money-p_price,updated_at=now() WHERE trainer_id=v_trainer;
    INSERT INTO public.financial_transactions(trainer_id,transaction_type,amount,description) VALUES(v_trainer,'expense',p_price,'Contratação: '||v_name);
  ELSE
    IF v_gems < p_price OR p_price > 2147483647 THEN RAISE EXCEPTION 'insufficient gems'; END IF;
    v_gems_after:=v_gems-p_price::integer;
    UPDATE public.academies SET gems=v_gems_after,updated_at=now() WHERE trainer_id=v_trainer;
    INSERT INTO public.gem_ledger(trainer_id,amount,direction,reason,balance_before,balance_after,reference_type,reference_id,idempotency_key)
    VALUES(v_trainer,p_price::integer,'debit',CASE WHEN p_is_premium THEN 'premium_player_purchase' ELSE 'market_player_purchase' END,v_gems,v_gems_after,'market_listing',v_listing_id,p_idempotency_key);
  END IF;

  v_half_stars:=greatest(0,least(10,round(coalesce((p_listing->>'overall')::numeric,0)/10)::integer));
  INSERT INTO public.creatures(owner_trainer_id,name,species,epithet,element,suggested_position,is_goalkeeper,power_key,attr_defender,attr_passar,attr_atacar,attr_tecnica,attr_forca,attr_pique,attr_maos,attr_concentracao,attr_elasticidade,overall,half_stars_earned,career_baseline_xp,energy,market_value,age,aff_fogo,aff_agua,aff_terra,aff_ar,aff_gelo,is_prodigy,salary_mult)
  VALUES(v_trainer,v_name,p_listing->>'species',p_listing->>'epithet',(p_listing->>'element')::public.element_type,p_listing->>'suggested_position',coalesce((p_listing->>'is_goalkeeper')::boolean,false),p_listing->>'power_key',coalesce((p_listing->>'attr_defender')::integer,0),coalesce((p_listing->>'attr_passar')::integer,0),coalesce((p_listing->>'attr_atacar')::integer,0),coalesce((p_listing->>'attr_tecnica')::integer,0),coalesce((p_listing->>'attr_forca')::integer,0),coalesce((p_listing->>'attr_pique')::integer,0),coalesce((p_listing->>'attr_maos')::integer,0),coalesce((p_listing->>'attr_concentracao')::integer,0),coalesce((p_listing->>'attr_elasticidade')::integer,0),coalesce((p_listing->>'overall')::integer,0),v_half_stars,coalesce((p_listing->>'career_baseline_xp')::integer,0),100,coalesce((p_listing->>'market_value')::bigint,0),coalesce((p_listing->>'age')::integer,18),0,0,0,0,0,coalesce((p_listing->>'is_prodigy')::boolean,false),p_salary_mult) RETURNING id INTO v_creature;

  INSERT INTO public.transfers(trainer_id,creature_id,transfer_type,amount) VALUES(v_trainer,v_creature,'buy',p_price);
  IF p_is_premium THEN
    INSERT INTO public.premium_signings(trainer_id,creature_id,offer_id,division,season_number,amount_gems) VALUES(v_trainer,v_creature,v_listing_id,p_division::public.division_type,p_season_number,p_price::integer);
  ELSE
    INSERT INTO public.market_purchases(trainer_id,season_number,division,listing_id) VALUES(v_trainer,p_season_number,p_division,v_listing_id);
  END IF;
  v_result:=jsonb_build_object('creature_id',v_creature,'name',v_name,'price',p_price,'currency',p_currency,'balance',CASE WHEN p_currency='money' THEN v_money-p_price ELSE v_gems_after END,'roster_count_after',v_roster_count+1,'roster_slots',v_roster_slots,'replayed',false);
  UPDATE public.economy_operations SET result=v_result WHERE trainer_id=v_trainer AND idempotency_key=p_idempotency_key;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.purchase_market_creature_atomic(jsonb,text,bigint,integer,text,boolean,real,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_market_creature_atomic(jsonb,text,bigint,integer,text,boolean,real,text) TO authenticated;
