// Gerador de listagens de mercado (server-only) usando o Bestiário Mitológico.
// 24 criaturas por temporada; distribuição de raridade segue o perfil da divisão
// do treinador — Balanceamento §7.1/§7.2.

import {
  rollCreature,
  overallToStars,
  computeMarketValue,
  type Element,
  type SpeciesBase,
} from "./bestiary";
import type { LoadedBestiary } from "./bestiary.server";
import { rollBandForDivision, DIVISION_STAR_PROFILE, type Division } from "./economy";
import { GEM_ECONOMY_CONFIG, normalPlayerGemPrice, type MarketScoutPosition } from "./gem-economy";


export const STAR_VALUE = [
  15_000, 35_000, 70_000, 130_000, 240_000,
  430_000, 780_000, 2_400_000, 5_500_000, 12_000_000,
];

/** Valor de mercado canônico por overall (Tabela de Balanceamento §9.1). */
export function marketValueForOverall(overall: number, age = 24): number {
  return computeMarketValue(overall, age);
}

/** Preço de venda canônico: valor por estrela × 90%, arredondado a 100. */
export function sellPriceForOverall(overall: number, age = 24): number {
  return Math.round((marketValueForOverall(overall, age) * 0.9) / 100) * 100;
}

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

function rollHalfStarBand(rng: () => number, division: Division): number {
  return rollBandForDivision(division, rng);
}

// Baralho determinístico: distribui as N cartas conforme os pesos da divisão,
// garantindo a variedade prometida (§7.1) mesmo em amostras pequenas.
function buildBandDeck(division: Division, count: number, rng: () => number): number[] {
  const weights = DIVISION_STAR_PROFILE[division];
  const total = weights.reduce((a, b) => a + b, 0);
  const deck: number[] = [];
  for (let i = 0; i < weights.length; i++) {
    const n = Math.round((weights[i] / total) * count);
    for (let k = 0; k < n; k++) deck.push(i + 1);
  }
  // ajusta arredondamentos até bater exatamente `count`
  while (deck.length < count) {
    const maxIdx = weights.indexOf(Math.max(...weights));
    deck.push(maxIdx + 1);
  }
  while (deck.length > count) deck.pop();
  // Fisher-Yates com o mesmo rng determinístico
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}


// Para atingir uma banda alvo, precisamos que o overall bata a faixa dela.
// A espécie tem um overall-base; aplicamos variação forçada até bater a banda.
function speciesBaseOverall(s: SpeciesBase): number {
  if (s.gk) return Math.round(s.gk.maos*0.4 + s.gk.concentracao*0.3 + s.gk.elasticidade*0.3);
  if (s.line) {
    const l = s.line;
    // Aproximação: média simples (a ponderada exigiria a posição)
    return Math.round((l.defender + l.passar + l.atacar + l.tecnica + l.forca + l.pique) / 6);
  }
  return 40;
}

const SELLERS = [
  "Academia Aurora","Casa dos Elementais","Cavernas de Ignis","Ilha Nébula",
  "Guilda do Vento","Torre Cristalina","Oráculo de Fenris","Colina dos Golems",
];

export interface MarketListing {
  id: string;
  species: string;
  epithet: string;
  name: string;
  element: Element;
  suggested_position: string;
  is_goalkeeper: boolean;
  power_key: string;
  power_name: string;
  power_desc: string;
  attr_defender: number;
  attr_passar: number;
  attr_atacar: number;
  attr_tecnica: number;
  attr_forca: number;
  attr_pique: number;
  attr_maos: number;
  attr_concentracao: number;
  attr_elasticidade: number;
  overall: number;
  energy: number;
  market_value: number;
  price: number;
  seller: string;
  half_star_band: number;
  age: number;
  is_prodigy: boolean;
  gem_price: number;
}

export interface PremiumMarketOffer extends MarketListing {
  gem_price: number;
  premium_band: number;
  premium_tier_label: string;
  season_division_limit: 1;
}

function pickSpeciesForBand(bestiary: LoadedBestiary, band: number, rng: () => number): SpeciesBase {
  const scored = bestiary.species.map((s) => ({ s, o: speciesBaseOverall(s) }));
  let pool: SpeciesBase[];
  if (band >= 8) pool = scored.filter((x) => x.o >= 68).map((x) => x.s);
  else if (band >= 6) pool = scored.filter((x) => x.o >= 55).map((x) => x.s);
  else if (band <= 3) pool = scored.filter((x) => x.o <= 55).map((x) => x.s);
  else pool = bestiary.species;
  if (!pool.length) pool = bestiary.species;
  return pick(rng, pool);
}

