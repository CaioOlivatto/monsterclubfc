DROP POLICY IF EXISTS "world_academies public read" ON public.world_academies;
REVOKE SELECT ON public.world_academies FROM anon;
CREATE POLICY "world_academies authenticated read"
  ON public.world_academies FOR SELECT
  TO authenticated
  USING (true);