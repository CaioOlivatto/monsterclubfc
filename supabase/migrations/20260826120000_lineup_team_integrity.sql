-- Integridade de escalação: toda criatura deve pertencer ao treinador e ao clube atual.
-- A operação é atômica; nenhum JSON parcial é persistido quando uma validação falha.

CREATE OR REPLACE FUNCTION public.save_team_lineup_atomic(
  p_formation text,
  p_strategy public.strategy_type,
  p_starters jsonb,
  p_bench jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trainer public.trainers%ROWTYPE;
  v_ids uuid[];
  v_selected_count integer;
  v_valid_count integer;
  v_unavailable_name text;
BEGIN
  SELECT * INTO v_trainer
  FROM public.trainers
  WHERE user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND OR v_trainer.current_team_id IS NULL THEN
    RAISE EXCEPTION 'Clube atual não encontrado';
  END IF;
  IF p_formation NOT IN ('4-4-2','4-3-3','3-5-2','5-3-2','4-2-3-1') THEN
    RAISE EXCEPTION 'Formação inválida';
  END IF;
  IF jsonb_typeof(p_starters) <> 'array' OR jsonb_array_length(p_starters) <> 11 THEN
    RAISE EXCEPTION 'A escalação deve conter exatamente 11 posições';
  END IF;
  IF jsonb_typeof(p_bench) <> 'array' OR jsonb_array_length(p_bench) > 7 THEN
    RAISE EXCEPTION 'Banco de reservas inválido';
  END IF;

  WITH selected AS (
    SELECT NULLIF(item->>'creature_id', '')::uuid AS id
    FROM jsonb_array_elements(p_starters) item
    UNION ALL
    SELECT (value #>> '{}')::uuid AS id
    FROM jsonb_array_elements(p_bench)
  ), normalized AS (
    SELECT id FROM selected WHERE id IS NOT NULL
  )
  SELECT array_agg(id), count(*) INTO v_ids, v_selected_count FROM normalized;

  IF v_selected_count <> COALESCE(array_length(ARRAY(SELECT DISTINCT unnest(v_ids)), 1), 0) THEN
    RAISE EXCEPTION 'A mesma criatura não pode ocupar dois lugares';
  END IF;

  SELECT count(*) INTO v_valid_count
  FROM public.creatures c
  WHERE c.id = ANY(COALESCE(v_ids, ARRAY[]::uuid[]))
    AND c.owner_trainer_id = v_trainer.id
    AND c.owner_team_id = v_trainer.current_team_id
    AND NOT COALESCE(c.retired, false)
    AND COALESCE(c.injury_matches_remaining, 0) = 0;

  IF v_valid_count <> v_selected_count THEN
    SELECT c.name INTO v_unavailable_name
    FROM public.creatures c
    WHERE c.id = ANY(COALESCE(v_ids, ARRAY[]::uuid[]))
      AND c.owner_trainer_id = v_trainer.id
      AND c.owner_team_id = v_trainer.current_team_id
      AND (COALESCE(c.retired, false) OR COALESCE(c.injury_matches_remaining, 0) > 0)
    LIMIT 1;
    IF v_unavailable_name IS NOT NULL THEN
      RAISE EXCEPTION '% não está disponível para jogar', v_unavailable_name;
    END IF;
    RAISE EXCEPTION 'Um jogador selecionado não está mais disponível para este clube';
  END IF;

  INSERT INTO public.team_lineups (trainer_id, formation, strategy, starters, bench)
  VALUES (v_trainer.id, p_formation, p_strategy, p_starters, p_bench)
  ON CONFLICT (trainer_id) DO UPDATE SET
    formation = EXCLUDED.formation,
    strategy = EXCLUDED.strategy,
    starters = EXCLUDED.starters,
    bench = EXCLUDED.bench,
    updated_at = now();

  RETURN jsonb_build_object('ok', true, 'team_id', v_trainer.current_team_id);
END;
$$;

REVOKE ALL ON FUNCTION public.save_team_lineup_atomic(text, public.strategy_type, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_team_lineup_atomic(text, public.strategy_type, jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_team_tactics_atomic(p_tactics jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trainer_id uuid;
BEGIN
  SELECT id INTO v_trainer_id FROM public.trainers WHERE user_id = auth.uid();
  IF v_trainer_id IS NULL THEN RAISE EXCEPTION 'Treinador não encontrado'; END IF;
  IF p_tactics IS NULL
     OR NOT (p_tactics ?& ARRAY['mentalidade','verticalidade','pressao','cortes'])
     OR EXISTS (
       SELECT 1 FROM jsonb_each_text(p_tactics) axis
       WHERE axis.key NOT IN ('mentalidade','verticalidade','pressao','cortes')
          OR axis.value !~ '^-?[0-2]$'
     ) THEN
    RAISE EXCEPTION 'Tática inválida';
  END IF;
  UPDATE public.team_lineups SET default_tactics = p_tactics, updated_at = now()
  WHERE trainer_id = v_trainer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Escalação não encontrada'; END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.save_team_tactics_atomic(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_team_tactics_atomic(jsonb) TO authenticated;

-- Evita contornar a validação atômica escrevendo o JSON diretamente pela API.
REVOKE INSERT, UPDATE ON public.team_lineups FROM authenticated;

CREATE INDEX IF NOT EXISTS idx_creatures_trainer_team_available
ON public.creatures (owner_trainer_id, owner_team_id, id)
WHERE NOT retired;
