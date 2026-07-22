
DROP POLICY IF EXISTS "own creatures" ON public.creatures;

CREATE POLICY "own creatures" ON public.creatures
  FOR ALL TO authenticated
  USING (
    (owner_trainer_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.trainers t
      WHERE t.id = creatures.owner_trainer_id AND t.user_id = auth.uid()
    ))
    OR
    (owner_team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.teams tm
      JOIN public.competitions c ON c.id = tm.competition_id
      JOIN public.trainers t2 ON t2.id = c.trainer_id
      WHERE tm.id = creatures.owner_team_id AND t2.user_id = auth.uid()
    ))
  )
  WITH CHECK (
    (owner_trainer_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.trainers t
      WHERE t.id = creatures.owner_trainer_id AND t.user_id = auth.uid()
    ))
    OR
    (owner_team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.teams tm
      JOIN public.competitions c ON c.id = tm.competition_id
      JOIN public.trainers t2 ON t2.id = c.trainer_id
      WHERE tm.id = creatures.owner_team_id AND t2.user_id = auth.uid()
    ))
  );
