
-- Etapa 7: Ligas - políticas RLS ampliadas + coluna de força CPU

ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS cpu_strength integer;

DROP POLICY IF EXISTS "own league teams" ON public.teams;
CREATE POLICY "own teams" ON public.teams FOR ALL TO authenticated
USING (
  (trainer_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = teams.trainer_id AND t.user_id = auth.uid()))
  OR (competition_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.competitions c JOIN public.trainers t ON t.id = c.trainer_id WHERE c.id = teams.competition_id AND t.user_id = auth.uid()))
)
WITH CHECK (
  (trainer_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = teams.trainer_id AND t.user_id = auth.uid()))
  OR (competition_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.competitions c JOIN public.trainers t ON t.id = c.trainer_id WHERE c.id = teams.competition_id AND t.user_id = auth.uid()))
);

DROP POLICY IF EXISTS "own league matches" ON public.matches;
CREATE POLICY "own matches" ON public.matches FOR ALL TO authenticated
USING (
  (competition_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.competitions c JOIN public.trainers t ON t.id = c.trainer_id WHERE c.id = matches.competition_id AND t.user_id = auth.uid()))
  OR EXISTS (SELECT 1 FROM public.teams tm JOIN public.trainers t ON t.id = tm.trainer_id WHERE (tm.id = matches.home_team_id OR tm.id = matches.away_team_id) AND t.user_id = auth.uid())
)
WITH CHECK (
  (competition_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.competitions c JOIN public.trainers t ON t.id = c.trainer_id WHERE c.id = matches.competition_id AND t.user_id = auth.uid()))
  OR EXISTS (SELECT 1 FROM public.teams tm JOIN public.trainers t ON t.id = tm.trainer_id WHERE (tm.id = matches.home_team_id OR tm.id = matches.away_team_id) AND t.user_id = auth.uid())
);

DROP POLICY IF EXISTS "own match events" ON public.match_events;
CREATE POLICY "own match events" ON public.match_events FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.matches m
    LEFT JOIN public.competitions c ON c.id = m.competition_id
    LEFT JOIN public.trainers tc ON tc.id = c.trainer_id
    LEFT JOIN public.teams th ON th.id = m.home_team_id
    LEFT JOIN public.trainers tth ON tth.id = th.trainer_id
    LEFT JOIN public.teams ta ON ta.id = m.away_team_id
    LEFT JOIN public.trainers tta ON tta.id = ta.trainer_id
    WHERE m.id = match_events.match_id
      AND (tc.user_id = auth.uid() OR tth.user_id = auth.uid() OR tta.user_id = auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.matches m
    LEFT JOIN public.competitions c ON c.id = m.competition_id
    LEFT JOIN public.trainers tc ON tc.id = c.trainer_id
    LEFT JOIN public.teams th ON th.id = m.home_team_id
    LEFT JOIN public.trainers tth ON tth.id = th.trainer_id
    LEFT JOIN public.teams ta ON ta.id = m.away_team_id
    LEFT JOIN public.trainers tta ON tta.id = ta.trainer_id
    WHERE m.id = match_events.match_id
      AND (tc.user_id = auth.uid() OR tth.user_id = auth.uid() OR tta.user_id = auth.uid())
  )
);
