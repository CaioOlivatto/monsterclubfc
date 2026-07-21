// Catálogo e helpers de edifícios da academia — Tabela de Balanceamento §5.

export type BuildingType = "ct_treino" | "ct_elemental" | "estadio" | "centro_medico";

export interface BuildingSpec {
  type: BuildingType;
  name: string;
  description: string;
  effectByLevel: (level: number) => string;
  cost: (nextLevel: number) => number;   // 1..5
  duration: (nextLevel: number) => number; // segundos
}

export const MAX_LEVEL = 5;

// Custo em $$ para chegar ao nível-alvo (1..5). O jogo já começa com CT Treino, Estádio
// e Centro Médico em nível 1 (portanto, upgrade a partir do nível 2).
const COSTS: Record<BuildingType, number[]> = {
  ct_treino:     [0,       120_000,   350_000,   900_000,   2_200_000],
  ct_elemental:  [80_000,  250_000,   650_000,   1_500_000, 3_200_000],
  estadio:       [0,       200_000,   600_000,   1_600_000, 3_800_000],
  centro_medico: [60_000,  180_000,   500_000,   1_300_000, 3_000_000],
};

// Duração em segundos para chegar ao nível-alvo (1..5)
const H = 3600;
const D = 24 * H;
const DURATIONS: Record<BuildingType, number[]> = {
  ct_treino:     [0,      8 * H,  20 * H, 2 * D, 4 * D],
  ct_elemental:  [6 * H,  16 * H, 1.5 * D, 3 * D, 5 * D],
  estadio:       [0,      12 * H, 1 * D,  2.5 * D, 5 * D],
  centro_medico: [5 * H,  14 * H, 1.5 * D, 3 * D, 5 * D],
};

// Estádio: capacidade por nível (1..5)
const STADIUM_CAPACITY = [8_000, 15_000, 25_000, 40_000, 60_000];

// CT Elemental: teto de afinidade treinável por nível (1..5)
const AFFINITY_CAP_BY_LEVEL = [5, 8, 11, 13, 15];

export const BUILDINGS: Record<BuildingType, BuildingSpec> = {
  ct_treino: {
    type: "ct_treino",
    name: "Centro de Treinamento",
    description: "Acelera o ganho de XP das criaturas (treinos e partidas).",
    effectByLevel: (l) => (l === 0 ? "Sem efeito" : `+${l * 5}% XP`),
    cost: (n) => COSTS.ct_treino[n - 1],
    duration: (n) => DURATIONS.ct_treino[n - 1],
  },
  ct_elemental: {
    type: "ct_elemental",
    name: "CT Elemental",
    description: "Libera e acelera o treino de afinidade elemental.",
    effectByLevel: (l) =>
      l === 0 ? "Não construído" : `Afinidade até +${AFFINITY_CAP_BY_LEVEL[l - 1]}%`,
    cost: (n) => COSTS.ct_elemental[n - 1],
    duration: (n) => DURATIONS.ct_elemental[n - 1],
  },
  estadio: {
    type: "estadio",
    name: "Estádio",
    description: "Aumenta a capacidade e a bilheteria das partidas em casa.",
    effectByLevel: (l) =>
      l === 0
        ? "—"
        : `Capacidade ${STADIUM_CAPACITY[l - 1].toLocaleString("pt-BR")} torcedores`,
    cost: (n) => COSTS.estadio[n - 1],
    duration: (n) => DURATIONS.estadio[n - 1],
  },
  centro_medico: {
    type: "centro_medico",
    name: "Centro Médico",
    description: "Acelera a recuperação de energia e o tratamento de lesões.",
    effectByLevel: (l) => (l === 0 ? "Sem efeito" : `+${l * 25}% recuperação`),
    cost: (n) => COSTS.centro_medico[n - 1],
    duration: (n) => DURATIONS.centro_medico[n - 1],
  },
};

export const BUILDING_TYPES: BuildingType[] = [
  "ct_treino", "ct_elemental", "estadio", "centro_medico",
];

/** Capacidade do estádio (torcedores). Nível 0 = sem estádio construído. */
export function stadiumCapacity(estadioLevel: number): number {
  if (estadioLevel <= 0) return 0;
  return STADIUM_CAPACITY[Math.min(estadioLevel, STADIUM_CAPACITY.length) - 1];
}

/** Bônus de XP em treinos/partidas: +5% por nível do CT de Treinamento. */
export function trainingXpMultiplier(ctTreinoLevel: number): number {
  return 1 + ctTreinoLevel * 0.05;
}

/** Teto de afinidade elemental treinável (%). Nível 0 = não treina afinidade. */
export function affinityCap(ctElementalLevel: number): number {
  if (ctElementalLevel <= 0) return 0;
  return AFFINITY_CAP_BY_LEVEL[Math.min(ctElementalLevel, AFFINITY_CAP_BY_LEVEL.length) - 1];
}
