
CREATE OR REPLACE FUNCTION public.apply_end_of_season_block(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_trainer_id uuid := (payload->>'trainer_id')::uuid;
  v_next_season integer := (payload->>'next_season')::integer;
  v_expire_offers boolean := COALESCE((payload->>'expire_old_offers')::boolean, false);
  v_trainer_update jsonb := payload->'trainer_update';
  v_career_events jsonb := COALESCE(payload->'career_events', '[]'::jsonb);
  v_qualifications jsonb := COALESCE(payload->'qualifications', '[]'::jsonb);
  v_job_offers jsonb := COALESCE(payload->'job_offers', '[]'::jsonb);
  v_messages jsonb := COALESCE(payload->'messages', '[]'::jsonb);
  v_owner uuid;
  v_inserted_offers integer := 0;
  v_inserted_quals integer := 0;
  v_inserted_events integer := 0;
  v_inserted_messages integer := 0;
BEGIN
  IF v_trainer_id IS NULL THEN
    RAISE EXCEPTION 'trainer_id is required';
  END IF;

  -- Ownership guard (defense in depth on top of RLS)
  SELECT user_id INTO v_owner FROM public.trainers WHERE id = v_trainer_id;
  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'not authorized for trainer %', v_trainer_id;
  END IF;

  -- 1) trainer_career events
  IF jsonb_array_length(v_career_events) > 0 THEN
    INSERT INTO public.trainer_career (
      trainer_id, team_id, team_name, division, season_start, season_end,
      final_position, event, title
    )
    SELECT
      (e->>'trainer_id')::uuid,
      NULLIF(e->>'team_id','')::uuid,
      e->>'team_name',
      (e->>'division')::division_type,
      (e->>'season_start')::integer,
      NULLIF(e->>'season_end','')::integer,
      NULLIF(e->>'final_position','')::integer,
      e->>'event',
      e->>'title'
    FROM jsonb_array_elements(v_career_events) AS e;
    GET DIAGNOSTICS v_inserted_events = ROW_COUNT;
  END IF;

  -- 2) qualifications: replace for next_season
  DELETE FROM public.qualifications
   WHERE trainer_id = v_trainer_id AND season_number = v_next_season;

  IF jsonb_array_length(v_qualifications) > 0 THEN
    INSERT INTO public.qualifications (
      trainer_id, season_number, qualifies_for, source_division, source_position
    )
    SELECT
      (q->>'trainer_id')::uuid,
      (q->>'season_number')::integer,
      q->>'qualifies_for',
      (q->>'source_division')::division_type,
      (q->>'source_position')::integer
    FROM jsonb_array_elements(v_qualifications) AS q;
    GET DIAGNOSTICS v_inserted_quals = ROW_COUNT;
  END IF;

  -- 3) trainer update
  IF v_trainer_update IS NOT NULL AND v_trainer_update <> 'null'::jsonb THEN
    UPDATE public.trainers SET
      last_final_position = COALESCE((v_trainer_update->>'last_final_position')::integer, last_final_position),
      consecutive_bad_seasons = COALESCE((v_trainer_update->>'consecutive_bad_seasons')::integer, consecutive_bad_seasons),
      seasons_at_current_club = COALESCE((v_trainer_update->>'seasons_at_current_club')::integer, seasons_at_current_club),
      status = COALESCE(v_trainer_update->>'status', status),
      pending_transition = COALESCE((v_trainer_update->>'pending_transition')::boolean, pending_transition)
    WHERE id = v_trainer_id;
  END IF;

  -- 4) expire existing pending job_offers
  IF v_expire_offers THEN
    UPDATE public.job_offers
       SET status = 'expired'
     WHERE trainer_id = v_trainer_id AND status = 'pending';
  END IF;

  -- 5) insert new job_offers
  IF jsonb_array_length(v_job_offers) > 0 THEN
    INSERT INTO public.job_offers (
      trainer_id, team_id, team_name, division, season_offered,
      reason, status, signing_bonus, message
    )
    SELECT
      (o->>'trainer_id')::uuid,
      (o->>'team_id')::uuid,
      o->>'team_name',
      o->>'division',
      (o->>'season_offered')::integer,
      (o->>'reason')::job_offer_reason,
      COALESCE((o->>'status')::job_offer_status, 'pending'::job_offer_status),
      COALESCE((o->>'signing_bonus')::integer, 0),
      o->>'message'
    FROM jsonb_array_elements(v_job_offers) AS o;
    GET DIAGNOSTICS v_inserted_offers = ROW_COUNT;
  END IF;

  -- 6) messages
  IF jsonb_array_length(v_messages) > 0 THEN
    INSERT INTO public.messages (trainer_id, kind, title, body)
    SELECT
      (m->>'trainer_id')::uuid,
      m->>'kind',
      m->>'title',
      COALESCE(m->>'body','')
    FROM jsonb_array_elements(v_messages) AS m;
    GET DIAGNOSTICS v_inserted_messages = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'career_events', v_inserted_events,
    'qualifications', v_inserted_quals,
    'job_offers', v_inserted_offers,
    'messages', v_inserted_messages
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_end_of_season_block(jsonb) TO authenticated;
