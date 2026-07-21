// Catálogo e helpers de edifícios da academia.

export type BuildingType = "ct_treino" | "ct_elemental" | "estadio" | "centro_medico";

export interface BuildingSpec {
  type: BuildingType;
  name: string;
  description: string;
  effectByLevel: (level: number) => string;
  // custo em $ para subir do nível atual para o próximo (1..5)
  cost: (nextLevel: number) => number;
  // duração da obra em segundos
  duration: (nextLevel: number) => number;
}

export const MAX_LEVEL = 5;

const COSTS: Record<BuildingType, number[]> = {
  ct_treino:      [20000, 60000, 150000, 350000, 800000],
  ct_elemental:   [25000, 70000, 170000, 400000, 900000],
  estadio:        [40000, 100000, 250000, 550000, 1_200_000],
  centro_medico:  [15000, 50000, 130000, 320000, 750000],
};

// Duração em segundos por nível-alvo (1..5). Mantido curto para gameplay ágil.
const DURATIONS: number[] = [
  2 * 60,        // 2 min
  5 * 60,        // 5 min
  15 * 60,       // 15 min
  60 * 60,       // 1 h
  4 * 60 * 60,   // 4 h
];

export const BUILDINGS: Record<BuildingType, BuildingSpec> = {
  ct_treino: {
    type: "ct_treino",
    name: "Centro de Treinamento",
    description: "Melhora o ganho de XP nos treinos das criaturas.",
    effectByLevel: (l) => (l === 0 ? "Sem efeito" : `+${l * 10}% XP em treinos`),
    cost: (n) => COSTS.ct_treino[n - 1],
    duration: (n) => DURATIONS[n - 1],
  },
  ct_elemental: {
    type: "ct_elemental",
    name: "CT Elemental",
    description: "Acelera o treino de afinidade elemental.",
    effectByLevel: (l) => (l === 0 ? "Sem efeito" : `+${l * 15}% velocidade de afinidade`),
    cost: (n) => COSTS.ct_elemental[n - 1],
    duration: (n) => DURATIONS[n - 1],
  },
  estadio: {
    type: "estadio",
    name: "Estádio",
    description: "Aumenta a renda de bilheteria nas partidas em casa da liga.",
    effectByLevel: (l) => (l === 0 ? "Bilheteria padrão" : `+$${(l * 4000).toLocaleString("pt-BR")} por jogo em casa`),
    cost: (n) => COSTS.estadio[n - 1],
    duration: (n) => DURATIONS[n - 1],
  },
  centro_medico: {
    type: "centro_medico",
    name: "Centro Médico",
    description: "Reduz o tempo de recuperação de criaturas lesionadas.",
    effectByLevel: (l) => (l === 0 ? "Sem efeito" : `-${l * 10}% tempo de lesão`),
    cost: (n) => COSTS.centro_medico[n - 1],
    duration: (n) => DURATIONS[n - 1],
  },
};

export const BUILDING_TYPES: BuildingType[] = [
  "ct_treino", "ct_elemental", "estadio", "centro_medico",
];

/** Renda de bilheteria por partida da liga em casa. */
export function stadiumIncome(estadioLevel: number): number {
  return estadioLevel * 4000;
}

/** Bônus de XP em treinos (fração). */
export function trainingXpMultiplier(ctTreinoLevel: number): number {
  return 1 + ctTreinoLevel * 0.1;
}
