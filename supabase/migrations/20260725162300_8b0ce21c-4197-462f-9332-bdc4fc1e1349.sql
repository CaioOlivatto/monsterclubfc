ALTER TABLE public.creatures ADD COLUMN IF NOT EXISTS morale_session_completes_at timestamptz;
ALTER TABLE public.academies ADD COLUMN IF NOT EXISTS morale_meeting_completes_at timestamptz;
ALTER TABLE public.trainers ADD COLUMN IF NOT EXISTS losing_streak integer NOT NULL DEFAULT 0;