CREATE OR REPLACE FUNCTION public.sell_creature_atomic(
  p_trainer_id uuid,
  p_creature_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_creature public.creatures%ROWTYPE;
  v_count integer;
  v_band integer;
  v_base bigint;
  v_age_mult numeric;
  v_amount bigint;
  v_balance bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.trainers
     WHERE id = p_trainer_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Treinador não autorizado';
  END IF;

  SELECT * INTO v_creature
    FROM public.creatures
   WHERE id = p_creature_id AND owner_trainer_id = p_trainer_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Criatura não encontrada'; END IF;

  SELECT count(*) INTO v_count
    FROM public.creatures WHERE owner_trainer_id = p_trainer_id;
  IF v_count <= 11 THEN RAISE EXCEPTION 'Você precisa manter no mínimo 11 criaturas no elenco'; END IF;

  v_band := greatest(1, least(10, round(coalesce(v_creature.overall, 0)::numeric / 10)::integer));
  v_base := (ARRAY[15000,35000,70000,130000,240000,430000,780000,2400000,5500000,12000000]::bigint[])[v_band];
  v_age_mult := CASE
    WHEN coalesce(v_creature.age, 24) <= 18 THEN 1.15
    WHEN coalesce(v_creature.age, 24) <= 21 THEN 1.10
    WHEN coalesce(v_creature.age, 24) <= 24 THEN 1.05
    WHEN coalesce(v_creature.age, 24) <= 27 THEN 1.00
    WHEN coalesce(v_creature.age, 24) <= 30 THEN 0.85
    ELSE 0.65 END;
  v_amount := round(round((v_base * v_age_mult) / 1000) * 1000 * 0.9 / 100) * 100;

  DELETE FROM public.creatures WHERE id = v_creature.id;
  UPDATE public.academies SET money = money + v_amount
   WHERE trainer_id = p_trainer_id RETURNING money INTO v_balance;
  INSERT INTO public.financial_transactions
    (trainer_id, transaction_type, amount, description)
  VALUES (p_trainer_id, 'income', v_amount, 'Venda: ' || v_creature.name);
  INSERT INTO public.transfers (trainer_id, creature_id, transfer_type, amount)
  VALUES (p_trainer_id, NULL, 'sell', v_amount);

  RETURN jsonb_build_object('name', v_creature.name, 'amount', v_amount, 'balance', v_balance);
END;
$$;

CREATE OR REPLACE FUNCTION public.retire_creature_atomic(
  p_trainer_id uuid,
  p_creature_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_creature public.creatures%ROWTYPE;
  v_amount bigint;
  v_balance bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.trainers
     WHERE id = p_trainer_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Treinador não autorizado';
  END IF;

  SELECT * INTO v_creature
    FROM public.creatures
   WHERE id = p_creature_id AND owner_trainer_id = p_trainer_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Criatura não encontrada'; END IF;
  IF coalesce(v_creature.retired, false) THEN RAISE EXCEPTION 'Criatura já aposentada'; END IF;
  IF coalesce(v_creature.age, 18) < 33 THEN RAISE EXCEPTION 'A criatura só pode se aposentar aos 33 anos'; END IF;

  v_amount := round((coalesce(v_creature.market_value, 0) * 0.75) / 1000) * 1000;
  DELETE FROM public.creatures WHERE id = v_creature.id;
  UPDATE public.academies SET money = money + v_amount
   WHERE trainer_id = p_trainer_id RETURNING money INTO v_balance;
  INSERT INTO public.financial_transactions
    (trainer_id, transaction_type, amount, description)
  VALUES (p_trainer_id, 'income', v_amount, 'Aposentadoria: ' || v_creature.name);

  RETURN jsonb_build_object('name', v_creature.name, 'amount', v_amount, 'balance', v_balance);
END;
$$;

CREATE OR REPLACE FUNCTION public.buy_shop_item_atomic(
  p_trainer_id uuid,
  p_item_key text,
  p_currency text,
  p_quantity integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_money_price bigint;
  v_gem_price integer;
  v_total bigint;
  v_balance bigint;
  v_gems integer;
BEGIN
  IF p_quantity < 1 OR p_quantity > 20 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.trainers WHERE id = p_trainer_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Treinador não autorizado';
  END IF;

  SELECT money_price, gem_price INTO v_money_price, v_gem_price FROM (VALUES
    ('potion_individual',8000::bigint,3), ('potion_collective',40000,12),
    ('vital_crystal',80000,20), ('morale_individual',10000,4),
    ('morale_collective',45000,14), ('xp_burst_5',NULL,80),
    ('xp_burst_10',NULL,150), ('xp_burst_15',NULL,220)
  ) AS prices(item_key, money_price, gem_price) WHERE item_key = p_item_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item inválido'; END IF;

  IF p_currency = 'money' THEN
    IF v_money_price IS NULL THEN RAISE EXCEPTION 'Item não aceita dinheiro'; END IF;
    v_total := v_money_price * p_quantity;
    UPDATE public.academies SET money = money - v_total
     WHERE trainer_id = p_trainer_id AND money >= v_total RETURNING money INTO v_balance;
    IF NOT FOUND THEN RAISE EXCEPTION 'Dinheiro insuficiente'; END IF;
  ELSIF p_currency = 'gems' THEN
    IF v_gem_price IS NULL THEN RAISE EXCEPTION 'Item não aceita gemas'; END IF;
    v_total := v_gem_price * p_quantity;
    UPDATE public.academies SET gems = gems - v_total
     WHERE trainer_id = p_trainer_id AND gems >= v_total RETURNING gems INTO v_gems;
    IF NOT FOUND THEN RAISE EXCEPTION 'Gemas insuficientes'; END IF;
  ELSE
    RAISE EXCEPTION 'Moeda inválida';
  END IF;

  INSERT INTO public.items (trainer_id, item_key, quantity)
  VALUES (p_trainer_id, p_item_key, p_quantity)
  ON CONFLICT (trainer_id, item_key)
  DO UPDATE SET quantity = public.items.quantity + excluded.quantity;

  IF p_currency = 'money' THEN
    INSERT INTO public.financial_transactions (trainer_id, transaction_type, amount, description)
    VALUES (p_trainer_id, 'expense', v_total, 'Loja: ' || p_item_key || ' × ' || p_quantity);
  END IF;
  RETURN jsonb_build_object('total', v_total, 'balance', v_balance, 'gems', v_gems);
END;
$$;

CREATE OR REPLACE FUNCTION public.exchange_gems_for_money_atomic(
  p_trainer_id uuid,
  p_gems integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_division text;
  v_rate bigint;
  v_money bigint;
  v_balance bigint;
  v_remaining_gems integer;
BEGIN
  IF p_gems < 1 OR p_gems > 100000 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
  SELECT coalesce(t.division::text, 'bronze') INTO v_division
    FROM public.trainers tr
    LEFT JOIN public.teams t ON t.id = tr.current_team_id
   WHERE tr.id = p_trainer_id AND tr.user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Treinador não autorizado'; END IF;
  v_rate := CASE v_division
    WHEN 'prata' THEN 1309 WHEN 'ouro' THEN 2191 WHEN 'diamante' THEN 3563
    WHEN 'lendaria' THEN 5474 ELSE 700 END;
  v_money := p_gems * v_rate;

  UPDATE public.academies
     SET gems = gems - p_gems, money = money + v_money
   WHERE trainer_id = p_trainer_id AND gems >= p_gems
  RETURNING money, gems INTO v_balance, v_remaining_gems;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gemas insuficientes'; END IF;

  INSERT INTO public.financial_transactions (trainer_id, transaction_type, amount, description)
  VALUES (p_trainer_id, 'income', v_money, 'Troca de ' || p_gems || ' gemas por dinheiro');
  RETURN jsonb_build_object('money', v_money, 'balance', v_balance, 'gems', v_remaining_gems);
END;
$$;

REVOKE ALL ON FUNCTION public.sell_creature_atomic(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.retire_creature_atomic(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.buy_shop_item_atomic(uuid, text, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.exchange_gems_for_money_atomic(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sell_creature_atomic(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retire_creature_atomic(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buy_shop_item_atomic(uuid, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.exchange_gems_for_money_atomic(uuid, integer) TO authenticated;
