CREATE TABLE IF NOT EXISTS public.club_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid NOT NULL UNIQUE REFERENCES public.trainers(id) ON DELETE CASCADE,
  active_until timestamptz NOT NULL,
  activation_source text NOT NULL CHECK (activation_source IN ('gems', 'real_money')),
  provider_payment_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.club_daily_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  claim_date date NOT NULL,
  task_key text NOT NULL CHECK (task_key IN ('check_in', 'play_1', 'play_3', 'win_1', 'weekly_bonus')),
  gems_awarded integer NOT NULL CHECK (gems_awarded > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trainer_id, claim_date, task_key)
);

ALTER TABLE public.club_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_daily_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own club membership" ON public.club_memberships
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = auth.uid())
);
CREATE POLICY "read own club claims" ON public.club_daily_claims
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = auth.uid())
);

REVOKE INSERT, UPDATE, DELETE ON public.club_memberships FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.club_daily_claims FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.activate_monthly_club_with_gems(p_trainer_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_gems integer;
  v_until timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM trainers WHERE id = p_trainer_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  SELECT gems INTO v_gems FROM academies WHERE trainer_id = p_trainer_id FOR UPDATE;
  IF v_gems < 900 THEN RAISE EXCEPTION 'Gemas insuficientes'; END IF;
  UPDATE academies SET gems = gems - 900, updated_at = now() WHERE trainer_id = p_trainer_id;

  INSERT INTO club_memberships (trainer_id, active_until, activation_source)
  VALUES (p_trainer_id, now() + interval '30 days', 'gems')
  ON CONFLICT (trainer_id) DO UPDATE SET
    active_until = GREATEST(club_memberships.active_until, now()) + interval '30 days',
    activation_source = 'gems', updated_at = now()
  RETURNING active_until INTO v_until;

  INSERT INTO items (trainer_id, item_key, quantity) VALUES
    (p_trainer_id, 'potion_individual', 5),
    (p_trainer_id, 'potion_collective', 2)
  ON CONFLICT (trainer_id, item_key) DO UPDATE
    SET quantity = items.quantity + EXCLUDED.quantity, updated_at = now();
  RETURN v_until;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_club_task(p_trainer_id uuid, p_task_key text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_week date := date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_played integer := 0;
  v_wins integer := 0;
  v_reward integer;
  v_claim_date date := v_today;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM trainers WHERE id = p_trainer_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE
    (m.home_team_id = t.id AND m.home_score > m.away_score) OR
    (m.away_team_id = t.id AND m.away_score > m.home_score)
  ) INTO v_played, v_wins
  FROM teams t JOIN matches m ON m.home_team_id = t.id OR m.away_team_id = t.id
  WHERE t.trainer_id = p_trainer_id AND t.is_player = true
    AND (m.played_at AT TIME ZONE 'America/Sao_Paulo')::date = v_today;

  CASE p_task_key
    WHEN 'check_in' THEN v_reward := 2;
    WHEN 'play_1' THEN IF v_played < 1 THEN RAISE EXCEPTION 'Tarefa ainda não concluída'; END IF; v_reward := 4;
    WHEN 'play_3' THEN IF v_played < 3 THEN RAISE EXCEPTION 'Tarefa ainda não concluída'; END IF; v_reward := 5;
    WHEN 'win_1' THEN IF v_wins < 1 THEN RAISE EXCEPTION 'Tarefa ainda não concluída'; END IF; v_reward := 4;
    WHEN 'weekly_bonus' THEN
      v_claim_date := v_week;
      IF (SELECT count(DISTINCT claim_date) FROM club_daily_claims
          WHERE trainer_id = p_trainer_id AND task_key = 'check_in'
            AND claim_date BETWEEN v_week AND v_week + 6) < 5 THEN
        RAISE EXCEPTION 'Bônus semanal ainda não concluído';
      END IF;
      v_reward := 40;
    ELSE RAISE EXCEPTION 'Tarefa inválida';
  END CASE;

  IF EXISTS (SELECT 1 FROM club_memberships WHERE trainer_id = p_trainer_id AND active_until > now()) THEN
    v_reward := ceil(v_reward * 1.5);
  END IF;

  INSERT INTO club_daily_claims (trainer_id, claim_date, task_key, gems_awarded)
  VALUES (p_trainer_id, v_claim_date, p_task_key, v_reward);
  UPDATE academies SET gems = gems + v_reward, updated_at = now() WHERE trainer_id = p_trainer_id;
  RETURN v_reward;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Recompensa já resgatada';
END;
$$;

REVOKE ALL ON FUNCTION public.activate_monthly_club_with_gems(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_club_task(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_monthly_club_with_gems(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_club_task(uuid, text) TO authenticated;
