// Catálogo e helpers de edifícios da academia — Tabela de Balanceamento §5.

export type BuildingType = "ct_treino" | "estadio" | "centro_medico";

export interface BuildingSpec {
  type: BuildingType;
  name: string;
  description: string;
  maxLevel: number;
  effectByLevel: (level: number) => string;
  cost: (nextLevel: number) => number;
  duration: (nextLevel: number) => number; // segundos
}

// Custo em $$ para chegar ao nível-alvo. O jogo já começa com CT Treino, Estádio
// e Centro Médico em nível 1 (portanto, upgrade a partir do nível 2).
const COSTS: Record<BuildingType, number[]> = {
  ct_treino:     [0,       120_000,   350_000,   900_000,   2_200_000],
  estadio:       [0,       200_000,   600_000,   1_600_000, 3_800_000, 7_500_000, 12_000_000, 20_000_000, 32_000_000, 50_000_000],
  centro_medico: [60_000,  180_000,   500_000,   1_300_000, 3_000_000],
};

// Duração em segundos para chegar ao nível-alvo (1..5)
const H = 3600;
const D = 24 * H;
const DURATIONS: Record<BuildingType, number[]> = {
  ct_treino:     [0,      8 * H,  20 * H, 2 * D, 4 * D],
  estadio:       [0,      12 * H, 1 * D,  2.5 * D, 5 * D, 7 * D, 10 * D, 14 * D, 20 * D, 30 * D],
  centro_medico: [5 * H,  14 * H, 1.5 * D, 3 * D, 5 * D],
};

// Estádio: capacidade e valorização do ingresso por nível (1..10).
const STADIUM_CAPACITY = [8_000, 12_000, 18_000, 25_000, 35_000, 45_000, 55_000, 65_000, 75_000, 90_000];
const STADIUM_REVENUE_MULTIPLIER = [1, 1, 1, 1, 1.03, 1.07, 1.12, 1.18, 1.25, 1.35];
const STADIUM_STAGES = [
  "Campo de bairro",
  "Arquibancada básica",
  "Iluminação esportiva",
  "Cadeiras cativas",
  "Vestiários e placar",
  "Arquibancadas ampliadas",
  "Setor VIP",
  "Arena coberta",
  "Estádio de elite",
  "Estádio profissional monumental",
];

export const BUILDINGS: Record<BuildingType, BuildingSpec> = {
  ct_treino: {
    type: "ct_treino",
    name: "Centro de Treinamento",
    description: "Acelera o ganho de XP das criaturas (treinos e partidas).",
    maxLevel: 5,
    effectByLevel: (l) => (l === 0 ? "Sem efeito" : `+${l * 5}% XP`),
    cost: (n) => COSTS.ct_treino[n - 1],
    duration: (n) => DURATIONS.ct_treino[n - 1],
  },
  estadio: {
    type: "estadio",
    name: "Estádio",
    description: "Aumenta a capacidade e a bilheteria das partidas em casa.",
    maxLevel: 10,
    effectByLevel: (l) =>
      l === 0
        ? "—"
        : `${STADIUM_STAGES[l - 1]} · ${STADIUM_CAPACITY[l - 1].toLocaleString("pt-BR")} torcedores${STADIUM_REVENUE_MULTIPLIER[l - 1] > 1 ? ` · +${Math.round((STADIUM_REVENUE_MULTIPLIER[l - 1] - 1) * 100)}% na bilheteria` : ""}`,
    cost: (n) => COSTS.estadio[n - 1],
    duration: (n) => DURATIONS.estadio[n - 1],
  },
  centro_medico: {
    type: "centro_medico",
    name: "Centro Médico",
    description: "Reduz a duração das lesões sofridas em partidas oficiais.",
    maxLevel: 5,
    effectByLevel: (l) => {
      const reduction = [0, 15, 25, 35, 45, 50][Math.max(0, Math.min(5, l))];
      return l === 0 ? "Sem efeito" : `-${reduction}% na duração das lesões`;
    },
    cost: (n) => COSTS.centro_medico[n - 1],
    duration: (n) => DURATIONS.centro_medico[n - 1],
  },
};

export const BUILDING_TYPES: BuildingType[] = [
  "ct_treino", "estadio", "centro_medico",
];

/** Capacidade do estádio (torcedores). Nível 0 = sem estádio construído. */
export function stadiumCapacity(estadioLevel: number): number {
  if (estadioLevel <= 0) return 0;
  return STADIUM_CAPACITY[Math.min(estadioLevel, STADIUM_CAPACITY.length) - 1];
}

/** Valorização de ingresso por conforto, iluminação e setores premium. */
export function stadiumRevenueMultiplier(estadioLevel: number): number {
  if (estadioLevel <= 0) return 1;
  return STADIUM_REVENUE_MULTIPLIER[Math.min(estadioLevel, STADIUM_REVENUE_MULTIPLIER.length) - 1];
}

/** Bônus de XP em treinos/partidas: +5% por nível do CT de Treinamento. */
export function trainingXpMultiplier(ctTreinoLevel: number): number {
  return 1 + ctTreinoLevel * 0.05;
}
