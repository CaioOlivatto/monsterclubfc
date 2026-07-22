
-- Marcar epítetos preposicionais (não sofrem concordância de gênero).
ALTER TABLE public.epithets ADD COLUMN IF NOT EXISTS is_prepositional boolean NOT NULL DEFAULT false;

UPDATE public.epithets SET is_prepositional = true
WHERE epithet ~* '^(da |do |das |dos |de )';

-- Uniq guard para evitar duplicidade (id-espécie/epíteto pode ficar).
CREATE INDEX IF NOT EXISTS idx_epithets_prep ON public.epithets(element) WHERE is_prepositional;
