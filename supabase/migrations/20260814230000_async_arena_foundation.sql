CREATE TABLE public.arena_profiles (
  trainer_id uuid PRIMARY KEY REFERENCES public.trainers(id) ON DELETE CASCADE,
  power integer NOT NULL DEFAULT 0 CHECK (power >= 0),
  attacks_used integer NOT NULL DEFAULT 0 CHECK (attacks_used BETWEEN 0 AND 3),
  attack_window_started_at timestamptz NOT NULL DEFAULT now(),
  shield_until timestamptz,
  stadium_damage_pct integer NOT NULL DEFAULT 0 CHECK (stadium_damage_pct BETWEEN 0 AND 20),
  repair_completes_at timestamptz,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  arena_xp_date date,
  arena_xp_awarded integer NOT NULL DEFAULT 0,
  last_active_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.arena_bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_name text NOT NULL,
  academy_name text NOT NULL UNIQUE,
  power integer NOT NULL CHECK (power BETWEEN 20 AND 100),
  personality text NOT NULL,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);

INSERT INTO public.arena_bots (trainer_name, academy_name, power, personality)
SELECT 'Treinador ' || n, (ARRAY['Falcões','Aurora','Titãs','Vulcões','Náuticos','Lobos','Cometas','Guardas','Dragões','Pioneiros'])[1 + ((n-1) % 10)] || ' ' || n,
       24 + ((n * 7) % 74), (ARRAY['ofensivo','equilibrado','defensivo'])[1 + ((n-1) % 3)]
FROM generate_series(1, 40) n ON CONFLICT DO NOTHING;

CREATE TABLE public.arena_duels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attacker_id uuid NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  defender_id uuid REFERENCES public.trainers(id) ON DELETE SET NULL,
  bot_id uuid REFERENCES public.arena_bots(id) ON DELETE SET NULL,
  mode text NOT NULL CHECK (mode IN ('safe','risk')),
  buff_key text NOT NULL DEFAULT 'none',
  buff_gem_cost integer NOT NULL DEFAULT 0,
  wager integer NOT NULL CHECK (wager > 0),
  attacker_power integer NOT NULL,
  defender_power integer NOT NULL,
  attacker_score integer NOT NULL,
  defender_score integer NOT NULL,
  winner_id uuid REFERENCES public.trainers(id) ON DELETE SET NULL,
  money_delta integer NOT NULL,
  trainer_xp_awarded integer NOT NULL DEFAULT 0,
  creature_xp_awarded integer NOT NULL DEFAULT 0,
  stadium_damage_pct integer NOT NULL DEFAULT 0,
  injury_creature_id uuid REFERENCES public.creatures(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.arena_cooldowns (
  attacker_id uuid NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  defender_key text NOT NULL,
  available_at timestamptz NOT NULL,
  PRIMARY KEY (attacker_id, defender_key)
);

ALTER TABLE public.arena_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arena_bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arena_duels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arena_cooldowns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "arena profiles visible" ON public.arena_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "arena bots visible" ON public.arena_bots FOR SELECT TO authenticated USING (true);
CREATE POLICY "own arena duels visible" ON public.arena_duels FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM trainers t WHERE t.user_id = auth.uid() AND (t.id = attacker_id OR t.id = defender_id))
);
REVOKE INSERT, UPDATE, DELETE ON public.arena_profiles, public.arena_bots, public.arena_duels, public.arena_cooldowns FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.refresh_arena_profile(p_trainer_id uuid)
RETURNS public.arena_profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_power integer; v_row arena_profiles;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM trainers WHERE id=p_trainer_id AND user_id=auth.uid() AND level>=10) THEN RAISE EXCEPTION 'Arena desbloqueia no nível 10'; END IF;
  UPDATE arena_profiles SET stadium_damage_pct=0,repair_completes_at=NULL,updated_at=now()
    WHERE trainer_id=p_trainer_id AND repair_completes_at<=now();
  SELECT COALESCE(round(avg(overall)),0)::integer INTO v_power FROM creatures WHERE owner_trainer_id=p_trainer_id;
  INSERT INTO arena_profiles(trainer_id,power,shield_until) VALUES(p_trainer_id,v_power,now()+interval '24 hours')
  ON CONFLICT(trainer_id) DO UPDATE SET power=v_power,last_active_at=now(),updated_at=now()
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.play_arena_duel(p_attacker uuid,p_defender uuid,p_bot uuid,p_mode text,p_wager integer,p_buff text DEFAULT 'none')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a arena_profiles; d arena_profiles; bp integer; dp integer; chance numeric; win boolean; ascore integer; dscore integer;
        prize integer; delta integer; damage integer:=0; shield_hours integer; injury uuid; key text; buff_cost integer:=0;
        effective_power numeric; difficulty numeric; reward_mult numeric; txp integer; cxp integer; xp_room integer;
