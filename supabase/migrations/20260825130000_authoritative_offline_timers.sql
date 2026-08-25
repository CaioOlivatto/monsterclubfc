-- Timers autoritativos: o banco, e não o navegador/servidor web, define o início e o fim.
CREATE OR REPLACE FUNCTION public.start_building_upgrade_atomic_v2(
  p_type text, p_cost bigint, p_duration_seconds integer, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_trainer public.trainers%ROWTYPE; v_building public.buildings%ROWTYPE;
  v_balance bigint; v_result jsonb; v_claimed integer; v_max integer; v_end timestamptz;
BEGIN
  IF p_type NOT IN ('ct_treino','estadio','centro_medico') OR p_cost<=0 OR p_duration_seconds<=0
     OR nullif(p_idempotency_key,'') IS NULL THEN RAISE EXCEPTION 'Parâmetros de construção inválidos'; END IF;
  SELECT * INTO v_trainer FROM public.trainers WHERE user_id=auth.uid();
  IF NOT FOUND OR v_trainer.current_team_id IS NULL THEN RAISE EXCEPTION 'Treinador não autorizado'; END IF;
  INSERT INTO public.economy_operations(trainer_id,idempotency_key,operation_type)
    VALUES(v_trainer.id,p_idempotency_key,'building_upgrade_start') ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_claimed=ROW_COUNT;
  IF v_claimed=0 THEN SELECT result INTO v_result FROM public.economy_operations
    WHERE trainer_id=v_trainer.id AND idempotency_key=p_idempotency_key;
    RETURN coalesce(v_result,'{}'::jsonb)||jsonb_build_object('replayed',true); END IF;
  PERFORM 1 FROM public.buildings WHERE team_id=v_trainer.current_team_id
    AND upgrade_completes_at>now() FOR UPDATE;
  IF FOUND THEN RAISE EXCEPTION 'Seu construtor já está trabalhando em outra obra'; END IF;
  SELECT * INTO v_building FROM public.buildings WHERE team_id=v_trainer.current_team_id
    AND building_type=p_type FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Construção não encontrada'; END IF;
  v_max:=CASE WHEN p_type='estadio' THEN 10 ELSE 5 END;
  IF coalesce(v_building.level,1)>=v_max THEN RAISE EXCEPTION 'Esta estrutura já está no nível máximo'; END IF;
  UPDATE public.academies SET money=money-p_cost WHERE trainer_id=v_trainer.id AND money>=p_cost RETURNING money INTO v_balance;
  IF NOT FOUND THEN RAISE EXCEPTION 'Saldo insuficiente para iniciar esta obra'; END IF;
  v_end:=now()+make_interval(secs=>p_duration_seconds);
  UPDATE public.buildings SET upgrade_completes_at=v_end WHERE id=v_building.id;
  INSERT INTO public.financial_transactions(trainer_id,transaction_type,amount,description)
    VALUES(v_trainer.id,'expense',p_cost,'Construção: '||p_type||' nível '||(coalesce(v_building.level,1)+1));
  v_result:=jsonb_build_object('ok',true,'balance',v_balance,'completes_at',v_end,'building_type',p_type,
    'target_level',coalesce(v_building.level,1)+1);
  UPDATE public.economy_operations SET result=v_result WHERE trainer_id=v_trainer.id AND idempotency_key=p_idempotency_key;
  RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.start_attribute_training_atomic(
  p_creature uuid, p_key text, p_duration_seconds integer, p_pending_half_stars integer, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_trainer uuid; v_creature public.creatures%ROWTYPE; v_claimed integer; v_result jsonb; v_end timestamptz;
BEGIN
  IF p_key NOT IN ('defender','passar','atacar','tecnica','forca','pique','maos','concentracao','elasticidade')
    OR p_duration_seconds<=0 OR nullif(p_idempotency_key,'') IS NULL THEN RAISE EXCEPTION 'Parâmetros de treino inválidos'; END IF;
  SELECT id INTO v_trainer FROM public.trainers WHERE user_id=auth.uid();
  INSERT INTO public.economy_operations(trainer_id,idempotency_key,operation_type)
    VALUES(v_trainer,p_idempotency_key,'attribute_training_start') ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_claimed=ROW_COUNT;
  IF v_claimed=0 THEN SELECT result INTO v_result FROM public.economy_operations WHERE trainer_id=v_trainer AND idempotency_key=p_idempotency_key;
    RETURN coalesce(v_result,'{}'::jsonb)||jsonb_build_object('replayed',true); END IF;
  SELECT * INTO v_creature FROM public.creatures WHERE id=p_creature AND owner_trainer_id=v_trainer FOR UPDATE;
  IF NOT FOUND OR coalesce(v_creature.retired,false) THEN RAISE EXCEPTION 'Criatura indisponível'; END IF;
  IF v_creature.attr_training_completes_at>now() THEN RAISE EXCEPTION 'Já há treino em andamento'; END IF;
  IF coalesce(v_creature.energy,0)<20 THEN RAISE EXCEPTION 'Energia insuficiente'; END IF;
  IF coalesce(v_creature.xp,0)<100 THEN RAISE EXCEPTION 'XP insuficiente'; END IF;
  v_end:=now()+make_interval(secs=>p_duration_seconds);
  UPDATE public.creatures SET xp=xp-100,xp_spent_training=coalesce(xp_spent_training,0)+100,
    pending_half_stars=greatest(0,p_pending_half_stars),energy=greatest(0,energy-20),
    attr_training_key=p_key,attr_training_completes_at=v_end WHERE id=p_creature;
  v_result:=jsonb_build_object('ok',true,'completes_at',v_end,'xp_left',v_creature.xp-100,'xp_spent',100);
  UPDATE public.economy_operations SET result=v_result WHERE trainer_id=v_trainer AND idempotency_key=p_idempotency_key;
  RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.start_individual_morale_atomic(
  p_creature uuid, p_duration_seconds integer, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_trainer uuid; v_end timestamptz; v_claimed integer; v_result jsonb;
BEGIN
  SELECT id INTO v_trainer FROM public.trainers WHERE user_id=auth.uid();
  IF v_trainer IS NULL OR p_duration_seconds<=0 OR nullif(p_idempotency_key,'') IS NULL THEN RAISE EXCEPTION 'Parâmetros inválidos'; END IF;
  INSERT INTO public.economy_operations(trainer_id,idempotency_key,operation_type)
    VALUES(v_trainer,p_idempotency_key,'individual_morale_start') ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_claimed=ROW_COUNT;
  IF v_claimed=0 THEN SELECT result INTO v_result FROM public.economy_operations WHERE trainer_id=v_trainer AND idempotency_key=p_idempotency_key;
    RETURN coalesce(v_result,'{}'::jsonb)||jsonb_build_object('replayed',true); END IF;
  v_end:=now()+make_interval(secs=>p_duration_seconds);
  UPDATE public.creatures SET morale_session_completes_at=v_end WHERE id=p_creature AND owner_trainer_id=v_trainer
    AND NOT coalesce(retired,false) AND (morale_session_completes_at IS NULL OR morale_session_completes_at<=now());
  IF NOT FOUND THEN RAISE EXCEPTION 'Criatura indisponível ou sessão já ativa'; END IF;
  v_result:=jsonb_build_object('ok',true,'completes_at',v_end);
  UPDATE public.economy_operations SET result=v_result WHERE trainer_id=v_trainer AND idempotency_key=p_idempotency_key;
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.start_building_upgrade_atomic_v2(text,bigint,integer,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.start_attribute_training_atomic(uuid,text,integer,integer,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.start_individual_morale_atomic(uuid,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_building_upgrade_atomic_v2(text,bigint,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_attribute_training_atomic(uuid,text,integer,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_individual_morale_atomic(uuid,integer,text) TO authenticated;
