ALTER TABLE public.arena_profiles DROP CONSTRAINT IF EXISTS arena_profiles_attacks_used_check;
ALTER TABLE public.arena_profiles ADD CONSTRAINT arena_profiles_attacks_used_check CHECK(attacks_used BETWEEN 0 AND 6);
ALTER TABLE public.arena_duels DROP CONSTRAINT IF EXISTS arena_duels_mode_check;
UPDATE public.arena_duels SET mode='competitive' WHERE mode='safe';
ALTER TABLE public.arena_duels ADD CONSTRAINT arena_duels_mode_check CHECK(mode IN ('competitive','risk'));
ALTER TABLE public.arena_duels ADD COLUMN IF NOT EXISTS effective_attacker_power numeric;
ALTER TABLE public.arena_duels ADD COLUMN IF NOT EXISTS difficulty_ratio numeric;
ALTER TABLE public.arena_duels ADD COLUMN IF NOT EXISTS rating_delta integer NOT NULL DEFAULT 0;

ALTER TABLE public.club_entitlements ADD COLUMN IF NOT EXISTS preparation_credits integer NOT NULL DEFAULT 0 CHECK(preparation_credits>=0);
ALTER TABLE public.club_entitlements ADD COLUMN IF NOT EXISTS insurance_credits integer NOT NULL DEFAULT 0 CHECK(insurance_credits>=0);

-- A recompensa semanal dá acesso gratuito às decisões do modo de risco.
CREATE OR REPLACE FUNCTION public.grant_weekly_club_shield()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.task_key='weekly_bonus' THEN
    INSERT INTO club_entitlements(trainer_id,scout_credits,shield_12h_credits,preparation_credits,insurance_credits)
    VALUES(NEW.trainer_id,
      1,
      CASE WHEN EXISTS(SELECT 1 FROM club_memberships WHERE trainer_id=NEW.trainer_id AND active_until>now()) THEN 1 ELSE 0 END,
      1,
      CASE WHEN extract(week FROM now())::integer%2=0 THEN 1 ELSE 0 END)
    ON CONFLICT(trainer_id) DO UPDATE SET
      scout_credits=club_entitlements.scout_credits+1,
      shield_12h_credits=club_entitlements.shield_12h_credits+excluded.shield_12h_credits,
      preparation_credits=club_entitlements.preparation_credits+1,
      insurance_credits=club_entitlements.insurance_credits+excluded.insurance_credits,
      updated_at=now();
  END IF;
  RETURN NEW;
END $$;

-- A força de pareamento vem dos 11 titulares; qualquer atleta premium escalado entra imediatamente no cálculo.
CREATE OR REPLACE FUNCTION public.refresh_arena_profile(p_trainer_id uuid)
RETURNS public.arena_profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_power integer; v_row arena_profiles;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM trainers WHERE id=p_trainer_id AND user_id=auth.uid() AND level>=10) THEN RAISE EXCEPTION 'Arena desbloqueia no nível 10'; END IF;
  UPDATE arena_profiles SET stadium_damage_pct=0,repair_completes_at=NULL,updated_at=now() WHERE trainer_id=p_trainer_id AND repair_completes_at<=now();
  SELECT round(avg(c.overall))::integer INTO v_power FROM team_lineups tl CROSS JOIN LATERAL jsonb_array_elements(tl.starters) slot JOIN creatures c ON c.id=(slot->>'creature_id')::uuid WHERE tl.trainer_id=p_trainer_id AND slot->>'creature_id' IS NOT NULL;
  IF v_power IS NULL THEN SELECT coalesce(round(avg(overall)),0)::integer INTO v_power FROM creatures WHERE owner_trainer_id=p_trainer_id; END IF;
  INSERT INTO arena_profiles(trainer_id,power,shield_until) VALUES(p_trainer_id,v_power,now()+interval '24 hours') ON CONFLICT(trainer_id) DO UPDATE SET power=v_power,last_active_at=now(),updated_at=now() RETURNING * INTO v_row;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.play_arena_duel(p_attacker uuid,p_defender uuid,p_bot uuid,p_mode text,p_wager integer,p_buff text DEFAULT 'none')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a arena_profiles; d arena_profiles; dp integer; chance numeric; win boolean; ascore integer; dscore integer;
  prize integer:=0; delta integer:=0; damage integer:=0; injury uuid; opponent_key text; buff_cost integer:=0;
  effective_power numeric; difficulty numeric; reward_mult numeric; txp integer; cxp integer; xp_room integer;
  attack_limit integer:=3; strength_buffs integer:=0; used_free boolean:=false; energy_wear integer:=0;
