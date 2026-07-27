// Bônus de velocidade de treinamento por ELEMENTO NATIVO da criatura.
// O elemento não muda custo de XP (100) nem de energia (20) — só o TEMPO da sessão.
// Base: 4h. Atributo principal do elemento: −25% (3h). Secundário: −5% ou −15%.

export const BASE_ATTR_TRAINING_DURATION_MS = 4 * 60 * 60 * 1000;

export type ElementKey = "fogo" | "agua" | "terra" | "ar" | "gelo";

/** Reduções de tempo (fração) por elemento → atributo. Jogadores de linha. */
const LINE_BONUS: Record<ElementKey, Record<string, number>> = {
  fogo:  { atacar: 0.25, passar: 0.05 },
  agua:  { defender: 0.25, forca: 0.05 },
  ar:    { pique: 0.25, tecnica: 0.05 },
  terra: { forca: 0.25, tecnica: 0.15 },
  gelo:  { passar: 0.25, tecnica: 0.15 },
};

/** Reduções de tempo (fração) por elemento → atributo. Goleiros. */
const GK_BONUS: Record<ElementKey, Record<string, number>> = {
  fogo:  { elasticidade: 0.25, concentracao: 0.05 },
  agua:  { maos: 0.25, elasticidade: 0.05 },
  ar:    { concentracao: 0.25, maos: 0.05 },
  terra: { maos: 0.25, concentracao: 0.15 },
  gelo:  { elasticidade: 0.25, maos: 0.15 },
};

/** Redução de tempo (0..1) do elemento nativo para o atributo escolhido. */
export function trainingTimeReduction(
  element: string | null | undefined,
  attrKey: string,
  isGoalkeeper: boolean,
): number {
  if (!element) return 0;
  const table = (isGoalkeeper ? GK_BONUS : LINE_BONUS)[element as ElementKey];
  return table?.[attrKey] ?? 0;
}

/** Duração final da sessão de treino, já com o bônus elemental aplicado. */
export function attrTrainingDurationMs(
  element: string | null | undefined,
  attrKey: string,
  isGoalkeeper: boolean,
): number {
  const r = trainingTimeReduction(element, attrKey, isGoalkeeper);
  return Math.round(BASE_ATTR_TRAINING_DURATION_MS * (1 - r));
}

/** Rótulo curto de duração, ex.: "3h", "3h48". */
export function formatTrainingDuration(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}