BEGIN
  IF p_mode NOT IN ('safe','risk') OR (p_defender IS NULL)=(p_bot IS NULL) THEN RAISE EXCEPTION 'Duelo inválido'; END IF;
  IF NOT EXISTS(SELECT 1 FROM trainers WHERE id=p_attacker AND user_id=auth.uid() AND level>=10) THEN RAISE EXCEPTION 'Não autorizado'; END IF;
  IF (p_mode='safe' AND (p_wager<5000 OR p_wager>20000)) OR (p_mode='risk' AND (p_wager<20000 OR p_wager>100000)) THEN RAISE EXCEPTION 'Aposta fora do limite'; END IF;
  buff_cost:=CASE p_buff WHEN 'none' THEN 0 WHEN 'preparation' THEN 20 WHEN 'adrenaline' THEN 35 WHEN 'wall' THEN 25 WHEN 'insurance' THEN 30 ELSE NULL END;
  IF buff_cost IS NULL OR (p_buff='adrenaline' AND p_mode<>'risk') THEN RAISE EXCEPTION 'Buff inválido'; END IF;
  SELECT * INTO a FROM arena_profiles WHERE trainer_id=p_attacker FOR UPDATE;
  IF a.trainer_id IS NULL THEN RAISE EXCEPTION 'Atualize seu perfil da Arena'; END IF;
  IF now()>=a.attack_window_started_at+interval '8 hours' THEN UPDATE arena_profiles SET attacks_used=0,attack_window_started_at=now() WHERE trainer_id=p_attacker RETURNING * INTO a; END IF;
  IF a.attacks_used>=3 THEN RAISE EXCEPTION 'Seus ataques ainda estão recarregando'; END IF;
  key:=CASE WHEN p_defender IS NULL THEN 'bot:'||p_bot ELSE 'trainer:'||p_defender END;
  IF EXISTS(SELECT 1 FROM arena_cooldowns WHERE attacker_id=p_attacker AND defender_key=key AND available_at>now()) THEN RAISE EXCEPTION 'Adversário em recarga'; END IF;
  IF p_defender IS NOT NULL THEN
    SELECT * INTO d FROM arena_profiles WHERE trainer_id=p_defender FOR UPDATE;
    IF d.shield_until>now() THEN RAISE EXCEPTION 'Adversário protegido por escudo'; END IF; dp:=d.power;
  ELSE SELECT power INTO dp FROM arena_bots WHERE id=p_bot AND active=true;
  END IF;
  effective_power:=a.power*(CASE p_buff WHEN 'preparation' THEN 1.03 WHEN 'adrenaline' THEN 1.05 WHEN 'wall' THEN 1.03 ELSE 1 END);
  IF dp IS NULL OR dp<a.power*0.85 OR dp>a.power*(CASE WHEN p_buff IN ('preparation','adrenaline','wall') THEN 1.25 ELSE 1.15 END) THEN RAISE EXCEPTION 'Adversário fora da sua faixa de força'; END IF;
  IF NOT EXISTS(SELECT 1 FROM academies WHERE trainer_id=p_attacker AND money>=p_wager) THEN RAISE EXCEPTION 'Dinheiro insuficiente'; END IF;
  IF NOT EXISTS(SELECT 1 FROM academies WHERE trainer_id=p_attacker AND gems>=buff_cost) THEN RAISE EXCEPTION 'Gemas insuficientes'; END IF;
  UPDATE academies SET money=money-p_wager,gems=gems-buff_cost WHERE trainer_id=p_attacker;
  chance:=greatest(.25,least(.75,.5+(effective_power-dp)/100.0)); win:=random()<chance;
  ascore:=CASE WHEN win THEN 1+floor(random()*3)::int ELSE floor(random()*2)::int END;
  dscore:=CASE WHEN win THEN greatest(0,ascore-1-floor(random()*2)::int) ELSE ascore+1+floor(random()*2)::int END;
  difficulty:=dp::numeric/greatest(1,a.power); reward_mult:=CASE WHEN difficulty<=.95 THEN .90 WHEN difficulty<=1.05 THEN 1 WHEN difficulty<=1.15 THEN 1.20 ELSE 1.40 END;
  prize:=CASE WHEN win THEN round(p_wager*(CASE WHEN p_mode='safe' THEN 1.60 ELSE 1.80 END)*reward_mult) ELSE 0 END;
  delta:=prize-p_wager; IF prize>0 THEN UPDATE academies SET money=money+prize WHERE trainer_id=p_attacker; END IF;
  IF p_mode='risk' THEN damage:=(ARRAY[5,5,10,10,15])[1+floor(random()*5)::int]; END IF;
  IF p_mode='risk' AND NOT win AND p_buff<>'insurance' THEN
    UPDATE arena_profiles SET stadium_damage_pct=least(20,stadium_damage_pct+damage),repair_completes_at=greatest(coalesce(repair_completes_at,now()),now())+
      CASE damage WHEN 5 THEN interval '1 hour' WHEN 10 THEN interval '3 hours' ELSE interval '6 hours' END WHERE trainer_id=p_attacker;
  END IF;
  IF p_mode='risk' AND random()<(.12*CASE WHEN p_buff='adrenaline' THEN 1.5 ELSE 1 END) THEN
    SELECT c.id INTO injury FROM creatures c
    WHERE c.owner_trainer_id=p_attacker AND c.id IN (
      SELECT (slot->>'creature_id')::uuid FROM team_lineups tl,
      LATERAL jsonb_array_elements(tl.starters) slot WHERE tl.trainer_id=p_attacker AND slot->>'creature_id' IS NOT NULL
    ) ORDER BY random() LIMIT 1;
    UPDATE creatures SET injury_matches_remaining=greatest(injury_matches_remaining,CASE WHEN random()<.84 THEN 1 ELSE 2 END) WHERE id=injury;
  END IF;
  txp:=(CASE WHEN p_mode='safe' THEN CASE WHEN win THEN 20 ELSE 5 END ELSE CASE WHEN win THEN 50 ELSE 10 END END);
  cxp:=(CASE WHEN p_mode='safe' THEN CASE WHEN win THEN 10 ELSE 3 END ELSE CASE WHEN win THEN 30 ELSE 8 END END);
  IF p_bot IS NOT NULL THEN txp:=floor(txp*.8); cxp:=floor(cxp*.8); END IF;
  IF a.arena_xp_date IS DISTINCT FROM current_date THEN a.arena_xp_awarded:=0; END IF;
  xp_room:=greatest(0,150-a.arena_xp_awarded); txp:=least(txp,xp_room);
  UPDATE trainers SET xp=xp+txp,level=least(50,floor((-1+sqrt(1+8*(xp+txp)/350.0))/2))::integer WHERE id=p_attacker;
  UPDATE creatures SET xp=xp+cxp WHERE owner_trainer_id=p_attacker AND id IN (
    SELECT (slot->>'creature_id')::uuid FROM team_lineups tl,LATERAL jsonb_array_elements(tl.starters) slot WHERE tl.trainer_id=p_attacker AND slot->>'creature_id' IS NOT NULL
  );
  UPDATE arena_profiles SET attacks_used=attacks_used+1,wins=wins+(win::int),losses=losses+((NOT win)::int),arena_xp_date=current_date,arena_xp_awarded=CASE WHEN arena_xp_date IS DISTINCT FROM current_date THEN txp ELSE arena_xp_awarded+txp END,shield_until=NULL,updated_at=now() WHERE trainer_id=p_attacker;
  IF p_defender IS NOT NULL AND win AND p_mode='risk' THEN shield_hours:=12;
    UPDATE arena_profiles SET shield_until=greatest(coalesce(shield_until,now()),now()+make_interval(hours=>shield_hours)),
      stadium_damage_pct=least(20,stadium_damage_pct+damage),
      repair_completes_at=greatest(coalesce(repair_completes_at,now()),now())+
        CASE damage WHEN 5 THEN interval '1 hour' WHEN 10 THEN interval '3 hours' ELSE interval '6 hours' END,
      losses=losses+1 WHERE trainer_id=p_defender;
  END IF;
  INSERT INTO arena_cooldowns VALUES(p_attacker,key,now()+interval '24 hours') ON CONFLICT(attacker_id,defender_key) DO UPDATE SET available_at=excluded.available_at;
  INSERT INTO arena_duels(attacker_id,defender_id,bot_id,mode,buff_key,buff_gem_cost,wager,attacker_power,defender_power,attacker_score,defender_score,winner_id,money_delta,trainer_xp_awarded,creature_xp_awarded,stadium_damage_pct,injury_creature_id)
  VALUES(p_attacker,p_defender,p_bot,p_mode,p_buff,buff_cost,p_wager,a.power,dp,ascore,dscore,CASE WHEN win THEN p_attacker ELSE p_defender END,delta,txp,cxp,damage,injury);
  RETURN jsonb_build_object('won',win,'attacker_score',ascore,'defender_score',dscore,'money_delta',delta,'damage_pct',damage,'injury_creature_id',injury,'trainer_xp',txp,'creature_xp',cxp,'buff_cost',buff_cost,'effective_power',round(effective_power));
