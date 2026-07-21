// Gerador de listagens de mercado (server-only)
// Rotaciona uma vez por dia por treinador via seed determinística.

const ELEMENTS = ["fogo", "agua", "terra", "ar", "gelo"] as const;
export type MarketElement = (typeof ELEMENTS)[number];

const POSITIONS = ["Goleiro", "Zagueiro", "Meio-campo", "Atacante"] as const;

const PREFIXES = [
  "Vulc", "Aqua", "Petra", "Aero", "Cryo", "Igni", "Hydro", "Terra",
  "Ventus", "Glacia", "Pyro", "Nix", "Silva", "Nimbo", "Frost", "Ember",
  "Rio", "Monte", "Aura", "Neva", "Fulg", "Onda", "Rocha", "Brisa",
  "Draco", "Grifo", "Salaman", "Ondino", "Golem", "Sylph",
];
const SUFFIXES = [
  "ron", "lith", "dorix", "vent", "frim", "tar", "mir", "zeph",
  "gorn", "dus", "phus", "tos", "quir", "nel", "dax", "ram",
  "kur", "phyx", "tan", "vor", "sol", "nix", "mel", "gar",
];

// PRNG determinística (mulberry32)
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

// Escala 0-100 em passos de 10 (meia-estrela)
function starAttr(rng: () => number, minTier: number, maxTier: number): number {
  // tier: 1 = 0.5★ ... 10 = 5★  → valor = tier*10
  const tier = Math.floor(rng() * (maxTier - minTier + 1)) + minTier;
  return tier * 10;
}

export interface MarketListing {
  id: string; // determinístico
  name: string;
  element: MarketElement;
  suggested_position: string;
  attack: number;
  defense: number;
  goalkeeper: number;
  physical: number;
  strength: number;
  aff_fogo: number;
  aff_agua: number;
  aff_terra: number;
  aff_ar: number;
  aff_gelo: number;
  overall: number;
  energy: number;
  market_value: number;
  price: number;
  seller: string;
}

const SELLERS = [
  "Academia Aurora", "Casa dos Elementais", "Cavernas de Ignis",
  "Ilha Nébula", "Guilda do Vento", "Torre Cristalina",
  "Oráculo de Fenris", "Colina dos Golems",
];

function generateOne(rng: () => number, tier: "low" | "mid" | "high"): MarketListing {
  const range = tier === "low" ? [1, 3] : tier === "mid" ? [3, 6] : [5, 9];
  const [mn, mx] = range;

  const element = pick(rng, ELEMENTS);
  const position = pick(rng, POSITIONS);
  const name = pick(rng, PREFIXES) + pick(rng, SUFFIXES);

  const attack = starAttr(rng, mn, mx);
  const defense = starAttr(rng, mn, mx);
  const goalkeeper = position === "Goleiro" ? Math.max(starAttr(rng, mn, mx), 40) : starAttr(rng, mn, mx);
  const physical = starAttr(rng, mn, mx);
  const strength = starAttr(rng, mn, mx);
  const overall = Math.round((attack + defense + goalkeeper + physical + strength) / 5);

  // Afinidade elemental treinada — algumas criaturas do mercado já vêm com afinidade
  const affinities = { aff_fogo: 0, aff_agua: 0, aff_terra: 0, aff_ar: 0, aff_gelo: 0 };
  const affKey = `aff_${element}` as keyof typeof affinities;
  affinities[affKey] = starAttr(rng, 1, Math.max(2, mx - 2));

  const market_value = overall * 900;
  // Preço 90%-140% do valor de mercado
  const priceMultiplier = 0.9 + rng() * 0.5;
  const price = Math.round(market_value * priceMultiplier / 100) * 100;

  const idSeed = Math.floor(rng() * 1e9).toString(16);

  return {
    id: `market_${idSeed}`,
    name,
    element,
    suggested_position: position,
    attack,
    defense,
    goalkeeper,
    physical,
    strength,
    ...affinities,
    overall,
    energy: 100,
    market_value,
    price,
    seller: pick(rng, SELLERS),
  };
}

/**
 * Gera N listagens determinísticas para o treinador na "janela" atual.
 * A janela muda a cada 6 horas (4 rotações por dia).
 */
export function generateMarketListings(trainerId: string, count = 12): MarketListing[] {
  const windowMs = 24 * 60 * 60 * 1000;
  const windowIndex = Math.floor(Date.now() / windowMs);
  const seed = hashString(`${trainerId}:${windowIndex}`);
  const rng = mulberry32(seed);

  const listings: MarketListing[] = [];
  // Distribuição: 5 baixo, 5 médio, 2 alto
  const tiers: Array<"low" | "mid" | "high"> = [];
  for (let i = 0; i < count; i++) {
    tiers.push(i < 5 ? "low" : i < 10 ? "mid" : "high");
  }
  for (const t of tiers) listings.push(generateOne(rng, t));

  return listings;
}

export function nextRotationTimestamp(): number {
  const windowMs = 24 * 60 * 60 * 1000;
  return (Math.floor(Date.now() / windowMs) + 1) * windowMs;
}

export function findListing(trainerId: string, listingId: string): MarketListing | null {
  return generateMarketListings(trainerId).find((l) => l.id === listingId) ?? null;
}