function generateOne(
  bestiary: LoadedBestiary,
  rng: () => number,
  division: Division,
  forcedBand?: number,
  forcedOverall?: number,
): MarketListing {
  const band = forcedBand ?? rollHalfStarBand(rng, division);
  const targetOverall = forcedOverall ?? band * 10; // 10..100
  const spBase = pickSpeciesForBand(bestiary, band, rng);
  const c = rollCreature(spBase, bestiary.epithets[spBase.element] ?? [], rng, { variation: 6, prodigy: rng() < 0.005 });
  const currOverall = c.overall || 40;
  const scale = Math.max(0.3, Math.min(2.5, targetOverall / currOverall));
  const scl = (n: number) => Math.max(5, Math.min(100, Math.round(n * scale)));
  const adjusted = {
    ...c,
    attr_defender: scl(c.attr_defender),
    attr_passar:   scl(c.attr_passar),
    attr_atacar:   scl(c.attr_atacar),
    attr_tecnica:  scl(c.attr_tecnica),
    attr_forca:    scl(c.attr_forca),
    attr_pique:    scl(c.attr_pique),
    attr_maos:     scl(c.attr_maos),
    attr_concentracao: scl(c.attr_concentracao),
    attr_elasticidade: scl(c.attr_elasticidade),
    overall: targetOverall,
  };

  // Idade em múltiplos de 3, entre 18 e 30, com peso maior para jovens/meia-idade
  const AGE_POOL = [18, 18, 21, 21, 21, 24, 24, 27, 27, 30];
  const age = AGE_POOL[Math.floor(rng() * AGE_POOL.length)];
  const market_value = computeMarketValue(targetOverall, age);
  const priceMultiplier = 0.9 + rng() * 0.4;
  const price = Math.max(1000, Math.round((market_value * priceMultiplier) / 1000) * 1000);
  const idSeed = Math.floor(rng() * 1e9).toString(16);

  const listing = {
    id: `market_${idSeed}`,
    species: adjusted.species,
    epithet: adjusted.epithet,
    name: adjusted.name,
    element: adjusted.element,
    suggested_position: adjusted.position,
    is_goalkeeper: adjusted.is_goalkeeper,
    power_key: adjusted.power_key,
    power_name: adjusted.power_name,
    power_desc: adjusted.power_desc,
    attr_defender: adjusted.attr_defender,
    attr_passar: adjusted.attr_passar,
    attr_atacar: adjusted.attr_atacar,
    attr_tecnica: adjusted.attr_tecnica,
    attr_forca: adjusted.attr_forca,
    attr_pique: adjusted.attr_pique,
    attr_maos: adjusted.attr_maos,
    attr_concentracao: adjusted.attr_concentracao,
    attr_elasticidade: adjusted.attr_elasticidade,
    overall: adjusted.overall,
    energy: 100,
    market_value,
    price,
    seller: pick(rng, SELLERS),
    half_star_band: band,
    age,
    is_prodigy: adjusted.is_prodigy,
  };
  return {
    ...listing,
    gem_price: normalPlayerGemPrice({
      division,
      overall: listing.overall,
      age: listing.age,
      halfStarBand: listing.half_star_band,
      marketValue: listing.market_value,
      isProdigy: listing.is_prodigy,
    }),
  };
}

export function generateMarketListings(
  bestiary: LoadedBestiary,
  trainerId: string,
  seasonNumber: number,
  division: Division = "bronze",
  count = 24,
  rotationKey = "initial",
  scoutPosition?: MarketScoutPosition | null,
): MarketListing[] {
  const seed = hashString(`${trainerId}:season:${seasonNumber}:${division}:rotation:${rotationKey}:scout:${scoutPosition ?? "all"}`);
  const rng = mulberry32(seed);
  const deck = buildBandDeck(division, count, rng);
  const listings: MarketListing[] = [];
  for (let i = 0; i < count; i++) listings.push(generateOne(bestiary, rng, division, deck[i]));
  if (scoutPosition) {
    const matches = listings.filter((listing) => positionGroup(listing.suggested_position) === scoutPosition);
    // O olheiro é uma busca direcionada, não apenas uma mudança cosmética na
    // ordem da mesma lista. Gera uma vitrine exclusivamente da posição pedida.
    return matches.slice(0, count);
  }
  return listings;
}

function positionGroup(position: string): MarketScoutPosition {
  const value = position.toUpperCase();
  if (value.includes("GOL")) return "GOL";
  if (value.includes("DEF") || value.includes("ZAG")) return "DEF";
  if (value.includes("MEI")) return "MEI";
  return "ATA";
}

/** Oferta premium determinística, adequada à divisão e limitada por temporada/divisão. */
export function generatePremiumMarketOffer(
  bestiary: LoadedBestiary,
  trainerId: string,
  seasonNumber: number,
  division: Division,
): PremiumMarketOffer {
  const bandByDivision: Record<Division, number> = {
    bronze: 6,
    prata: 8,
    ouro: 10,
    diamante: 10,
    lendaria: 10,
  };
  const overallByDivision: Record<Division, number> = {
    bronze: 60,
    prata: 80,
    ouro: 95,
    diamante: 98,
    lendaria: 100,
  };
  const tierLabelByDivision: Record<Division, string> = {
    bronze: "3 estrelas — topo da categoria",
    prata: "4 estrelas — topo da categoria",
    ouro: "5 estrelas — jogador top",
    diamante: "5 estrelas — jogador de elite",
    lendaria: "5 estrelas — nível máximo",
  };
  const rng = mulberry32(hashString(`${trainerId}:premium:${seasonNumber}:${division}`));
  const premiumBand = bandByDivision[division];
  const listing = generateOne(
    bestiary,
    rng,
    division,
    premiumBand,
    overallByDivision[division],
  );
  const marketValue = computeMarketValue(listing.overall, 18);
  return {
    ...listing,
    id: `premium_${division}_${seasonNumber}_${listing.id}`,
    age: 18,
    is_prodigy: true,
    market_value: marketValue,
    price: marketValue,
    gem_price: GEM_ECONOMY_CONFIG.premiumGemPriceByDivision[division],
    premium_band: premiumBand,
    premium_tier_label: tierLabelByDivision[division],
    season_division_limit: 1,
  };
}

export function findListing(
  bestiary: LoadedBestiary,
  trainerId: string,
  seasonNumber: number,
  division: Division,
  listingId: string,
  rotationKey = "initial",
  scoutPosition?: MarketScoutPosition | null,
): MarketListing | null {
  return (
    generateMarketListings(bestiary, trainerId, seasonNumber, division, 24, rotationKey, scoutPosition).find((l) => l.id === listingId) ??
    null
  );
}

export { overallToStars, computeMarketValue };
