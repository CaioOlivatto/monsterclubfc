-- Infraestrutura passa a pertencer ao clube, não ao treinador.
ALTER TABLE public.buildings
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE;

UPDATE public.buildings b
SET team_id = t.current_team_id
FROM public.trainers t
WHERE t.id = b.trainer_id
  AND b.team_id IS NULL
  AND t.current_team_id IS NOT NULL;

ALTER TABLE public.buildings
  ALTER COLUMN trainer_id DROP NOT NULL;

ALTER TABLE public.buildings
  DROP CONSTRAINT IF EXISTS buildings_trainer_id_building_type_key;

CREATE UNIQUE INDEX IF NOT EXISTS buildings_team_type_unique
  ON public.buildings(team_id, building_type)
  WHERE team_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_buildings_team_id
  ON public.buildings(team_id);

DROP POLICY IF EXISTS "own buildings" ON public.buildings;
CREATE POLICY "manage current club buildings" ON public.buildings FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.trainers t
      WHERE t.user_id = auth.uid()
        AND (t.id = buildings.trainer_id OR t.current_team_id = buildings.team_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.trainers t
      WHERE t.user_id = auth.uid()
        AND (t.id = buildings.trainer_id OR t.current_team_id = buildings.team_id)
    )
  );

