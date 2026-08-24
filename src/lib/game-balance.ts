import type { Division } from "./match-engine.server";

/** Faixa desejada para o overall médio do melhor XI de cada divisão. */
export const DIVISION_XI_TARGET: Record<Division, readonly [number, number]> = {
  bronze: [36, 48],
  prata: [47, 59],
  ouro: [58, 70],
  diamante: [67, 80],
  lendaria: [76, 90],
};

/** Quanto da escalação ideal um treinador CPU consegue extrair. */
export const DIVISION_LINEUP_EFFICIENCY: Record<Division, readonly [number, number]> = {
  bronze: [0.75, 0.85],
  prata: [0.82, 0.88],
  ouro: [0.88, 0.94],
  diamante: [0.94, 0.98],
  lendaria: [0.98, 1],
};

/** Inteligência para aplicar a personalidade tática sem tornar a CPU perfeita cedo. */
export const DIVISION_TACTICAL_INTELLIGENCE: Record<Division, number> = {
  bronze: 0.3,
  prata: 0.5,
  ouro: 0.7,
  diamante: 0.85,
  lendaria: 1,
};

export function divisionTargetMidpoint(division: Division): number {
  const [minimum, maximum] = DIVISION_XI_TARGET[division];
  return Math.round((minimum + maximum) / 2);
}
