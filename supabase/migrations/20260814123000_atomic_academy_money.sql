CREATE OR REPLACE FUNCTION public.adjust_academy_money(
  p_trainer_id uuid,
  p_delta bigint
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_money bigint;
BEGIN
  UPDATE public.academies
     SET money = money + p_delta,
         updated_at = now()
   WHERE trainer_id = p_trainer_id
     AND money + p_delta >= 0
  RETURNING money INTO v_money;

  IF v_money IS NULL THEN
    RAISE EXCEPTION 'Saldo insuficiente ou academia não encontrada.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_money;
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_academy_money(uuid, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.adjust_academy_money(uuid, bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.adjust_academy_money(uuid, bigint) TO authenticated;
