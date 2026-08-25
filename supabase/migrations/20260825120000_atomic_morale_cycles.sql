-- Ciclos reais e cobrança atômica das ações coletivas de moral.
-- Preserva sessões e saldos existentes; passa a valer apenas em novas ações.

CREATE TABLE IF NOT EXISTS public.morale_action_cycles (
  trainer_id uuid NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (action_type IN ('meeting', 'general')),
  cycle_started_at timestamptz NOT NULL DEFAULT now(),
  use_count integer NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trainer_id, action_type)
);

ALTER TABLE public.morale_action_cycles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read own morale cycles" ON public.morale_action_cycles;
CREATE POLICY "read own morale cycles" ON public.morale_action_cycles
FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.trainers t
  WHERE t.id = trainer_id AND t.user_id = auth.uid()
));
REVOKE INSERT, UPDATE, DELETE ON public.morale_action_cycles FROM authenticated, anon;
GRANT SELECT ON public.morale_action_cycles TO authenticated;
GRANT ALL ON public.morale_action_cycles TO service_role;

CREATE OR REPLACE FUNCTION public.apply_collective_morale_action_atomic(
  p_action_type text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_trainer public.trainers%ROWTYPE;
  v_academy public.academies%ROWTYPE;
  v_cycle public.morale_action_cycles%ROWTYPE;
  v_cycle_hours integer;
  v_use_number integer;
  v_cost integer := 0;
  v_currency text;
  v_count integer;
  v_division public.division_type;
  v_price_per integer;
  v_result jsonb;
BEGIN
  IF p_action_type NOT IN ('meeting', 'general') THEN
    RAISE EXCEPTION 'Ação de moral inválida.';
  END IF;
  IF nullif(trim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'Chave de idempotência obrigatória.';
  END IF;

  SELECT * INTO v_trainer FROM public.trainers WHERE user_id = auth.uid();
  IF v_trainer.id IS NULL THEN RAISE EXCEPTION 'Treinador não encontrado.'; END IF;
  SELECT * INTO v_academy FROM public.academies WHERE trainer_id = v_trainer.id FOR UPDATE;
  IF v_academy.id IS NULL THEN RAISE EXCEPTION 'Academia não encontrada.'; END IF;

  SELECT result INTO v_result FROM public.economy_operations
  WHERE trainer_id = v_trainer.id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN v_result || jsonb_build_object('replayed', true); END IF;

  INSERT INTO public.morale_action_cycles(trainer_id, action_type)
  VALUES (v_trainer.id, p_action_type)
  ON CONFLICT (trainer_id, action_type) DO NOTHING;
  SELECT * INTO v_cycle FROM public.morale_action_cycles
  WHERE trainer_id = v_trainer.id AND action_type = p_action_type FOR UPDATE;

  v_cycle_hours := CASE WHEN p_action_type = 'meeting' THEN 12 ELSE 24 END;
  IF v_cycle.cycle_started_at + make_interval(hours => v_cycle_hours) <= now() THEN
    UPDATE public.morale_action_cycles
    SET cycle_started_at = now(), use_count = 0, updated_at = now()
    WHERE trainer_id = v_trainer.id AND action_type = p_action_type
    RETURNING * INTO v_cycle;
  END IF;
  v_use_number := v_cycle.use_count + 1;

  IF p_action_type = 'meeting' THEN
    IF v_academy.morale_meeting_completes_at IS NOT NULL
       AND v_academy.morale_meeting_completes_at > now() THEN
      RAISE EXCEPTION 'Já há uma reunião de equipe em andamento.';
    END IF;
    v_currency := CASE WHEN v_use_number = 1 THEN 'free' ELSE 'gems' END;
    v_cost := CASE v_use_number WHEN 1 THEN 0 WHEN 2 THEN 15 WHEN 3 THEN 30 WHEN 4 THEN 60 ELSE 120 END;
  ELSE
    IF v_academy.morale_meeting_completes_at IS NOT NULL
       AND v_academy.morale_meeting_completes_at > now() THEN
      RAISE EXCEPTION 'Aguarde ou cancele a Reunião de Equipe antes de usar o Incentivo Geral.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.creatures c
      WHERE c.owner_trainer_id = v_trainer.id AND NOT coalesce(c.retired, false)
        AND c.morale_session_completes_at > now()
    ) THEN
      RAISE EXCEPTION 'Aguarde as sessões individuais terminarem antes de aplicar o Incentivo Geral.';
    END IF;
    SELECT count(*) INTO v_count FROM public.creatures c
    WHERE c.owner_trainer_id = v_trainer.id AND NOT coalesce(c.retired, false);
    IF v_count = 0 THEN RAISE EXCEPTION 'Nenhum jogador elegível.'; END IF;

    SELECT coalesce(t.division, 'bronze'::public.division_type) INTO v_division
    FROM public.teams t WHERE t.id = v_trainer.current_team_id;
    v_division := coalesce(v_division, 'bronze'::public.division_type);
    v_price_per := CASE v_division
      WHEN 'bronze' THEN 5000 WHEN 'prata' THEN 9000 WHEN 'ouro' THEN 15000
      WHEN 'diamante' THEN 24000 ELSE 36000 END;
    v_currency := CASE WHEN v_use_number = 1 THEN 'money' ELSE 'gems' END;
    v_cost := CASE v_use_number WHEN 1 THEN v_price_per * v_count WHEN 2 THEN 30 WHEN 3 THEN 60 WHEN 4 THEN 120 ELSE 240 END;
  END IF;

  IF v_currency = 'money' THEN
    IF v_academy.money < v_cost THEN RAISE EXCEPTION 'Dinheiro insuficiente.'; END IF;
    UPDATE public.academies SET money = money - v_cost WHERE id = v_academy.id;
    INSERT INTO public.financial_transactions(trainer_id, transaction_type, amount, description)
    VALUES (v_trainer.id, 'expense', v_cost,
      'Incentivo Geral (' || v_count || ' jogadores × $' || v_price_per || ')');
  ELSIF v_currency = 'gems' THEN
    IF v_academy.gems < v_cost THEN RAISE EXCEPTION 'Gemas insuficientes.'; END IF;
    UPDATE public.academies SET gems = gems - v_cost WHERE id = v_academy.id;
    INSERT INTO public.gem_ledger(
      trainer_id, amount, direction, reason, balance_before, balance_after,
      reference_type, reference_id, idempotency_key
    ) VALUES (
      v_trainer.id, v_cost, 'debit', p_action_type || '_extra_use',
      v_academy.gems, v_academy.gems - v_cost, 'academy', v_academy.id::text,
      p_idempotency_key
    );
  END IF;

  IF p_action_type = 'meeting' THEN
    UPDATE public.academies
    SET morale_meeting_completes_at = now() + interval '4 hours'
    WHERE id = v_academy.id;
  ELSE
    UPDATE public.creatures
    SET morale = greatest(0, least(100,
      round(coalesce(morale, 50) + 25 * greatest(0, 1 - coalesce(morale, 50)::numeric / 120))
    ))
    WHERE owner_trainer_id = v_trainer.id AND NOT coalesce(retired, false);
  END IF;

  UPDATE public.morale_action_cycles
  SET use_count = v_use_number, updated_at = now()
  WHERE trainer_id = v_trainer.id AND action_type = p_action_type;

  v_result := jsonb_build_object(
    'action_type', p_action_type, 'use_number', v_use_number,
    'currency', v_currency, 'cost', v_cost, 'applied', coalesce(v_count, 0),
    'completes_at', CASE WHEN p_action_type = 'meeting'
      THEN to_jsonb(now() + interval '4 hours') ELSE 'null'::jsonb END,
    'cycle_resets_at', to_jsonb(v_cycle.cycle_started_at + make_interval(hours => v_cycle_hours)),
    'replayed', false
  );
  INSERT INTO public.economy_operations(trainer_id, idempotency_key, operation_type, result)
  VALUES (v_trainer.id, p_idempotency_key, 'morale_' || p_action_type, v_result);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_collective_morale_action_atomic(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_collective_morale_action_atomic(text,text) TO authenticated;