BEGIN
  IF p_mode NOT IN ('competitive','risk') OR (p_defender IS NULL)=(p_bot IS NULL) THEN RAISE EXCEPTION 'Duelo inválido'; END IF;
  IF NOT EXISTS(SELECT 1 FROM trainers WHERE id=p_attacker AND user_id=auth.uid() AND level>=10) THEN RAISE EXCEPTION 'Não autorizado'; END IF;
  IF EXISTS(SELECT 1 FROM club_memberships WHERE trainer_id=p_attacker AND active_until>now()) THEN attack_limit:=6; END IF;
  IF p_mode='competitive' THEN
    IF p_buff<>'none' THEN RAISE EXCEPTION 'Buffs não são permitidos na Arena Competitiva'; END IF;
    p_wager:=1;
  ELSIF p_wager<20000 OR p_wager>100000 THEN RAISE EXCEPTION 'Aposta fora do limite';
  END IF;
  buff_cost:=CASE p_buff WHEN 'none' THEN 0 WHEN 'preparation' THEN 20 WHEN 'adrenaline' THEN 35 WHEN 'wall' THEN 25 WHEN 'insurance' THEN 30 ELSE NULL END;
  IF buff_cost IS NULL OR (p_mode<>'risk' AND p_buff<>'none') THEN RAISE EXCEPTION 'Buff inválido'; END IF;
  IF p_buff IN ('preparation','adrenaline','wall') THEN
    SELECT count(*) INTO strength_buffs FROM arena_duels WHERE attacker_id=p_attacker AND created_at>=now()-interval '24 hours' AND buff_key IN ('preparation','adrenaline','wall');
    IF strength_buffs>=3 THEN RAISE EXCEPTION 'Limite diário de 3 buffs de força atingido'; END IF;
  END IF;
  SELECT * INTO a FROM arena_profiles WHERE trainer_id=p_attacker FOR UPDATE;
  IF a.trainer_id IS NULL THEN RAISE EXCEPTION 'Atualize seu perfil da Arena'; END IF;
  IF now()>=a.attack_window_started_at+interval '8 hours' THEN UPDATE arena_profiles SET attacks_used=0,attack_window_started_at=now() WHERE trainer_id=p_attacker RETURNING * INTO a; END IF;
  IF a.attacks_used>=attack_limit THEN RAISE EXCEPTION 'Suas partidas ainda estão recarregando'; END IF;
  opponent_key:=CASE WHEN p_defender IS NULL THEN 'bot:'||p_bot ELSE 'trainer:'||p_defender END;
  IF EXISTS(SELECT 1 FROM arena_cooldowns WHERE attacker_id=p_attacker AND defender_key=opponent_key AND available_at>now()) THEN RAISE EXCEPTION 'Adversário em recarga'; END IF;
  IF p_defender IS NOT NULL THEN
    SELECT * INTO d FROM arena_profiles WHERE trainer_id=p_defender FOR UPDATE;
    IF p_mode='risk' AND d.shield_until>now() THEN RAISE EXCEPTION 'Adversário protegido por escudo'; END IF;
    dp:=d.power;
  ELSE SELECT power INTO dp FROM arena_bots WHERE id=p_bot AND active=true;
  END IF;
  effective_power:=a.power*CASE p_buff WHEN 'preparation' THEN 1.03 WHEN 'adrenaline' THEN 1.05 WHEN 'wall' THEN 1.01 ELSE 1 END;
  IF dp IS NULL OR (p_mode='competitive' AND (dp<a.power*.90 OR dp>a.power*1.10)) OR (p_mode='risk' AND (dp<a.power*.85 OR dp>a.power*1.25)) THEN RAISE EXCEPTION 'Adversário fora da faixa justa de força'; END IF;
  IF p_mode='risk' AND NOT EXISTS(SELECT 1 FROM academies WHERE trainer_id=p_attacker AND money>=p_wager) THEN RAISE EXCEPTION 'Dinheiro insuficiente'; END IF;
  IF p_buff='preparation' THEN UPDATE club_entitlements SET preparation_credits=preparation_credits-1 WHERE trainer_id=p_attacker AND preparation_credits>0; used_free:=FOUND;
  ELSIF p_buff='insurance' THEN UPDATE club_entitlements SET insurance_credits=insurance_credits-1 WHERE trainer_id=p_attacker AND insurance_credits>0; used_free:=FOUND;
  END IF;
  IF NOT used_free AND buff_cost>0 THEN UPDATE academies SET gems=gems-buff_cost WHERE trainer_id=p_attacker AND gems>=buff_cost; IF NOT FOUND THEN RAISE EXCEPTION 'Gemas insuficientes'; END IF; END IF;
  IF p_mode='risk' THEN UPDATE academies SET money=money-p_wager WHERE trainer_id=p_attacker; END IF;
  chance:=greatest(.25,least(.75,.5+(effective_power-dp)/100.0));
  IF p_buff='wall' THEN chance:=greatest(.25,chance-.01); END IF;
  win:=random()<chance;
  ascore:=CASE WHEN win THEN 1+floor(random()*3)::int ELSE floor(random()*2)::int END;
  dscore:=CASE WHEN win THEN greatest(0,ascore-1-floor(random()*2)::int) ELSE ascore+1+floor(random()*2)::int END;
  IF p_buff='wall' THEN ascore:=least(ascore,2); END IF;
  difficulty:=dp::numeric/greatest(1,effective_power);
  reward_mult:=CASE WHEN difficulty<=.95 THEN .90 WHEN difficulty<=1.05 THEN 1 WHEN difficulty<=1.15 THEN 1.20 ELSE 1.40 END;
  IF p_mode='risk' THEN prize:=CASE WHEN win THEN round(p_wager*1.80*reward_mult) ELSE 0 END; delta:=prize-p_wager; IF prize>0 THEN UPDATE academies SET money=money+prize WHERE trainer_id=p_attacker; END IF; END IF;
  IF p_mode='risk' THEN damage:=(ARRAY[5,5,10,10,15])[1+floor(random()*5)::int]; END IF;
  IF p_mode='risk' AND NOT win AND p_buff<>'insurance' THEN UPDATE arena_profiles SET stadium_damage_pct=least(20,stadium_damage_pct+damage),repair_completes_at=greatest(coalesce(repair_completes_at,now()),now())+CASE damage WHEN 5 THEN interval '1 hour' WHEN 10 THEN interval '3 hours' ELSE interval '6 hours' END WHERE trainer_id=p_attacker; END IF;
  IF p_buff='preparation' THEN energy_wear:=8; ELSIF p_buff='adrenaline' THEN energy_wear:=5; END IF;
  IF energy_wear>0 THEN UPDATE creatures SET energy=greatest(0,energy-energy_wear) WHERE owner_trainer_id=p_attacker AND id IN(SELECT (slot->>'creature_id')::uuid FROM team_lineups tl,LATERAL jsonb_array_elements(tl.starters) slot WHERE tl.trainer_id=p_attacker AND slot->>'creature_id' IS NOT NULL); END IF;
  IF p_mode='risk' AND random()<(CASE WHEN p_buff='adrenaline' THEN .30 ELSE .12 END) THEN
    SELECT c.id INTO injury FROM creatures c WHERE c.owner_trainer_id=p_attacker AND c.id IN(SELECT (slot->>'creature_id')::uuid FROM team_lineups tl,LATERAL jsonb_array_elements(tl.starters) slot WHERE tl.trainer_id=p_attacker AND slot->>'creature_id' IS NOT NULL) ORDER BY random() LIMIT 1;
    UPDATE creatures SET injury_matches_remaining=greatest(injury_matches_remaining,CASE WHEN random()<.84 THEN 1 ELSE 2 END) WHERE id=injury;
  END IF;
  txp:=CASE WHEN p_mode='competitive' THEN CASE WHEN win THEN 20 ELSE 5 END ELSE CASE WHEN win THEN 15 ELSE 4 END END;
  cxp:=CASE WHEN p_mode='competitive' THEN CASE WHEN win THEN 10 ELSE 3 END ELSE CASE WHEN win THEN 8 ELSE 2 END END;
  txp:=floor(txp*least(1,greatest(.35,difficulty)));
  cxp:=floor(cxp*least(1,greatest(.35,difficulty)));
  IF p_bot IS NOT NULL THEN txp:=floor(txp*.8); cxp:=floor(cxp*.8); END IF;
  IF a.arena_xp_date IS DISTINCT FROM current_date THEN a.arena_xp_awarded:=0; END IF;
  xp_room:=greatest(0,150-a.arena_xp_awarded); txp:=least(txp,xp_room); IF xp_room=0 THEN cxp:=0; END IF;
  UPDATE trainers SET xp=xp+txp,level=least(50,floor((-1+sqrt(1+8*(xp+txp)/350.0))/2))::integer WHERE id=p_attacker;
  UPDATE creatures SET xp=xp+cxp WHERE owner_trainer_id=p_attacker AND id IN(SELECT (slot->>'creature_id')::uuid FROM team_lineups tl,LATERAL jsonb_array_elements(tl.starters) slot WHERE tl.trainer_id=p_attacker AND slot->>'creature_id' IS NOT NULL);
  UPDATE arena_profiles SET attacks_used=attacks_used+1,wins=wins+(win::int),losses=losses+((NOT win)::int),arena_xp_date=current_date,arena_xp_awarded=CASE WHEN arena_xp_date IS DISTINCT FROM current_date THEN txp ELSE arena_xp_awarded+txp END,shield_until=CASE WHEN p_mode='risk' THEN NULL ELSE shield_until END,updated_at=now() WHERE trainer_id=p_attacker;
  IF p_defender IS NOT NULL AND win AND p_mode='risk' THEN UPDATE arena_profiles SET shield_until=greatest(coalesce(shield_until,now()),now()+interval '12 hours'),stadium_damage_pct=least(20,stadium_damage_pct+damage),repair_completes_at=greatest(coalesce(repair_completes_at,now()),now())+CASE damage WHEN 5 THEN interval '1 hour' WHEN 10 THEN interval '3 hours' ELSE interval '6 hours' END,losses=losses+1 WHERE trainer_id=p_defender; END IF;
  INSERT INTO arena_cooldowns VALUES(p_attacker,opponent_key,now()+interval '24 hours') ON CONFLICT(attacker_id,defender_key) DO UPDATE SET available_at=excluded.available_at;
  INSERT INTO arena_duels(attacker_id,defender_id,bot_id,mode,buff_key,buff_gem_cost,wager,attacker_power,effective_attacker_power,difficulty_ratio,defender_power,attacker_score,defender_score,winner_id,money_delta,trainer_xp_awarded,creature_xp_awarded,stadium_damage_pct,injury_creature_id)
  VALUES(p_attacker,p_defender,p_bot,p_mode,p_buff,CASE WHEN used_free THEN 0 ELSE buff_cost END,p_wager,a.power,effective_power,difficulty,dp,ascore,dscore,CASE WHEN win THEN p_attacker ELSE p_defender END,delta,txp,cxp,damage,injury);
  RETURN jsonb_build_object('won',win,'attacker_score',ascore,'defender_score',dscore,'money_delta',delta,'damage_pct',damage,'injury_creature_id',injury,'trainer_xp',txp,'creature_xp',cxp,'buff_cost',CASE WHEN used_free THEN 0 ELSE buff_cost END,'used_free_buff',used_free,'effective_power',round(effective_power),'difficulty',round(difficulty,3));
