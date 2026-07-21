
-- =========================================================
-- ENUMS
-- =========================================================
CREATE TYPE public.element_type AS ENUM ('fogo','agua','terra','ar','gelo');
CREATE TYPE public.building_type AS ENUM ('ct_treino','ct_elemental','estadio','centro_medico');
CREATE TYPE public.division_type AS ENUM ('bronze','prata','ouro','diamante','lendaria');
CREATE TYPE public.match_status AS ENUM ('scheduled','in_progress','finished');
CREATE TYPE public.transaction_type AS ENUM ('income','expense');
CREATE TYPE public.transfer_type AS ENUM ('buy','sell');

-- =========================================================
-- Helper: updated_at trigger
-- =========================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- =========================================================
-- profiles
-- =========================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- trainers
-- =========================================================
CREATE TABLE public.trainers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  trainer_name TEXT NOT NULL,
  academy_name TEXT NOT NULL,
  level INT NOT NULL DEFAULT 1,
  xp INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trainers TO authenticated;
GRANT ALL ON public.trainers TO service_role;
ALTER TABLE public.trainers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own trainer" ON public.trainers FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_trainers_updated BEFORE UPDATE ON public.trainers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- academies
-- =========================================================
CREATE TABLE public.academies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id UUID NOT NULL UNIQUE REFERENCES public.trainers(id) ON DELETE CASCADE,
  money BIGINT NOT NULL DEFAULT 300000,
  gems INT NOT NULL DEFAULT 50,
  builders INT NOT NULL DEFAULT 1,
  roster_slots INT NOT NULL DEFAULT 24,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academies TO authenticated;
GRANT ALL ON public.academies TO service_role;
ALTER TABLE public.academies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own academy" ON public.academies FOR ALL
  USING (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = auth.uid()));
CREATE TRIGGER trg_academies_updated BEFORE UPDATE ON public.academies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- creatures
-- =========================================================
CREATE TABLE public.creatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_trainer_id UUID REFERENCES public.trainers(id) ON DELETE CASCADE,
  owner_team_id UUID, -- FK added later (teams table)
  name TEXT NOT NULL,
  element public.element_type NOT NULL,
  suggested_position TEXT,
  -- Atributos em escala 0-100 (5 estrelas = 100). Meia estrela = 10.
  attack SMALLINT NOT NULL DEFAULT 20 CHECK (attack BETWEEN 0 AND 100),
  defense SMALLINT NOT NULL DEFAULT 20 CHECK (defense BETWEEN 0 AND 100),
  goalkeeper SMALLINT NOT NULL DEFAULT 20 CHECK (goalkeeper BETWEEN 0 AND 100),
  physical SMALLINT NOT NULL DEFAULT 20 CHECK (physical BETWEEN 0 AND 100),
  strength SMALLINT NOT NULL DEFAULT 20 CHECK (strength BETWEEN 0 AND 100),
  -- Afinidades por elemento (%): 0-15
  aff_fogo SMALLINT NOT NULL DEFAULT 0 CHECK (aff_fogo BETWEEN 0 AND 15),
  aff_agua SMALLINT NOT NULL DEFAULT 0 CHECK (aff_agua BETWEEN 0 AND 15),
  aff_terra SMALLINT NOT NULL DEFAULT 0 CHECK (aff_terra BETWEEN 0 AND 15),
  aff_ar SMALLINT NOT NULL DEFAULT 0 CHECK (aff_ar BETWEEN 0 AND 15),
  aff_gelo SMALLINT NOT NULL DEFAULT 0 CHECK (aff_gelo BETWEEN 0 AND 15),
  overall SMALLINT NOT NULL DEFAULT 20,
  xp INT NOT NULL DEFAULT 0,
  half_stars_earned SMALLINT NOT NULL DEFAULT 0,
  energy SMALLINT NOT NULL DEFAULT 100 CHECK (energy BETWEEN 0 AND 100),
  market_value BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_creatures_owner_trainer ON public.creatures(owner_trainer_id);
CREATE INDEX idx_creatures_owner_team ON public.creatures(owner_team_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creatures TO authenticated;
GRANT ALL ON public.creatures TO service_role;
ALTER TABLE public.creatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own creatures" ON public.creatures FOR ALL
  USING (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = owner_trainer_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = owner_trainer_id AND t.user_id = auth.uid()));
CREATE TRIGGER trg_creatures_updated BEFORE UPDATE ON public.creatures FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- buildings
-- =========================================================
CREATE TABLE public.buildings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id UUID NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  building_type public.building_type NOT NULL,
  level INT NOT NULL DEFAULT 1,
  upgrade_completes_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trainer_id, building_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.buildings TO authenticated;
GRANT ALL ON public.buildings TO service_role;
ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own buildings" ON public.buildings FOR ALL
  USING (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = auth.uid()));
CREATE TRIGGER trg_buildings_updated BEFORE UPDATE ON public.buildings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- game_seasons
-- =========================================================
CREATE TABLE public.game_seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id UUID NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  season_number INT NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  UNIQUE (trainer_id, season_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_seasons TO authenticated;
GRANT ALL ON public.game_seasons TO service_role;
ALTER TABLE public.game_seasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own seasons" ON public.game_seasons FOR ALL
  USING (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = auth.uid()));

