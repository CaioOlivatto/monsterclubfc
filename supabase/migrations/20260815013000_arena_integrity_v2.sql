-- Limites independentes: assinatura aumenta somente as oportunidades econômicas,
-- nunca a quantidade de partidas válidas para o ranking competitivo.
CREATE OR REPLACE FUNCTION public.play_arena_duel_v2(
  p_attacker uuid,p_defender uuid,p_bot uuid,p_mode text,p_wager integer,p_buff text DEFAULT 'none'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_attacker_power integer;
  v_defender_power integer;
  v_window timestamptz;
  v_used integer;
  v_limit integer;
  v_result jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM trainers WHERE id=p_attacker AND user_id=auth.uid() AND level>=10) THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;
  IF p_mode NOT IN ('competitive','risk') THEN RAISE EXCEPTION 'Modo inválido'; END IF;

  SELECT attack_window_started_at INTO v_window FROM arena_profiles WHERE trainer_id=p_attacker FOR UPDATE;
  IF v_window IS NULL OR now()>=v_window+interval '8 hours' THEN
    v_window:=now();
    UPDATE arena_profiles SET attack_window_started_at=v_window,attacks_used=0 WHERE trainer_id=p_attacker;
  END IF;
  v_limit:=CASE WHEN p_mode='competitive' THEN 3
    WHEN EXISTS(SELECT 1 FROM club_memberships WHERE trainer_id=p_attacker AND active_until>now()) THEN 6 ELSE 3 END;
  SELECT count(*) INTO v_used FROM arena_duels WHERE attacker_id=p_attacker AND mode=p_mode AND created_at>=v_window;
  IF v_used>=v_limit THEN
    RAISE EXCEPTION '%',CASE WHEN p_mode='competitive' THEN 'Limite de 3 partidas competitivas nesta janela' ELSE 'Duelos de Risco ainda estão recarregando' END;
  END IF;

  -- Recalcula pelo onze realmente escalado no momento da confirmação.
  SELECT round(avg(c.overall))::integer INTO v_attacker_power
  FROM team_lineups tl CROSS JOIN LATERAL jsonb_array_elements(tl.starters) slot
  JOIN creatures c ON c.id=(slot->>'creature_id')::uuid
  WHERE tl.trainer_id=p_attacker AND slot->>'creature_id' IS NOT NULL;
  IF v_attacker_power IS NULL THEN RAISE EXCEPTION 'Escalação titular incompleta'; END IF;
  UPDATE arena_profiles SET power=v_attacker_power,last_active_at=now(),attacks_used=v_used,updated_at=now() WHERE trainer_id=p_attacker;

  IF p_defender IS NOT NULL THEN
    SELECT round(avg(c.overall))::integer INTO v_defender_power
    FROM team_lineups tl CROSS JOIN LATERAL jsonb_array_elements(tl.starters) slot
    JOIN creatures c ON c.id=(slot->>'creature_id')::uuid
    WHERE tl.trainer_id=p_defender AND slot->>'creature_id' IS NOT NULL;
    IF v_defender_power IS NULL THEN RAISE EXCEPTION 'Adversário sem escalação válida'; END IF;
    UPDATE arena_profiles SET power=v_defender_power,updated_at=now() WHERE trainer_id=p_defender;
  END IF;

  v_result:=public.play_arena_duel(p_attacker,p_defender,p_bot,p_mode,p_wager,p_buff);
  RETURN v_result || jsonb_build_object('mode_limit',v_limit,'mode_used',v_used+1);
END $$;
REVOKE ALL ON FUNCTION public.play_arena_duel(uuid,uuid,uuid,text,integer,text) FROM authenticated,anon;
REVOKE ALL ON FUNCTION public.play_arena_duel_v2(uuid,uuid,uuid,text,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.play_arena_duel_v2(uuid,uuid,uuid,text,integer,text) TO authenticated;

-- Somente partidas reais dão rating integral. Bots têm meia pontuação nas dez
-- primeiras partidas competitivas da temporada e depois viram treino sem rating.
CREATE OR REPLACE FUNCTION public.track_arena_season()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  k text:=to_char(now() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM');
  attacker_points integer;
  defender_points integer;
  bot_ranked_matches integer:=0;
  attacker_won boolean:=NEW.winner_id=NEW.attacker_id;
BEGIN
  IF NEW.mode<>'competitive' THEN RETURN NEW; END IF;
  IF NEW.bot_id IS NOT NULL THEN
    SELECT count(*) INTO bot_ranked_matches FROM arena_duels
    WHERE attacker_id=NEW.attacker_id AND bot_id IS NOT NULL AND mode='competitive'
      AND created_at>=date_trunc('month',now() AT TIME ZONE 'America/Sao_Paulo');
    attacker_points:=CASE WHEN bot_ranked_matches<=10 THEN CASE WHEN attacker_won THEN 9 ELSE -4 END ELSE 0 END;
  ELSE
    attacker_points:=CASE WHEN attacker_won THEN 18 ELSE -8 END;
  END IF;
  defender_points:=CASE WHEN attacker_won THEN -8 ELSE 18 END;
  UPDATE arena_profiles SET
    arena_rating=CASE WHEN arena_season_key IS DISTINCT FROM k THEN 1000+attacker_points ELSE greatest(800,arena_rating+attacker_points) END,
    season_duels=CASE WHEN arena_season_key IS DISTINCT FROM k THEN 1 ELSE season_duels+1 END,
    season_wins=CASE WHEN arena_season_key IS DISTINCT FROM k THEN attacker_won::int ELSE season_wins+attacker_won::int END,
    arena_season_key=k,
    arena_title=CASE WHEN arena_rating+attacker_points>=1400 THEN 'Lenda da Arena' WHEN arena_rating+attacker_points>=1200 THEN 'Gladiador' ELSE 'Desafiante' END
  WHERE trainer_id=NEW.attacker_id;
  IF NEW.defender_id IS NOT NULL THEN
    UPDATE arena_profiles SET
      arena_rating=CASE WHEN arena_season_key IS DISTINCT FROM k THEN 1000+defender_points ELSE greatest(800,arena_rating+defender_points) END,
      season_duels=CASE WHEN arena_season_key IS DISTINCT FROM k THEN 1 ELSE season_duels+1 END,
      season_wins=CASE WHEN arena_season_key IS DISTINCT FROM k THEN (NOT attacker_won)::int ELSE season_wins+(NOT attacker_won)::int END,
      arena_season_key=k
    WHERE trainer_id=NEW.defender_id;
  END IF;
  UPDATE arena_duels SET rating_delta=attacker_points WHERE id=NEW.id;
  RETURN NEW;
END $$;
