-- Ativa uma carreira somente quando todas as partes obrigatorias existem.
-- A funcao e SECURITY INVOKER: RLS e identidade do usuario continuam valendo.
CREATE OR REPLACE FUNCTION public.activate_starter_career(
  p_team_id uuid,
  p_season_id uuid,
  p_team_name text,
  p_starters jsonb,
  p_bench jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_trainer_id uuid;
  v_roster_count integer;
  v_selected_count integer;
  v_building_count integer;
  v_item_count integer;
  v_lineup_count integer;
  v_academy_count integer;
  v_season_number integer;
  v_division public.division_type;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sessao invalida. Entre novamente.' USING ERRCODE = '28000';
  END IF;

  SELECT id INTO v_trainer_id
  FROM public.trainers
  WHERE user_id = v_user_id;

  IF v_trainer_id IS NULL THEN
    RAISE EXCEPTION 'Treinador nao encontrado.' USING ERRCODE = 'P0001';
  END IF;

  SELECT tm.division, gs.season_number
  INTO v_division, v_season_number
  FROM public.teams tm
  JOIN public.competitions cp ON cp.id = tm.competition_id
  JOIN public.game_seasons gs ON gs.id = p_season_id
  WHERE tm.id = p_team_id
    AND tm.trainer_id = v_trainer_id
    AND tm.is_player = true
    AND cp.trainer_id = v_trainer_id
    AND cp.season_id = p_season_id
    AND gs.trainer_id = v_trainer_id
    AND gs.is_current = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clube ou temporada nao pertencem a esta carreira.' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.world_state
    WHERE trainer_id = v_trainer_id
      AND season_id = p_season_id
      AND seeded = true
  ) THEN
    RAISE EXCEPTION 'O mundo da carreira ainda nao foi concluido.' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_roster_count
  FROM public.creatures
  WHERE owner_trainer_id = v_trainer_id
    AND owner_team_id = p_team_id;

  IF v_roster_count <> 26 THEN
    RAISE EXCEPTION 'Elenco incompleto: esperado 26, encontrado %.', v_roster_count USING ERRCODE = 'P0001';
  END IF;

  IF jsonb_typeof(p_starters) <> 'array' OR jsonb_array_length(p_starters) <> 11 THEN
    RAISE EXCEPTION 'A escalacao inicial precisa de 11 titulares.' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_typeof(p_bench) <> 'array' OR jsonb_array_length(p_bench) <> 7 THEN
    RAISE EXCEPTION 'A escalacao inicial precisa de 7 reservas.' USING ERRCODE = 'P0001';
  END IF;

  WITH selected_ids AS (
    SELECT (slot->>'creature_id')::uuid AS id FROM jsonb_array_elements(p_starters) slot
    UNION ALL
    SELECT value::uuid AS id FROM jsonb_array_elements_text(p_bench) AS bench(value)
  )
  SELECT count(DISTINCT c.id) INTO v_selected_count
  FROM selected_ids s
  JOIN public.creatures c ON c.id = s.id
  WHERE c.owner_trainer_id = v_trainer_id
    AND c.owner_team_id = p_team_id;

  IF v_selected_count <> 18 THEN
    RAISE EXCEPTION 'Titulares e reservas devem ser 18 jogadores unicos do clube.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.academies (trainer_id, money, gems, builders, roster_slots)
  VALUES (v_trainer_id, 400000, 10, 1, 26)
  ON CONFLICT (trainer_id) DO UPDATE
    SET roster_slots = GREATEST(public.academies.roster_slots, 26);

  -- Carreiras antigas podiam ter estruturas criadas antes da escolha do time.
  -- Vincula essas linhas ao clube atual antes do upsert para não gerar duplicatas.
  UPDATE public.buildings b
  SET team_id = p_team_id
  WHERE b.trainer_id = v_trainer_id
    AND b.team_id IS NULL
    AND b.building_type IN ('ct_treino', 'estadio', 'centro_medico')
    AND NOT EXISTS (
      SELECT 1 FROM public.buildings existing
      WHERE existing.team_id = p_team_id
        AND existing.building_type = b.building_type
    );

  INSERT INTO public.buildings (trainer_id, team_id, building_type, level)
  VALUES
    (v_trainer_id, p_team_id, 'ct_treino', 1),
    (v_trainer_id, p_team_id, 'estadio', 1),
    (v_trainer_id, p_team_id, 'centro_medico', 1)
  ON CONFLICT (team_id, building_type) WHERE team_id IS NOT NULL DO NOTHING;

  INSERT INTO public.items (trainer_id, item_key, quantity)
  VALUES
    (v_trainer_id, 'potion_individual', 3),
    (v_trainer_id, 'potion_collective', 1)
  ON CONFLICT (trainer_id, item_key) DO UPDATE
    SET quantity = GREATEST(public.items.quantity, EXCLUDED.quantity);

  INSERT INTO public.team_lineups (trainer_id, formation, strategy, starters, bench)
  VALUES (v_trainer_id, '4-4-2', 'equilibrada', p_starters, p_bench)
  ON CONFLICT (trainer_id) DO UPDATE SET
    formation = EXCLUDED.formation,
    strategy = EXCLUDED.strategy,
    starters = CASE
      WHEN jsonb_array_length(public.team_lineups.starters) < 11 THEN EXCLUDED.starters
      ELSE public.team_lineups.starters
    END,
    bench = CASE
      WHEN jsonb_array_length(public.team_lineups.bench) < 7 THEN EXCLUDED.bench
      ELSE public.team_lineups.bench
    END;

  UPDATE public.trainers
  SET current_team_id = p_team_id,
      status = 'employed',
      academy_name = COALESCE(NULLIF(academy_name, ''), p_team_name)
  WHERE id = v_trainer_id;

  INSERT INTO public.trainer_career
    (trainer_id, team_id, team_name, division, season_start, event)
  SELECT v_trainer_id, p_team_id, p_team_name, COALESCE(v_division, 'bronze'), v_season_number, 'arrived'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.trainer_career
    WHERE trainer_id = v_trainer_id AND team_id = p_team_id AND season_end IS NULL
  );

  -- O marcador current_team_id só pode ser confirmado se toda a carreira
  -- estiver consistente. Qualquer falha abaixo desfaz a transação inteira.
  SELECT count(*) INTO v_academy_count
  FROM public.academies WHERE trainer_id = v_trainer_id;

  SELECT count(*) INTO v_building_count
  FROM public.buildings
  WHERE trainer_id = v_trainer_id
    AND team_id = p_team_id
    AND building_type IN ('ct_treino', 'estadio', 'centro_medico');

  SELECT count(*) INTO v_item_count
  FROM public.items
  WHERE trainer_id = v_trainer_id
    AND ((item_key = 'potion_individual' AND quantity >= 3)
      OR (item_key = 'potion_collective' AND quantity >= 1));

  SELECT count(*) INTO v_lineup_count
  FROM public.team_lineups
  WHERE trainer_id = v_trainer_id
    AND jsonb_array_length(starters) = 11
    AND jsonb_array_length(bench) = 7;

  IF v_academy_count <> 1 OR v_building_count <> 3 OR v_item_count <> 2 OR v_lineup_count <> 1 THEN
    RAISE EXCEPTION
      'Carreira incompleta: academia %, construcoes %, recursos %, escalacao %.',
      v_academy_count, v_building_count, v_item_count, v_lineup_count
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'ready', true,
    'trainer_id', v_trainer_id,
    'team_id', p_team_id,
    'season_id', p_season_id,
    'roster_count', v_roster_count,
    'starters_count', 11,
    'bench_count', 7
    ,'academy_count', v_academy_count
    ,'building_count', v_building_count
    ,'resource_count', v_item_count
  );
END;
$$;
