-- Balanceamento v2: temporadas reproduzíveis e ciclo de idade alcançável.
ALTER TABLE public.game_seasons
  ADD COLUMN IF NOT EXISTS balance_version text NOT NULL DEFAULT '2.0.0';

ALTER TABLE public.creatures
  ADD COLUMN IF NOT EXISTS last_aged_season integer NOT NULL DEFAULT 0;

ALTER TABLE public.creatures
  DROP CONSTRAINT IF EXISTS creatures_last_aged_season_check;
ALTER TABLE public.creatures
  ADD CONSTRAINT creatures_last_aged_season_check CHECK (last_aged_season >= 0);

CREATE OR REPLACE FUNCTION public.advance_creature_careers_on_season_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF OLD.is_current = true AND NEW.is_current = false THEN
    UPDATE public.creatures AS c
       SET age = LEAST(33, COALESCE(c.age, 18) + 3),
           career_season = LEAST(6, COALESCE(c.career_season, 1) + 1),
           last_aged_season = OLD.season_number,
           updated_at = now()
     WHERE c.retired = false
       AND c.last_aged_season < OLD.season_number
       AND (
         c.owner_trainer_id = OLD.trainer_id
         OR EXISTS (
           SELECT 1
             FROM public.teams AS tm
             JOIN public.competitions AS comp ON comp.id = tm.competition_id
            WHERE tm.id = c.owner_team_id
              AND comp.trainer_id = OLD.trainer_id
         )
       );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_creature_careers_on_season_close() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_advance_creature_careers ON public.game_seasons;
CREATE TRIGGER trg_advance_creature_careers
AFTER UPDATE OF is_current ON public.game_seasons
FOR EACH ROW
EXECUTE FUNCTION public.advance_creature_careers_on_season_close();

COMMENT ON COLUMN public.game_seasons.balance_version IS
  'Versão imutável das regras econômicas usada ao criar a temporada.';
COMMENT ON COLUMN public.creatures.last_aged_season IS
  'Evita envelhecimento duplicado em retomadas idempotentes do fim de temporada.';
