// Gerador de listagens de mercado (server-only) — Tabela de Balanceamento §6.
// Rotaciona uma vez por temporada; 24 criaturas por lista.
// Preço base por estrelas (raridade cresce forte).

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

// Preço base por meia-estrela (índice 1..10 → 0,5★..5★)
const STAR_VALUE = [
  15_000,   //  0,5★
  35_000,   //  1,0★
  70_000,   //  1,5★
  130_000,  //  2,0★
  240_000,  //  2,5★
  430_000,  //  3,0★
  780_000,  //  3,5★
  1_400_000,// 4,0★
  2_500_000,// 4,5★
  4_500_000,// 5,0★
];

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

// Sorteia a "faixa" de meia-estrela do jogador (1..10) com distribuição:
// 60% 0,5–1,5★ (1..3) · 30% 2–2,5★ (4..5) · 8% 3–3,5★ (6..7) · 2% 4★+ (8..10)
function rollHalfStarBand(rng: () => number): number {
  const r = rng();
  if (r < 0.60) return 1 + Math.floor(rng() * 3);       // 1..3
  if (r < 0.90) return 4 + Math.floor(rng() * 2);       // 4..5
  if (r < 0.98) return 6 + Math.floor(rng() * 2);       // 6..7
  return 8 + Math.floor(rng() * 3);                     // 8..10
}

// Atributo em pontos (0..100), alinhado à faixa de estrelas do jogador.
function attrFromBand(rng: () => number, band: number): number {
  const center = band * 10;                             // 10..100
  const jitter = Math.round((rng() - 0.5) * 20);        // ±10
  return Math.max(10, Math.min(100, center + jitter));
}

const SELLERS = [
  "Academia Aurora", "Casa dos Elementais", "Cavernas de Ignis",
  "Ilha Nébula", "Guilda do Vento", "Torre Cristalina",
  "Oráculo de Fenris", "Colina dos Golems",
];

export interface MarketListing {
  id: string;
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
  half_star_band: number; // 1..10 (raridade dominante)
}

function generateOne(rng: () => number): MarketListing {
  const band = rollHalfStarBand(rng);
  const element = pick(rng, ELEMENTS);
  const position = pick(rng, POSITIONS);
  const name = pick(rng, PREFIXES) + pick(rng, SUFFIXES);

  const attack = attrFromBand(rng, band);
  const defense = attrFromBand(rng, band);
  const goalkeeper =
    position === "Goleiro"
      ? Math.max(attrFromBand(rng, band), band * 10)
      : attrFromBand(rng, band);
  const physical = attrFromBand(rng, band);
  const strength = attrFromBand(rng, band);
  const overall = Math.round(
    (attack + defense + goalkeeper + physical + strength) / 5,
  );

  const affinities = { aff_fogo: 0, aff_agua: 0, aff_terra: 0, aff_ar: 0, aff_gelo: 0 };
  const affKey = `aff_${element}` as keyof typeof affinities;
  affinities[affKey] = Math.min(15, Math.max(1, Math.round(band * 1.2 + rng() * 3)));

  // mod_elemento = 1.0 no MVP
  const market_value = STAR_VALUE[band - 1];
  // Preço listado: 90%–130% do valor de mercado
  const priceMultiplier = 0.9 + rng() * 0.4;
  const price = Math.max(
    1_000,
    Math.round((market_value * priceMultiplier) / 1_000) * 1_000,
  );

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
    half_star_band: band,
  };
}

/**
 * Gera N listagens determinísticas para o treinador na temporada `seasonNumber`.
 * A lista inteira troca ao início de cada nova temporada.
 */
export function generateMarketListings(
  trainerId: string,
  seasonNumber: number,
  count = 24,
): MarketListing[] {
  const seed = hashString(`${trainerId}:season:${seasonNumber}`);
  const rng = mulberry32(seed);
  const listings: MarketListing[] = [];
  for (let i = 0; i < count; i++) listings.push(generateOne(rng));
  return listings;
}

export function findListing(
  trainerId: string,
  seasonNumber: number,
  listingId: string,
): MarketListing | null {
  return (
    generateMarketListings(trainerId, seasonNumber).find((l) => l.id === listingId) ??
    null
  );
}
