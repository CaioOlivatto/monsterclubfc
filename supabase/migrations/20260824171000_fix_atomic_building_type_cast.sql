DO $$
DECLARE
  v_definition text;
  v_fixed_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.start_building_upgrade_atomic(text,bigint,timestamptz,text)'::regprocedure
  )
  INTO v_definition;

  v_fixed_definition := replace(
    v_definition,
    'building_type = p_type',
    'building_type::text = p_type'
  );

  IF v_fixed_definition = v_definition THEN
    RAISE EXCEPTION 'Atomic building function did not contain the expected enum comparison';
  END IF;

  EXECUTE v_fixed_definition;
END;
$$;
