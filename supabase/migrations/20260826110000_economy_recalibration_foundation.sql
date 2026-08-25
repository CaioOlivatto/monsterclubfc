-- Economia v3: uma construção canônica por clube/tipo e base idempotente
-- para recompensas de desempenho. A migration preserva uma evidência JSON de
-- cada consolidação antes de remover linhas redundantes.

CREATE TABLE IF NOT EXISTS public.building_consolidation_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consolidated_at timestamptz NOT NULL DEFAULT now(),
  trainer_id uuid,
  team_id uuid,
  building_type public.building_type,
  kept_building_id uuid,
  removed_buildings jsonb NOT NULL,
  note text NOT NULL DEFAULT 'economy_v3_team_building_consolidation'
);

-- A versão anterior podia ter criado o índice antes da consolidação. Removê-lo
-- primeiro evita que a correção de vínculos legados seja bloqueada por colisão.
DROP INDEX IF EXISTS public.buildings_team_type_unique;

-- Todo prédio do treinador pertence ao clube ativo. Antes de a infraestrutura
-- passar a ser do clube, registros legados ficaram associados apenas ao treinador.
UPDATE public.buildings b
SET team_id = t.current_team_id
FROM public.trainers t
WHERE b.trainer_id = t.id
  AND t.current_team_id IS NOT NULL
  AND b.team_id IS NULL;

-- Uma obra em andamento tem precedência: não se perde construtor, prazo ou
-- upgrade. Entre registros equivalentes, preserva-se o maior nível.
WITH ranked AS (
  SELECT b.*,
    row_number() over (
      PARTITION BY b.team_id, b.building_type
      ORDER BY CASE WHEN b.upgrade_completes_at > now() THEN 1 ELSE 0 END DESC,
        b.level DESC,
        b.upgrade_completes_at DESC NULLS LAST,
        b.updated_at DESC,
        b.created_at ASC,
        b.id ASC
    ) AS rn
  FROM public.buildings b
  WHERE b.team_id IS NOT NULL
), groups AS (
  SELECT team_id, building_type,
    jsonb_agg(
      jsonb_build_object(
        'id', id, 'trainer_id', trainer_id, 'team_id', team_id,
        'building_type', building_type, 'level', level,
        'upgrade_completes_at', upgrade_completes_at,
        'created_at', created_at, 'updated_at', updated_at
      ) ORDER BY rn
    ) FILTER (WHERE rn > 1) AS removed_buildings
  FROM ranked
  GROUP BY team_id, building_type
  HAVING count(*) > 1
)
INSERT INTO public.building_consolidation_audit(
  trainer_id, team_id, building_type, kept_building_id, removed_buildings
)
SELECT winner.trainer_id, groups.team_id, groups.building_type, winner.id, groups.removed_buildings
FROM groups
JOIN ranked winner ON winner.team_id = groups.team_id
  AND winner.building_type = groups.building_type AND winner.rn = 1;

WITH ranked AS (
  SELECT b.id,
    row_number() over (
      PARTITION BY b.team_id, b.building_type
      ORDER BY CASE WHEN b.upgrade_completes_at > now() THEN 1 ELSE 0 END DESC,
        b.level DESC,
        b.upgrade_completes_at DESC NULLS LAST,
        b.updated_at DESC,
        b.created_at ASC,
        b.id ASC
    ) AS rn
  FROM public.buildings b
  WHERE b.team_id IS NOT NULL
)
DELETE FROM public.buildings b
USING ranked r
WHERE b.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX buildings_team_type_unique
  ON public.buildings(team_id, building_type)
  WHERE team_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.match_performance_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  trainer_id uuid NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  reward_type text NOT NULL CHECK (reward_type IN ('goals', 'clean_sheet', 'fair_play', 'tactical_wall', 'total_attack')),
  amount bigint NOT NULL CHECK (amount >= 0),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(match_id, reward_type)
);
CREATE INDEX IF NOT EXISTS idx_match_performance_rewards_trainer
  ON public.match_performance_rewards(trainer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.match_strategy_usage (
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  strategy public.strategy_type NOT NULL,
  effective_minutes integer NOT NULL CHECK (effective_minutes >= 0 AND effective_minutes <= 90),
  source text NOT NULL DEFAULT 'official_settlement',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(match_id, team_id, strategy)
);

ALTER TABLE public.match_performance_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_strategy_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own match performance rewards" ON public.match_performance_rewards;
CREATE POLICY "own match performance rewards" ON public.match_performance_rewards FOR SELECT
USING (EXISTS (SELECT 1 FROM public.trainers t WHERE t.user_id = auth.uid() AND t.id = trainer_id));

DROP POLICY IF EXISTS "own match strategy usage" ON public.match_strategy_usage;
CREATE POLICY "own match strategy usage" ON public.match_strategy_usage FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.teams tm JOIN public.trainers t ON t.id = tm.trainer_id
 WHERE t.user_id = auth.uid() AND tm.id = team_id
));

