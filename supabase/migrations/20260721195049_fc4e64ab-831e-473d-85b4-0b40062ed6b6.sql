
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS color text,
  ADD COLUMN IF NOT EXISTS emblem text,
  ADD COLUMN IF NOT EXISTS dominant_element element_type,
  ADD COLUMN IF NOT EXISTS style text,
  ADD COLUMN IF NOT EXISTS starter_key text;
