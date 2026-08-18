CREATE TABLE IF NOT EXISTS public.game_telemetry_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  trainer_id uuid REFERENCES public.trainers(id) ON DELETE SET NULL,
  event_name text NOT NULL CHECK(length(event_name) BETWEEN 2 AND 64),
  route text CHECK(length(route)<=160),
  duration_ms integer CHECK(duration_ms IS NULL OR duration_ms BETWEEN 0 AND 120000),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.game_telemetry_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.game_telemetry_events FROM anon,authenticated;
CREATE INDEX IF NOT EXISTS game_telemetry_event_time_idx ON public.game_telemetry_events(event_name,created_at DESC);
CREATE INDEX IF NOT EXISTS game_telemetry_user_time_idx ON public.game_telemetry_events(user_id,created_at DESC);

CREATE OR REPLACE FUNCTION public.record_game_telemetry(p_event text,p_route text DEFAULT NULL,p_duration_ms integer DEFAULT NULL,p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); tid uuid;
BEGIN
  IF uid IS NULL THEN RETURN; END IF;
  IF p_event NOT IN ('page_view','slow_page','onboarding_started','onboarding_completed','club_viewed','club_activated','arena_played','purchase_intent','session_started') THEN RETURN; END IF;
  IF (SELECT count(*) FROM game_telemetry_events WHERE user_id=uid AND created_at>=now()-interval '1 day')>=200 THEN RETURN; END IF;
  SELECT id INTO tid FROM trainers WHERE user_id=uid;
  INSERT INTO game_telemetry_events(user_id,trainer_id,event_name,route,duration_ms,metadata)
  VALUES(uid,tid,p_event,left(p_route,160),least(120000,greatest(0,p_duration_ms)),coalesce(p_metadata,'{}'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.record_game_telemetry(text,text,integer,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_game_telemetry(text,text,integer,jsonb) TO authenticated;
