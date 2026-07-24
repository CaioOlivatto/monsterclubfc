// Catálogo da Loja de Gemas e Itens — Tabela de Balanceamento §3.3.

export type ItemKey =
  | "potion_individual"
  | "potion_collective"
  | "vital_crystal"
  | "morale_individual"
  | "morale_collective"
  | "xp_burst_5"
  | "xp_burst_10"
  | "xp_burst_15";

export interface ItemSpec {
  key: ItemKey;
  name: string;
  description: string;
  moneyPrice: number | null;
  gemPrice: number | null;
}

export const ITEMS: Record<ItemKey, ItemSpec> = {
  potion_individual: {
    key: "potion_individual",
    name: "Poção Individual",
    description: "Restaura 100% da energia de 1 criatura.",
    moneyPrice: 8_000,
    gemPrice: 3,
  },
  potion_collective: {
    key: "potion_collective",
    name: "Poção Coletiva",
    description: "Restaura +15% de energia em todo o elenco.",
    moneyPrice: 40_000,
    gemPrice: 12,
  },
  vital_crystal: {
    key: "vital_crystal",
    name: "Cristal Vital",
    description: "Aumenta a energia do elenco em +25% (até 100%).",
    moneyPrice: 80_000,
    gemPrice: 20,
  },
  morale_individual: {
    key: "morale_individual",
    name: "Ânimo Individual",
    description: "Aumenta o moral de 1 criatura (+25 nominal, com ganhos decrescentes).",
    moneyPrice: 10_000,
    gemPrice: 4,
  },
  morale_collective: {
    key: "morale_collective",
    name: "Ânimo Coletivo",
    description: "Aumenta o moral de todo o elenco (+15 nominal, com ganhos decrescentes).",
    moneyPrice: 45_000,
    gemPrice: 14,
  },
  xp_burst_5: {
    key: "xp_burst_5",
    name: "Impulso de XP +5% (1 temporada)",
    description: "Aumenta o XP ganho em +5% pelas próximas 26 partidas de liga.",
    moneyPrice: null,
    gemPrice: 80,
  },
  xp_burst_10: {
    key: "xp_burst_10",
    name: "Impulso de XP +10% (1 temporada)",
    description: "Aumenta o XP ganho em +10% pelas próximas 26 partidas de liga.",
    moneyPrice: null,
    gemPrice: 150,
  },
  xp_burst_15: {
    key: "xp_burst_15",
    name: "Impulso de XP +15% (1 temporada)",
    description: "Aumenta o XP ganho em +15% pelas próximas 26 partidas de liga.",
    moneyPrice: null,
    gemPrice: 220,
  },
};

export const ITEM_KEYS: ItemKey[] = [
  "potion_individual",
  "potion_collective",
  "vital_crystal",
  "morale_individual",
  "morale_collective",
  "xp_burst_5",
  "xp_burst_10",
  "xp_burst_15",
];

export const MORALE_BOOST_INDIVIDUAL = 25;
export const MORALE_BOOST_COLLECTIVE = 15;

export const XP_BURST_MATCHES = 26;
export const XP_BURST_MULTIPLIER: Record<string, number> = {
  xp_burst_5: 1.05,
  xp_burst_10: 1.10,
  xp_burst_15: 1.15,
};

export interface GemPackage {
  id: string;
  name: string;
  gems: number;
  bonus: number;
  price: string;
}

// Pacotes conforme Tabela de Balanceamento §3.2.
export const GEM_PACKAGES: GemPackage[] = [
  { id: "punhado",  name: "Punhado",  gems: 100,  bonus: 0,   price: "R$ 9,90" },
  { id: "saco",     name: "Saco",     gems: 500,  bonus: 50,  price: "R$ 34,90" },
  { id: "bau",      name: "Baú",      gems: 1000, bonus: 200, price: "R$ 79,90" },
  { id: "cofre",    name: "Cofre",    gems: 2400, bonus: 400, price: "R$ 159,90" },
  { id: "tesouro",  name: "Tesouro",  gems: 5600, bonus: 600, price: "R$ 289,90" },
];

// Construtor extra (2º / 3º / 4º) e teto absoluto.
export const EXTRA_BUILDER_COSTS: number[] = [250, 600, 1200];
export const MAX_BUILDERS = 4;

export function extraBuilderCostFor(current: number): number | null {
  const idx = current - 1; // current=1 → próximo é o 2º (índice 0)
  return EXTRA_BUILDER_COSTS[idx] ?? null;
}

// Expansões de elenco em gemas.
export const ROSTER_EXPANSIONS: Array<{ from: number; to: number; gems: number }> = [
  { from: 26, to: 32, gems: 400 },
  { from: 32, to: 38, gems: 900 },
];

// Desbloqueio permanente de velocidade de partida.
export const SPEED_UNLOCK_COSTS: Record<"4x" | "instant", number> = {
  "4x": 300,
  instant: 800,
};

// Conversão de gemas em dinheiro do jogo (§3.4).
// Taxa BASE (referência 5ª Bronze). Multiplicador por divisão calibra o custo
// para "zerar" o teto de folha em ~R$46 em qualquer divisão.
export const GEM_TO_MONEY_RATE = 700; // $ por gema (base: Bronze)
export const GEM_EXCHANGE_PRESETS = [100, 500, 1000, 2000];

export type ExchangeDivision = "bronze" | "prata" | "ouro" | "diamante" | "lendaria";
export const DIVISION_EXCHANGE_MULT: Record<ExchangeDivision, number> = {
  bronze: 1.0,
  prata: 1.87,
  ouro: 3.13,
  diamante: 5.09,
  lendaria: 7.82,
};

export function gemExchangeRateFor(division: ExchangeDivision | null | undefined): number {
  const mult = DIVISION_EXCHANGE_MULT[(division ?? "bronze") as ExchangeDivision] ?? 1;
  return Math.round(GEM_TO_MONEY_RATE * mult);
}

