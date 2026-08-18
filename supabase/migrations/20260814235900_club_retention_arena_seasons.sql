CREATE TABLE IF NOT EXISTS public.club_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  activation_source text NOT NULL CHECK (activation_source IN ('gems','real_money')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trainer_id, starts_at)
);

CREATE TABLE IF NOT EXISTS public.club_calendar_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.club_cycles(id) ON DELETE CASCADE,
  trainer_id uuid NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  day_number integer NOT NULL CHECK (day_number BETWEEN 1 AND 30),
  reward_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, day_number)
);

CREATE TABLE IF NOT EXISTS public.club_entitlements (
  trainer_id uuid PRIMARY KEY REFERENCES public.trainers(id) ON DELETE CASCADE,
  scout_credits integer NOT NULL DEFAULT 0 CHECK (scout_credits >= 0),
  shield_12h_credits integer NOT NULL DEFAULT 0 CHECK (shield_12h_credits >= 0),
  training_rush_credits integer NOT NULL DEFAULT 0 CHECK (training_rush_credits >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.club_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_calendar_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own club cycles" ON public.club_cycles FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM trainers t WHERE t.id=trainer_id AND t.user_id=auth.uid()));
CREATE POLICY "read own calendar claims" ON public.club_calendar_claims FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM trainers t WHERE t.id=trainer_id AND t.user_id=auth.uid()));
CREATE POLICY "read own club entitlements" ON public.club_entitlements FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM trainers t WHERE t.id=trainer_id AND t.user_id=auth.uid()));
REVOKE INSERT,UPDATE,DELETE ON public.club_cycles,public.club_calendar_claims,public.club_entitlements FROM authenticated,anon;

-- A função antiga de 900 gemas não pode permanecer como caminho alternativo.
REVOKE EXECUTE ON FUNCTION public.activate_monthly_club_with_gems(uuid) FROM authenticated;

CREATE OR REPLACE FUNCTION public.activate_monthly_club_with_gems_v2(p_trainer_id uuid)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_start timestamptz; v_end timestamptz;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM trainers WHERE id=p_trainer_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Não autorizado'; END IF;
  UPDATE academies SET gems=gems-1050,updated_at=now() WHERE trainer_id=p_trainer_id AND gems>=1050;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gemas insuficientes'; END IF;
  SELECT greatest(now(),coalesce(max(ends_at),now())) INTO v_start FROM club_cycles WHERE trainer_id=p_trainer_id;
  v_end:=v_start+interval '30 days';
  INSERT INTO club_cycles(trainer_id,starts_at,ends_at,activation_source) VALUES(p_trainer_id,v_start,v_end,'gems');
  INSERT INTO club_memberships(trainer_id,active_until,activation_source) VALUES(p_trainer_id,v_end,'gems')
  ON CONFLICT(trainer_id) DO UPDATE SET active_until=v_end,activation_source='gems',updated_at=now();
  INSERT INTO items(trainer_id,item_key,quantity) VALUES(p_trainer_id,'potion_individual',5),(p_trainer_id,'potion_collective',2)
  ON CONFLICT(trainer_id,item_key) DO UPDATE SET quantity=items.quantity+excluded.quantity,updated_at=now();
  INSERT INTO club_entitlements(trainer_id) VALUES(p_trainer_id) ON CONFLICT DO NOTHING;
  RETURN v_end;
