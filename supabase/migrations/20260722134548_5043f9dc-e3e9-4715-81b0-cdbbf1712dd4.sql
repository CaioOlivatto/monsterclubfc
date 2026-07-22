-- 1. Wipe: apagar tudo relacionado a criaturas/partidas
DELETE FROM match_events;
DELETE FROM matches;
DELETE FROM standings;
DELETE FROM transfers;
DELETE FROM team_lineups;
DELETE FROM creatures;
DELETE FROM market_listings;
DELETE FROM teams;
DELETE FROM competitions;

-- 2. Novo esquema de creatures
ALTER TABLE public.creatures
  DROP CONSTRAINT IF EXISTS creatures_attack_check,
  DROP CONSTRAINT IF EXISTS creatures_defense_check,
  DROP CONSTRAINT IF EXISTS creatures_goalkeeper_check,
  DROP CONSTRAINT IF EXISTS creatures_physical_check,
  DROP CONSTRAINT IF EXISTS creatures_strength_check;

ALTER TABLE public.creatures
  DROP COLUMN IF EXISTS attack,
  DROP COLUMN IF EXISTS defense,
  DROP COLUMN IF EXISTS goalkeeper,
  DROP COLUMN IF EXISTS physical,
  DROP COLUMN IF EXISTS strength;

ALTER TABLE public.creatures
  ADD COLUMN species text NOT NULL DEFAULT 'Fênix',
  ADD COLUMN epithet text NOT NULL DEFAULT '',
  ADD COLUMN power_key text NOT NULL DEFAULT 'renascer',
  ADD COLUMN is_goalkeeper boolean NOT NULL DEFAULT false,
  ADD COLUMN age integer NOT NULL DEFAULT 18,
  ADD COLUMN career_season integer NOT NULL DEFAULT 1,
  ADD COLUMN retired boolean NOT NULL DEFAULT false,
  -- 6 atributos de linha
  ADD COLUMN attr_defender smallint NOT NULL DEFAULT 20,
  ADD COLUMN attr_passar   smallint NOT NULL DEFAULT 20,
  ADD COLUMN attr_atacar   smallint NOT NULL DEFAULT 20,
  ADD COLUMN attr_tecnica  smallint NOT NULL DEFAULT 20,
  ADD COLUMN attr_forca    smallint NOT NULL DEFAULT 20,
  ADD COLUMN attr_pique    smallint NOT NULL DEFAULT 20,
  -- 3 atributos de goleiro
  ADD COLUMN attr_maos          smallint NOT NULL DEFAULT 20,
  ADD COLUMN attr_concentracao  smallint NOT NULL DEFAULT 20,
  ADD COLUMN attr_elasticidade  smallint NOT NULL DEFAULT 20;

ALTER TABLE public.creatures
  ADD CONSTRAINT creatures_attr_defender_check     CHECK (attr_defender BETWEEN 0 AND 100),
  ADD CONSTRAINT creatures_attr_passar_check       CHECK (attr_passar   BETWEEN 0 AND 100),
  ADD CONSTRAINT creatures_attr_atacar_check       CHECK (attr_atacar   BETWEEN 0 AND 100),
  ADD CONSTRAINT creatures_attr_tecnica_check      CHECK (attr_tecnica  BETWEEN 0 AND 100),
  ADD CONSTRAINT creatures_attr_forca_check        CHECK (attr_forca    BETWEEN 0 AND 100),
  ADD CONSTRAINT creatures_attr_pique_check        CHECK (attr_pique    BETWEEN 0 AND 100),
  ADD CONSTRAINT creatures_attr_maos_check         CHECK (attr_maos          BETWEEN 0 AND 100),
  ADD CONSTRAINT creatures_attr_conc_check         CHECK (attr_concentracao  BETWEEN 0 AND 100),
  ADD CONSTRAINT creatures_attr_elas_check         CHECK (attr_elasticidade  BETWEEN 0 AND 100),
  ADD CONSTRAINT creatures_age_check               CHECK (age BETWEEN 18 AND 40),
  ADD CONSTRAINT creatures_career_check            CHECK (career_season BETWEEN 1 AND 6);