END $$;

-- Somente o competitivo altera o ranking oficial; risco é ignorado.
CREATE OR REPLACE FUNCTION public.track_arena_season()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE k text:=to_char(now() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM'); attacker_points integer; defender_points integer;
BEGIN
  IF NEW.mode<>'competitive' THEN RETURN NEW; END IF;
  attacker_points:=CASE WHEN NEW.winner_id=NEW.attacker_id THEN 18 ELSE -8 END;
  defender_points:=CASE WHEN NEW.winner_id=NEW.attacker_id THEN -8 ELSE 18 END;
  UPDATE arena_profiles SET arena_rating=CASE WHEN arena_season_key IS DISTINCT FROM k THEN 1000+attacker_points ELSE greatest(800,arena_rating+attacker_points) END,season_duels=CASE WHEN arena_season_key IS DISTINCT FROM k THEN 1 ELSE season_duels+1 END,season_wins=CASE WHEN arena_season_key IS DISTINCT FROM k THEN (NEW.winner_id=NEW.attacker_id)::int ELSE season_wins+(NEW.winner_id=NEW.attacker_id)::int END,arena_season_key=k,arena_title=CASE WHEN arena_rating+attacker_points>=1400 THEN 'Lenda da Arena' WHEN arena_rating+attacker_points>=1200 THEN 'Gladiador' ELSE 'Desafiante' END WHERE trainer_id=NEW.attacker_id;
  IF NEW.defender_id IS NOT NULL THEN UPDATE arena_profiles SET arena_rating=CASE WHEN arena_season_key IS DISTINCT FROM k THEN 1000+defender_points ELSE greatest(800,arena_rating+defender_points) END,season_duels=CASE WHEN arena_season_key IS DISTINCT FROM k THEN 1 ELSE season_duels+1 END,season_wins=CASE WHEN arena_season_key IS DISTINCT FROM k THEN (NEW.winner_id=NEW.defender_id)::int ELSE season_wins+(NEW.winner_id=NEW.defender_id)::int END,arena_season_key=k WHERE trainer_id=NEW.defender_id; END IF;
  UPDATE arena_duels SET rating_delta=attacker_points WHERE id=NEW.id;
  RETURN NEW;
END $$;
