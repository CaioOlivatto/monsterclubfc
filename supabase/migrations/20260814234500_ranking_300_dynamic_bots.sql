CREATE OR REPLACE FUNCTION public.prune_world_ranking_bots()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_real_count integer;
  v_keep_bots integer;
  v_deleted integer;
BEGIN
  SELECT count(*) INTO v_real_count
  FROM public.world_academies
  WHERE is_player = true;

  v_keep_bots := greatest(0, 300 - v_real_count);

  WITH ranked_bots AS (
    SELECT id,
      row_number() OVER (
        ORDER BY level DESC, xp DESC, wins DESC, patrimony DESC, id
      ) AS position
    FROM public.world_academies
    WHERE is_player = false
  )
  DELETE FROM public.world_academies wa
  USING ranked_bots rb
  WHERE wa.id = rb.id
    AND rb.position > v_keep_bots;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_world_ranking_bots() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_world_ranking_bots() TO authenticated, service_role;

-- Converte imediatamente o ranking legado de 1.200 entradas para a nova base.
SELECT public.prune_world_ranking_bots();
