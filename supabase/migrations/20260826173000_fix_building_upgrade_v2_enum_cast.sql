-- V2 recebe p_type como text, enquanto buildings.building_type é enum.
-- Mantém toda a função existente (autorização, RLS e idempotência) e corrige
-- apenas a comparação que bloqueava CT, estádio e centro médico.
DO $$
DECLARE
  v_definition text;
  v_fixed_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.start_building_upgrade_atomic_v2(text,bigint,integer,text)'::regprocedure
  )
  INTO v_definition;

  v_fixed_definition := replace(
    v_definition,
    'building_type=p_type FOR UPDATE;',
    'building_type::text=p_type FOR UPDATE;'
  );

  IF v_fixed_definition = v_definition THEN
    RAISE EXCEPTION 'Building upgrade V2 did not contain the expected enum comparison';
  END IF;

  EXECUTE v_fixed_definition;
END;
$$;
