// Catálogo da Loja de Gemas e Itens (GDD §8 e §11).

export type ItemKey = "potion_individual" | "potion_collective" | "vital_crystal";

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
};

export const ITEM_KEYS: ItemKey[] = [
  "potion_individual",
  "potion_collective",
  "vital_crystal",
];

export interface GemPackage {
  id: string;
  name: string;
  gems: number;
  bonus: number; // gemas extras
  price: string; // exibição — MVP sem gateway real
}

export const GEM_PACKAGES: GemPackage[] = [
  { id: "starter",  name: "Pacote Inicial",  gems: 50,   bonus: 0,   price: "R$ 4,90" },
  { id: "bronze",   name: "Pacote Bronze",   gems: 120,  bonus: 10,  price: "R$ 9,90" },
  { id: "prata",    name: "Pacote Prata",    gems: 300,  bonus: 40,  price: "R$ 19,90" },
  { id: "ouro",     name: "Pacote Ouro",     gems: 700,  bonus: 120, price: "R$ 39,90" },
  { id: "diamante", name: "Pacote Diamante", gems: 1600, bonus: 400, price: "R$ 79,90" },
];

// Upgrades pagos em gemas
export const EXTRA_BUILDER_COST = 80; // gemas por construtor extra (máx 3 total)
export const MAX_BUILDERS = 3;

export const ROSTER_EXPANSIONS: Array<{ from: number; to: number; gems: number }> = [
  { from: 24, to: 30, gems: 60 },
  { from: 30, to: 36, gems: 120 },
];
