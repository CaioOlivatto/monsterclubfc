-- Calibração final de gemas, velocidades e telemetria.
-- Aditiva e idempotente: não reduz saldo nem altera desbloqueios existentes.

ALTER TABLE public.academies
  ADD COLUMN IF NOT EXISTS paid_2x boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.normalize_new_career_gems()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- As rotas legadas de ativação enviam 50. Somente novos INSERTs recebem a
  -- calibração; academias existentes permanecem intocadas.
  IF NEW.gems = 50 THEN NEW.gems := 10; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_new_career_gems_trigger ON public.academies;
CREATE TRIGGER normalize_new_career_gems_trigger
BEFORE INSERT ON public.academies
FOR EACH ROW EXECUTE FUNCTION public.normalize_new_career_gems();

CREATE OR REPLACE FUNCTION public.unlock_match_speed_with_gems(p_mode text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_trainer_id uuid;
  v_academy public.academies%ROWTYPE;
  v_cost integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Entre novamente.' USING ERRCODE = '28000';
  END IF;
  IF p_mode NOT IN ('2x','4x','instant','bundle') THEN
    RAISE EXCEPTION 'Velocidade inválida.' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_trainer_id FROM public.trainers WHERE user_id = v_uid;
  IF v_trainer_id IS NULL THEN RAISE EXCEPTION 'Treinador não encontrado.'; END IF;

  SELECT * INTO v_academy FROM public.academies
  WHERE trainer_id = v_trainer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Academia não encontrada.'; END IF;

  IF (p_mode = '2x' AND v_academy.paid_2x)
    OR (p_mode = '4x' AND v_academy.paid_4x)
    OR (p_mode = 'instant' AND v_academy.paid_instant)
    OR (p_mode = 'bundle' AND v_academy.paid_2x AND v_academy.paid_4x AND v_academy.paid_instant)
  THEN
    RETURN jsonb_build_object('ok', true, 'already_owned', true, 'gems', v_academy.gems);
  END IF;

  v_cost := CASE p_mode WHEN '2x' THEN 100 WHEN '4x' THEN 300
    WHEN 'instant' THEN 800 WHEN 'bundle' THEN LEAST(
      1050,
      (CASE WHEN v_academy.paid_2x THEN 0 ELSE 100 END) +
      (CASE WHEN v_academy.paid_4x THEN 0 ELSE 300 END) +
      (CASE WHEN v_academy.paid_instant THEN 0 ELSE 800 END)
    ) END;
  IF v_academy.gems < v_cost THEN
    RAISE EXCEPTION 'Gemas insuficientes: necessário %, disponível %.', v_cost, v_academy.gems;
  END IF;

  UPDATE public.academies SET
    gems = gems - v_cost,
    paid_2x = paid_2x OR p_mode IN ('2x','bundle'),
    paid_4x = paid_4x OR p_mode IN ('4x','bundle'),
    paid_instant = paid_instant OR p_mode IN ('instant','bundle'),
    updated_at = now()
  WHERE trainer_id = v_trainer_id;

  INSERT INTO public.game_telemetry_events(user_id,trainer_id,event_name,route,metadata)
  VALUES(v_uid,v_trainer_id,'speed_unlocked','/shop',jsonb_build_object('mode',p_mode,'gems_spent',v_cost));

  RETURN jsonb_build_object('ok', true, 'already_owned', false,
    'mode', p_mode, 'gems_spent', v_cost, 'gems', v_academy.gems-v_cost);
END;
$$;

REVOKE ALL ON FUNCTION public.unlock_match_speed_with_gems(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_match_speed_with_gems(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_game_telemetry(
  p_event text,p_route text DEFAULT NULL,p_duration_ms integer DEFAULT NULL,p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); tid uuid;
BEGIN
  IF uid IS NULL THEN RETURN; END IF;
  IF p_event NOT IN (
    'page_view','slow_page','onboarding_started','onboarding_completed','club_viewed','club_activated',
    'arena_played','purchase_intent','session_started','market_opened','market_refreshed','premium_viewed',
    'premium_clicked','insufficient_balance','shop_opened','package_purchased','gems_spent','gems_earned',
    'scout_used','speed_unlocked','speed_used','stadium_upgraded','player_signed','promotion'
  ) THEN RETURN; END IF;
  IF (SELECT count(*) FROM public.game_telemetry_events WHERE user_id=uid AND created_at>=now()-interval '1 day')>=300 THEN RETURN; END IF;
  SELECT id INTO tid FROM public.trainers WHERE user_id=uid;
  INSERT INTO public.game_telemetry_events(user_id,trainer_id,event_name,route,duration_ms,metadata)
  VALUES(uid,tid,p_event,left(p_route,160),least(120000,greatest(0,p_duration_ms)),coalesce(p_metadata,'{}'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.record_game_telemetry(text,text,integer,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_game_telemetry(text,text,integer,jsonb) TO authenticated;