END $$;
REVOKE ALL ON FUNCTION public.activate_monthly_club_with_gems_v2(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_monthly_club_with_gems_v2(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_club_calendar_day(p_trainer_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c club_cycles; d integer; reward text; claimed integer; bonus boolean:=false;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM trainers WHERE id=p_trainer_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Não autorizado'; END IF;
  SELECT * INTO c FROM club_cycles WHERE trainer_id=p_trainer_id AND starts_at<=now() AND ends_at>now() ORDER BY starts_at DESC LIMIT 1;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Clube Mensal inativo'; END IF;
  d:=least(30,floor(extract(epoch FROM (now()-c.starts_at))/86400)::integer+1);
  reward:=CASE
    WHEN d IN (7,14,21,28) THEN 'shield'
    WHEN d IN (5,10,15,25) THEN 'scout'
    WHEN d IN (6,12,18,24,30) THEN 'training_rush'
    WHEN d IN (3,9,17,23,29) THEN 'potion_collective'
    WHEN d%2=0 THEN 'potion_individual'
    ELSE 'gems'
  END;
  INSERT INTO club_calendar_claims(cycle_id,trainer_id,day_number,reward_key) VALUES(c.id,p_trainer_id,d,reward);
  IF reward='gems' THEN UPDATE academies SET gems=gems+10 WHERE trainer_id=p_trainer_id;
  ELSIF reward='potion_individual' THEN INSERT INTO items(trainer_id,item_key,quantity) VALUES(p_trainer_id,'potion_individual',1) ON CONFLICT(trainer_id,item_key) DO UPDATE SET quantity=items.quantity+1,updated_at=now();
  ELSIF reward='potion_collective' THEN INSERT INTO items(trainer_id,item_key,quantity) VALUES(p_trainer_id,'potion_collective',1) ON CONFLICT(trainer_id,item_key) DO UPDATE SET quantity=items.quantity+1,updated_at=now();
  ELSE
    INSERT INTO club_entitlements(trainer_id,scout_credits,shield_12h_credits,training_rush_credits)
    VALUES(p_trainer_id,(reward='scout')::int,(reward='shield')::int,(reward='training_rush')::int)
    ON CONFLICT(trainer_id) DO UPDATE SET
      scout_credits=club_entitlements.scout_credits+excluded.scout_credits,
      shield_12h_credits=club_entitlements.shield_12h_credits+excluded.shield_12h_credits,
      training_rush_credits=club_entitlements.training_rush_credits+excluded.training_rush_credits,updated_at=now();
  END IF;
  SELECT count(*) INTO claimed FROM club_calendar_claims WHERE cycle_id=c.id;
  IF claimed=20 THEN
    UPDATE academies SET gems=gems+50 WHERE trainer_id=p_trainer_id;
    INSERT INTO items(trainer_id,item_key,quantity) VALUES(p_trainer_id,'potion_collective',2) ON CONFLICT(trainer_id,item_key) DO UPDATE SET quantity=items.quantity+2,updated_at=now();
    INSERT INTO club_entitlements(trainer_id,scout_credits,shield_12h_credits) VALUES(p_trainer_id,1,1)
    ON CONFLICT(trainer_id) DO UPDATE SET scout_credits=club_entitlements.scout_credits+1,shield_12h_credits=club_entitlements.shield_12h_credits+1,updated_at=now();
    bonus:=true;
  END IF;
  RETURN jsonb_build_object('day',d,'reward',reward,'claimed_days',claimed,'monthly_bonus',bonus);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Recompensa de hoje já resgatada';
END $$;
REVOKE ALL ON FUNCTION public.claim_club_calendar_day(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_club_calendar_day(uuid) TO authenticated;

ALTER TABLE public.arena_profiles ADD COLUMN IF NOT EXISTS arena_season_key text;
ALTER TABLE public.arena_profiles ADD COLUMN IF NOT EXISTS arena_rating integer NOT NULL DEFAULT 1000;
ALTER TABLE public.arena_profiles ADD COLUMN IF NOT EXISTS season_duels integer NOT NULL DEFAULT 0;
ALTER TABLE public.arena_profiles ADD COLUMN IF NOT EXISTS season_wins integer NOT NULL DEFAULT 0;
ALTER TABLE public.arena_profiles ADD COLUMN IF NOT EXISTS arena_title text;

CREATE OR REPLACE FUNCTION public.track_arena_season()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE k text:=to_char(now() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM'); points integer;
BEGIN
  points:=CASE WHEN NEW.winner_id=NEW.attacker_id THEN 18 ELSE -8 END;
  UPDATE arena_profiles SET
    arena_rating=CASE WHEN arena_season_key IS DISTINCT FROM k THEN 1000+points ELSE greatest(800,arena_rating+points) END,
    season_duels=CASE WHEN arena_season_key IS DISTINCT FROM k THEN 1 ELSE season_duels+1 END,
    season_wins=CASE WHEN arena_season_key IS DISTINCT FROM k THEN (NEW.winner_id=NEW.attacker_id)::int ELSE season_wins+(NEW.winner_id=NEW.attacker_id)::int END,
    arena_season_key=k,
    arena_title=CASE
      WHEN (CASE WHEN arena_season_key IS DISTINCT FROM k THEN 1000+points ELSE arena_rating+points END)>=1400 THEN 'Lenda da Arena'
      WHEN (CASE WHEN arena_season_key IS DISTINCT FROM k THEN 1000+points ELSE arena_rating+points END)>=1200 THEN 'Gladiador'
      ELSE 'Desafiante' END
  WHERE trainer_id=NEW.attacker_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS arena_season_after_duel ON public.arena_duels;
CREATE TRIGGER arena_season_after_duel AFTER INSERT ON public.arena_duels FOR EACH ROW EXECUTE FUNCTION public.track_arena_season();
CREATE INDEX IF NOT EXISTS arena_profiles_rating_idx ON public.arena_profiles(arena_season_key,arena_rating DESC);

-- O bônus semanal do Clube entrega um escudo consumível, sem ativá-lo à força.
CREATE OR REPLACE FUNCTION public.grant_weekly_club_shield()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.task_key='weekly_bonus' AND EXISTS(SELECT 1 FROM club_memberships WHERE trainer_id=NEW.trainer_id AND active_until>now()) THEN
    INSERT INTO club_entitlements(trainer_id,shield_12h_credits) VALUES(NEW.trainer_id,1)
    ON CONFLICT(trainer_id) DO UPDATE SET shield_12h_credits=club_entitlements.shield_12h_credits+1,updated_at=now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS weekly_club_shield_after_claim ON public.club_daily_claims;
CREATE TRIGGER weekly_club_shield_after_claim AFTER INSERT ON public.club_daily_claims FOR EACH ROW EXECUTE FUNCTION public.grant_weekly_club_shield();

-- Créditos do Clube são sempre consumidos antes de gemas.
CREATE OR REPLACE FUNCTION public.buy_arena_shield(p_trainer uuid,p_hours integer)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cost integer; result timestamptz; used_credit boolean:=false;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM trainers WHERE id=p_trainer AND user_id=auth.uid() AND level>=10) THEN RAISE EXCEPTION 'Não autorizado'; END IF;
  cost:=CASE p_hours WHEN 12 THEN 30 WHEN 24 THEN 50 WHEN 72 THEN 120 ELSE NULL END;
  IF cost IS NULL THEN RAISE EXCEPTION 'Escudo inválido'; END IF;
  IF p_hours=12 THEN
    UPDATE club_entitlements SET shield_12h_credits=shield_12h_credits-1,updated_at=now() WHERE trainer_id=p_trainer AND shield_12h_credits>0;
    used_credit:=FOUND;
  END IF;
  IF NOT used_credit THEN
    UPDATE academies SET gems=gems-cost,updated_at=now() WHERE trainer_id=p_trainer AND gems>=cost;
    IF NOT FOUND THEN RAISE EXCEPTION 'Gemas insuficientes'; END IF;
  END IF;
  UPDATE arena_profiles SET shield_until=least(now()+interval '7 days',greatest(coalesce(shield_until,now()),now())+make_interval(hours=>p_hours)),updated_at=now() WHERE trainer_id=p_trainer RETURNING shield_until INTO result;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.buy_arena_scout(p_trainer uuid,p_defender uuid,p_bot uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ap integer; dp integer; chance integer;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM trainers WHERE id=p_trainer AND user_id=auth.uid() AND level>=10) OR (p_defender IS NULL)=(p_bot IS NULL) THEN RAISE EXCEPTION 'Não autorizado'; END IF;
  SELECT power INTO ap FROM arena_profiles WHERE trainer_id=p_trainer;
  IF p_defender IS NOT NULL THEN SELECT power INTO dp FROM arena_profiles WHERE trainer_id=p_defender; ELSE SELECT power INTO dp FROM arena_bots WHERE id=p_bot AND active=true; END IF;
  IF dp IS NULL THEN RAISE EXCEPTION 'Adversário indisponível'; END IF;
  UPDATE club_entitlements SET scout_credits=scout_credits-1,updated_at=now() WHERE trainer_id=p_trainer AND scout_credits>0;
  IF NOT FOUND THEN
    UPDATE academies SET gems=gems-10,updated_at=now() WHERE trainer_id=p_trainer AND gems>=10;
    IF NOT FOUND THEN RAISE EXCEPTION 'Gemas insuficientes'; END IF;
  END IF;
  chance:=round(greatest(.25,least(.75,.5+(ap-dp)/100.0))*100);
  RETURN chance;
END $$;

CREATE OR REPLACE FUNCTION public.rush_arena_repair(p_trainer uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cost integer; club_active boolean;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM trainers WHERE id=p_trainer AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Não autorizado'; END IF;
  SELECT EXISTS(SELECT 1 FROM club_memberships WHERE trainer_id=p_trainer AND active_until>now()) INTO club_active;
  SELECT greatest(10,ceil(extract(epoch FROM (repair_completes_at-now()))/3600)*10)::integer INTO cost FROM arena_profiles WHERE trainer_id=p_trainer AND repair_completes_at>now();
  IF cost IS NULL THEN RAISE EXCEPTION 'Nenhum reparo ativo'; END IF;
  IF club_active THEN cost:=greatest(1,ceil(cost*.90)::integer); END IF;
  UPDATE academies SET gems=gems-cost,updated_at=now() WHERE trainer_id=p_trainer AND gems>=cost;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gemas insuficientes'; END IF;
  UPDATE arena_profiles SET stadium_damage_pct=0,repair_completes_at=NULL,updated_at=now() WHERE trainer_id=p_trainer;
  RETURN cost;
END $$;

CREATE TABLE IF NOT EXISTS public.arena_season_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  season_key text NOT NULL,
  final_rating integer NOT NULL,
  duels integer NOT NULL,
  wins integer NOT NULL,
  title text NOT NULL,
  gems_awarded integer NOT NULL DEFAULT 0,
  scout_credits_awarded integer NOT NULL DEFAULT 0,
  shield_credits_awarded integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(trainer_id,season_key)
);
ALTER TABLE public.arena_season_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own arena season rewards" ON public.arena_season_rewards FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM trainers t WHERE t.id=trainer_id AND t.user_id=auth.uid()));
REVOKE INSERT,UPDATE,DELETE ON public.arena_season_rewards FROM authenticated,anon;

-- Executado ao abrir a Arena: premia a temporada encerrada e preserva 25% da distância para 1000.
CREATE OR REPLACE FUNCTION public.sync_arena_season(p_trainer uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p arena_profiles; k text:=to_char(now() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM'); g integer; s integer; sh integer; ttl text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM trainers WHERE id=p_trainer AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Não autorizado'; END IF;
  SELECT * INTO p FROM arena_profiles WHERE trainer_id=p_trainer FOR UPDATE;
  IF p.trainer_id IS NULL OR p.arena_season_key IS NULL OR p.arena_season_key=k THEN RETURN jsonb_build_object('season',k,'rewarded',false); END IF;
  g:=CASE WHEN p.season_duels>=20 THEN 40 WHEN p.season_duels>=10 THEN 20 WHEN p.season_duels>=3 THEN 10 ELSE 0 END + least(30,p.season_wins);
  s:=CASE WHEN p.season_duels>=10 THEN 1 ELSE 0 END;
  sh:=CASE WHEN p.arena_rating>=1200 THEN 1 ELSE 0 END;
  ttl:=CASE WHEN p.arena_rating>=1400 THEN 'Lenda da Arena' WHEN p.arena_rating>=1200 THEN 'Gladiador' WHEN p.season_duels>=3 THEN 'Competidor' ELSE 'Participante' END;
  INSERT INTO arena_season_rewards(trainer_id,season_key,final_rating,duels,wins,title,gems_awarded,scout_credits_awarded,shield_credits_awarded)
  VALUES(p_trainer,p.arena_season_key,p.arena_rating,p.season_duels,p.season_wins,ttl,g,s,sh) ON CONFLICT DO NOTHING;
  IF FOUND THEN
    UPDATE academies SET gems=gems+g,updated_at=now() WHERE trainer_id=p_trainer;
    INSERT INTO club_entitlements(trainer_id,scout_credits,shield_12h_credits) VALUES(p_trainer,s,sh)
    ON CONFLICT(trainer_id) DO UPDATE SET scout_credits=club_entitlements.scout_credits+s,shield_12h_credits=club_entitlements.shield_12h_credits+sh,updated_at=now();
  END IF;
  UPDATE arena_profiles SET arena_season_key=k,arena_rating=1000+round((p.arena_rating-1000)*.25),season_duels=0,season_wins=0,arena_title='Desafiante',updated_at=now() WHERE trainer_id=p_trainer;
  RETURN jsonb_build_object('season',k,'rewarded',true,'gems',g,'scouts',s,'shields',sh,'title',ttl);
END $$;
REVOKE ALL ON FUNCTION public.sync_arena_season(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_arena_season(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.consume_club_training_rush(p_trainer uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM trainers WHERE id=p_trainer AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Não autorizado'; END IF;
  UPDATE club_entitlements SET training_rush_credits=training_rush_credits-1,updated_at=now() WHERE trainer_id=p_trainer AND training_rush_credits>0;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.consume_club_training_rush(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_club_training_rush(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.club_lineup_presets (
  trainer_id uuid PRIMARY KEY REFERENCES public.trainers(id) ON DELETE CASCADE,
  formation text NOT NULL,
  strategy text NOT NULL,
  starters jsonb NOT NULL DEFAULT '[]'::jsonb,
  bench jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.club_lineup_presets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "manage own club lineup preset" ON public.club_lineup_presets FOR ALL TO authenticated
USING(EXISTS(SELECT 1 FROM trainers t WHERE t.id=trainer_id AND t.user_id=auth.uid()))
WITH CHECK(EXISTS(SELECT 1 FROM trainers t WHERE t.id=trainer_id AND t.user_id=auth.uid()));
