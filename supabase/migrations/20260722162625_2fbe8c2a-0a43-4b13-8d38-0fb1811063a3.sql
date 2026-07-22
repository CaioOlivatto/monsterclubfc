
ALTER TABLE public.trainers
  ADD COLUMN IF NOT EXISTS season_xp_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pending_level_ups integer NOT NULL DEFAULT 0;

ALTER TABLE public.world_academies
  ADD COLUMN IF NOT EXISTS xp bigint NOT NULL DEFAULT 0;

-- Backfill: xp acumulado = soma de 350*i para i=1..level
UPDATE public.world_academies
SET xp = (350 * (level * (level + 1) / 2))::bigint
WHERE xp = 0 AND level > 0;

-- Backfill treinadores existentes
UPDATE public.trainers
SET xp = GREATEST(xp, (350 * (level * (level + 1) / 2))::integer)
WHERE level > 0;