-- =========================================================
-- competitions
-- =========================================================
CREATE TABLE public.competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id UUID NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  season_id UUID NOT NULL REFERENCES public.game_seasons(id) ON DELETE CASCADE,
  division public.division_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitions TO authenticated;
GRANT ALL ON public.competitions TO service_role;
ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own competitions" ON public.competitions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = auth.uid()));

-- =========================================================
-- teams
-- =========================================================
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_player BOOLEAN NOT NULL DEFAULT FALSE,
  trainer_id UUID REFERENCES public.trainers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_teams_competition ON public.teams(competition_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own league teams" ON public.teams FOR ALL
  USING (EXISTS (SELECT 1 FROM public.competitions c JOIN public.trainers t ON t.id = c.trainer_id WHERE c.id = competition_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.competitions c JOIN public.trainers t ON t.id = c.trainer_id WHERE c.id = competition_id AND t.user_id = auth.uid()));

-- Now add FK from creatures.owner_team_id to teams
ALTER TABLE public.creatures
  ADD CONSTRAINT creatures_owner_team_fk FOREIGN KEY (owner_team_id) REFERENCES public.teams(id) ON DELETE SET NULL;

-- =========================================================
-- standings
-- =========================================================
CREATE TABLE public.standings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  points INT NOT NULL DEFAULT 0,
  wins INT NOT NULL DEFAULT 0,
  draws INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  goals_for INT NOT NULL DEFAULT 0,
  goals_against INT NOT NULL DEFAULT 0,
  UNIQUE (competition_id, team_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.standings TO authenticated;
GRANT ALL ON public.standings TO service_role;
ALTER TABLE public.standings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own league standings" ON public.standings FOR ALL
  USING (EXISTS (SELECT 1 FROM public.competitions c JOIN public.trainers t ON t.id = c.trainer_id WHERE c.id = competition_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.competitions c JOIN public.trainers t ON t.id = c.trainer_id WHERE c.id = competition_id AND t.user_id = auth.uid()));

-- =========================================================
-- matches
-- =========================================================
CREATE TABLE public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  round INT NOT NULL,
  home_team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  away_team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  home_score INT,
  away_score INT,
  status public.match_status NOT NULL DEFAULT 'scheduled',
  played_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_matches_competition_round ON public.matches(competition_id, round);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matches TO authenticated;
GRANT ALL ON public.matches TO service_role;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own league matches" ON public.matches FOR ALL
  USING (EXISTS (SELECT 1 FROM public.competitions c JOIN public.trainers t ON t.id = c.trainer_id WHERE c.id = competition_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.competitions c JOIN public.trainers t ON t.id = c.trainer_id WHERE c.id = competition_id AND t.user_id = auth.uid()));

-- =========================================================
-- match_events
-- =========================================================
CREATE TABLE public.match_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  minute SMALLINT NOT NULL,
  event_type TEXT NOT NULL,
  description TEXT,
  actor_creature_id UUID REFERENCES public.creatures(id) ON DELETE SET NULL,
  actor_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_match_events_match ON public.match_events(match_id, minute);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.match_events TO authenticated;
GRANT ALL ON public.match_events TO service_role;
ALTER TABLE public.match_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own match events" ON public.match_events FOR ALL
  USING (EXISTS (SELECT 1 FROM public.matches m JOIN public.competitions c ON c.id = m.competition_id JOIN public.trainers t ON t.id = c.trainer_id WHERE m.id = match_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.matches m JOIN public.competitions c ON c.id = m.competition_id JOIN public.trainers t ON t.id = c.trainer_id WHERE m.id = match_id AND t.user_id = auth.uid()));

-- =========================================================
-- market_listings
-- =========================================================
CREATE TABLE public.market_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id UUID NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  season_id UUID NOT NULL REFERENCES public.game_seasons(id) ON DELETE CASCADE,
  creature_snapshot JSONB NOT NULL,
  price BIGINT NOT NULL,
  sold BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_listings TO authenticated;
GRANT ALL ON public.market_listings TO service_role;
ALTER TABLE public.market_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own market" ON public.market_listings FOR ALL
  USING (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = auth.uid()));

-- =========================================================
-- transfers
-- =========================================================
CREATE TABLE public.transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id UUID NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  creature_id UUID REFERENCES public.creatures(id) ON DELETE SET NULL,
  transfer_type public.transfer_type NOT NULL,
  amount BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfers TO authenticated;
GRANT ALL ON public.transfers TO service_role;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own transfers" ON public.transfers FOR ALL
  USING (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = auth.uid()));

-- =========================================================
-- items
-- =========================================================
CREATE TABLE public.items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id UUID NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trainer_id, item_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.items TO authenticated;
GRANT ALL ON public.items TO service_role;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own items" ON public.items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = auth.uid()));
CREATE TRIGGER trg_items_updated BEFORE UPDATE ON public.items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- financial_transactions
-- =========================================================
CREATE TABLE public.financial_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id UUID NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  transaction_type public.transaction_type NOT NULL,
  amount BIGINT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_financial_trainer_date ON public.financial_transactions(trainer_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_transactions TO authenticated;
GRANT ALL ON public.financial_transactions TO service_role;
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own finance" ON public.financial_transactions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = auth.uid()));
