CREATE OR REPLACE FUNCTION public.start_building_upgrade_atomic(
  p_type text,
  p_cost bigint,
  p_completes_at timestamptz,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_trainer public.trainers%ROWTYPE;
  v_building public.buildings%ROWTYPE;
  v_balance bigint;
  v_result jsonb;
  v_max_level integer;
  v_claimed integer;
BEGIN
  IF p_type NOT IN ('ct_treino', 'estadio', 'centro_medico')
     OR p_cost <= 0 OR p_completes_at <= now() OR nullif(p_idempotency_key, '') IS NULL THEN
    RAISE EXCEPTION 'Parâmetros de construção inválidos';
  END IF;

  SELECT * INTO v_trainer FROM public.trainers WHERE user_id = auth.uid();
  IF NOT FOUND OR v_trainer.current_team_id IS NULL THEN
    RAISE EXCEPTION 'Treinador não autorizado';
  END IF;

  INSERT INTO public.economy_operations(trainer_id, idempotency_key, operation_type)
  VALUES(v_trainer.id, p_idempotency_key, 'building_upgrade_start')
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  IF v_claimed = 0 THEN
    SELECT result INTO v_result FROM public.economy_operations
     WHERE trainer_id = v_trainer.id AND idempotency_key = p_idempotency_key;
    RETURN coalesce(v_result, '{}'::jsonb) || jsonb_build_object('replayed', true);
  END IF;

  PERFORM 1 FROM public.buildings
   WHERE team_id = v_trainer.current_team_id
     AND upgrade_completes_at IS NOT NULL
     AND upgrade_completes_at > now()
   FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION 'Seu construtor já está trabalhando em outra obra';
  END IF;

  SELECT * INTO v_building FROM public.buildings
   WHERE team_id = v_trainer.current_team_id AND building_type = p_type
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Construção não encontrada'; END IF;

  v_max_level := CASE WHEN p_type = 'estadio' THEN 10 ELSE 5 END;
  IF coalesce(v_building.level, 1) >= v_max_level THEN
    RAISE EXCEPTION 'Esta estrutura já está no nível máximo';
  END IF;

  UPDATE public.academies
     SET money = money - p_cost
   WHERE trainer_id = v_trainer.id AND money >= p_cost
  RETURNING money INTO v_balance;
  IF NOT FOUND THEN RAISE EXCEPTION 'Saldo insuficiente para iniciar esta obra'; END IF;

  UPDATE public.buildings SET upgrade_completes_at = p_completes_at WHERE id = v_building.id;
  INSERT INTO public.financial_transactions(trainer_id, transaction_type, amount, description)
  VALUES(v_trainer.id, 'expense', p_cost,
    'Construção: ' || p_type || ' nível ' || (coalesce(v_building.level, 1) + 1));

  v_result := jsonb_build_object(
    'ok', true,
    'balance', v_balance,
    'completes_at', p_completes_at,
    'building_type', p_type,
    'target_level', coalesce(v_building.level, 1) + 1
  );
  UPDATE public.economy_operations SET result = v_result
   WHERE trainer_id = v_trainer.id AND idempotency_key = p_idempotency_key;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.start_building_upgrade_atomic(text, bigint, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_building_upgrade_atomic(text, bigint, timestamptz, text) TO authenticated;