CREATE OR REPLACE FUNCTION public.settle_match_performance_rewards(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trainer public.trainers%ROWTYPE;
  v_match public.matches%ROWTYPE;
  v_division text;
  v_team_id uuid;
  v_strategy public.strategy_type;
  v_gf integer;
  v_ga integer;
  v_cards integer;
  v_goal_amount bigint;
  v_clean_amount bigint;
  v_fair_amount bigint;
  v_tactical_amount bigint;
  v_total bigint;
  v_rows jsonb;
BEGIN
  SELECT * INTO v_trainer FROM public.trainers WHERE user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Treinador não autorizado'; END IF;
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND OR v_match.status <> 'finished' OR coalesce(v_match.is_friendly,false) THEN
    RAISE EXCEPTION 'Partida não elegível para recompensa';
  END IF;
  SELECT id INTO v_team_id FROM public.teams
    WHERE trainer_id = v_trainer.id AND id IN (v_match.home_team_id, v_match.away_team_id)
    LIMIT 1;
  IF v_team_id IS NULL THEN RAISE EXCEPTION 'Partida não pertence ao treinador'; END IF;
  SELECT c.division::text INTO v_division FROM public.competitions c WHERE c.id = v_match.competition_id;
  v_division := coalesce(v_division, 'bronze');
  v_gf := CASE WHEN v_team_id = v_match.home_team_id THEN v_match.home_score ELSE v_match.away_score END;
  v_ga := CASE WHEN v_team_id = v_match.home_team_id THEN v_match.away_score ELSE v_match.home_score END;
  SELECT coalesce(strategy, 'equilibrada') INTO v_strategy FROM public.team_lineups WHERE trainer_id = v_trainer.id LIMIT 1;
  v_strategy := coalesce(v_strategy, 'equilibrada');
  SELECT count(*) INTO v_cards FROM public.match_events
    WHERE match_id = p_match_id AND actor_team_id = v_team_id
      AND event_type IN ('yellow_card','red_card');

  INSERT INTO public.match_strategy_usage(match_id,team_id,strategy,effective_minutes)
  VALUES(p_match_id,v_team_id,v_strategy,90)
  ON CONFLICT(match_id,team_id,strategy) DO UPDATE SET effective_minutes=excluded.effective_minutes;

  v_goal_amount := least(5,greatest(0,v_gf)) * CASE v_division
    WHEN 'bronze' THEN 1250 WHEN 'prata' THEN 2500 WHEN 'ouro' THEN 5000 WHEN 'diamante' THEN 10000 ELSE 18000 END;
  v_clean_amount := CASE WHEN v_ga=0 THEN CASE v_division
    WHEN 'bronze' THEN 2500 WHEN 'prata' THEN 5000 WHEN 'ouro' THEN 10000 WHEN 'diamante' THEN 18000 ELSE 30000 END ELSE 0 END;
  v_fair_amount := CASE WHEN v_cards=0 THEN CASE v_division
    WHEN 'bronze' THEN 2000 WHEN 'prata' THEN 4000 WHEN 'ouro' THEN 7500 WHEN 'diamante' THEN 15000 ELSE 25000 END ELSE 0 END;
  v_tactical_amount := CASE WHEN v_gf>v_ga AND v_ga=0 AND v_strategy='defensiva' THEN CASE v_division
    WHEN 'bronze' THEN 2500 WHEN 'prata' THEN 5000 WHEN 'ouro' THEN 10000 WHEN 'diamante' THEN 20000 ELSE 35000 END
    WHEN v_gf>v_ga AND v_gf>=4 AND v_strategy='ofensiva' THEN CASE v_division
    WHEN 'bronze' THEN 2500 WHEN 'prata' THEN 5000 WHEN 'ouro' THEN 10000 WHEN 'diamante' THEN 20000 ELSE 35000 END ELSE 0 END;

  WITH rewards(reward_type,amount,details) AS (
    VALUES ('goals'::text,v_goal_amount,jsonb_build_object('goals',least(5,greatest(0,v_gf)),'cap',5)),
      ('clean_sheet'::text,v_clean_amount,'{}'::jsonb), ('fair_play'::text,v_fair_amount,jsonb_build_object('cards',v_cards)),
      (CASE WHEN v_strategy='defensiva' THEN 'tactical_wall' ELSE 'total_attack' END::text,v_tactical_amount,jsonb_build_object('strategy',v_strategy,'effective_minutes',90))
  ), inserted AS (
    INSERT INTO public.match_performance_rewards(match_id,trainer_id,team_id,reward_type,amount,details)
    SELECT p_match_id,v_trainer.id,v_team_id,reward_type,amount,details FROM rewards WHERE amount>0
    ON CONFLICT(match_id,reward_type) DO NOTHING RETURNING reward_type,amount,details
  ), credited AS (
    SELECT coalesce(sum(amount),0)::bigint AS total,coalesce(jsonb_agg(jsonb_build_object('type',reward_type,'amount',amount,'details',details)),'[]'::jsonb) AS rows FROM inserted
  ), money AS (
    UPDATE public.academies a SET money=a.money+(SELECT total FROM credited) WHERE a.trainer_id=v_trainer.id AND (SELECT total FROM credited)>0 RETURNING 1
  )
  SELECT total,rows INTO v_total,v_rows FROM credited;
  INSERT INTO public.financial_transactions(trainer_id,transaction_type,category,amount,description)
  SELECT v_trainer.id,'income','bonus_desempenho',(entry->>'amount')::bigint,
    'Partida — recompensa de desempenho: ' || (entry->>'type')
  FROM jsonb_array_elements(v_rows) entry;
  RETURN jsonb_build_object('total',v_total,'rewards',v_rows,'strategy',v_strategy,'cards',v_cards);
END;
$$;
REVOKE ALL ON FUNCTION public.settle_match_performance_rewards(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_match_performance_rewards(uuid) TO authenticated;
