-- Allow the authenticated RPC to perform its atomic transaction without
-- granting direct INSERT/UPDATE privileges on protected economy tables.
ALTER FUNCTION public.start_building_upgrade_atomic(text, bigint, timestamptz, text)
  SECURITY DEFINER;

ALTER FUNCTION public.start_building_upgrade_atomic(text, bigint, timestamptz, text)
  SET search_path = '';

REVOKE ALL ON FUNCTION public.start_building_upgrade_atomic(text, bigint, timestamptz, text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.start_building_upgrade_atomic(text, bigint, timestamptz, text)
  TO authenticated;
