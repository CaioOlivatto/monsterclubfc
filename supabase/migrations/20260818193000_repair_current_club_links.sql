-- Corrige carreiras criadas antes de trainers.current_team_id passar a ser a
-- fonte canônica do clube atual. Cada treinador recebe o seu time ativo já
-- marcado como time do jogador.
UPDATE public.trainers AS tr
SET current_team_id = (
  SELECT tm.id
  FROM public.teams AS tm
  WHERE tm.trainer_id = tr.id
    AND tm.is_player = true
  ORDER BY
    (tm.competition_id IS NOT NULL) DESC,
    tm.created_at DESC NULLS LAST,
    tm.id
  LIMIT 1
)
WHERE tr.current_team_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.teams AS tm
    WHERE tm.trainer_id = tr.id
      AND tm.is_player = true
  );

-- Vincula também construções antigas ao clube recuperado.
UPDATE public.buildings AS b
SET team_id = tr.current_team_id
FROM public.trainers AS tr
WHERE b.trainer_id = tr.id
  AND b.team_id IS NULL
  AND tr.current_team_id IS NOT NULL;

-- Registra a chegada inicial quando o histórico ainda não existia.
INSERT INTO public.trainer_career (
  trainer_id,
  team_id,
  team_name,
  division,
  season_start,
  event
)
SELECT
  tr.id,
  tm.id,
  tm.name,
  tm.division,
  1,
  'arrived'
FROM public.trainers AS tr
JOIN public.teams AS tm ON tm.id = tr.current_team_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.trainer_career AS tc
  WHERE tc.trainer_id = tr.id
    AND tc.team_id = tm.id
    AND tc.event IN ('arrived', 'hired')
);