END $$;

REVOKE ALL ON FUNCTION public.refresh_arena_profile(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.play_arena_duel(uuid,uuid,uuid,text,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_arena_profile(uuid),public.play_arena_duel(uuid,uuid,uuid,text,integer,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.buy_arena_shield(p_trainer uuid,p_hours integer)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cost integer; result timestamptz;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM trainers WHERE id=p_trainer AND user_id=auth.uid() AND level>=10) THEN RAISE EXCEPTION 'Não autorizado'; END IF;
  cost:=CASE p_hours WHEN 12 THEN 30 WHEN 24 THEN 50 WHEN 72 THEN 120 ELSE NULL END;
  IF cost IS NULL THEN RAISE EXCEPTION 'Escudo inválido'; END IF;
  UPDATE academies SET gems=gems-cost WHERE trainer_id=p_trainer AND gems>=cost; IF NOT FOUND THEN RAISE EXCEPTION 'Gemas insuficientes'; END IF;
  UPDATE arena_profiles SET shield_until=least(now()+interval '7 days',greatest(coalesce(shield_until,now()),now())+make_interval(hours=>p_hours)),updated_at=now() WHERE trainer_id=p_trainer RETURNING shield_until INTO result;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.rush_arena_repair(p_trainer uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cost integer;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM trainers WHERE id=p_trainer AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Não autorizado'; END IF;
  SELECT greatest(10,ceil(extract(epoch FROM (repair_completes_at-now()))/3600)*10)::integer INTO cost FROM arena_profiles WHERE trainer_id=p_trainer AND repair_completes_at>now();
  IF cost IS NULL THEN RAISE EXCEPTION 'Nenhum reparo ativo'; END IF;
  UPDATE academies SET gems=gems-cost WHERE trainer_id=p_trainer AND gems>=cost; IF NOT FOUND THEN RAISE EXCEPTION 'Gemas insuficientes'; END IF;
  UPDATE arena_profiles SET stadium_damage_pct=0,repair_completes_at=NULL,updated_at=now() WHERE trainer_id=p_trainer;
  RETURN cost;
END $$;

REVOKE ALL ON FUNCTION public.buy_arena_shield(uuid,integer),public.rush_arena_repair(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.buy_arena_shield(uuid,integer),public.rush_arena_repair(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.buy_arena_scout(p_trainer uuid,p_defender uuid,p_bot uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ap integer; dp integer; chance integer;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM trainers WHERE id=p_trainer AND user_id=auth.uid() AND level>=10) OR (p_defender IS NULL)=(p_bot IS NULL) THEN RAISE EXCEPTION 'Não autorizado'; END IF;
  SELECT power INTO ap FROM arena_profiles WHERE trainer_id=p_trainer;
  IF p_defender IS NOT NULL THEN SELECT power INTO dp FROM arena_profiles WHERE trainer_id=p_defender; ELSE SELECT power INTO dp FROM arena_bots WHERE id=p_bot AND active=true; END IF;
  IF dp IS NULL THEN RAISE EXCEPTION 'Adversário indisponível'; END IF;
  UPDATE academies SET gems=gems-10 WHERE trainer_id=p_trainer AND gems>=10; IF NOT FOUND THEN RAISE EXCEPTION 'Gemas insuficientes'; END IF;
  chance:=round(greatest(.25,least(.75,.5+(ap-dp)/100.0))*100);
  RETURN chance;
END $$;
REVOKE ALL ON FUNCTION public.buy_arena_scout(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.buy_arena_scout(uuid,uuid,uuid) TO authenticated;
CREATE INDEX arena_profiles_power_idx ON public.arena_profiles(power,last_active_at DESC);
CREATE INDEX arena_duels_attacker_idx ON public.arena_duels(attacker_id,created_at DESC);
