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
import { rollBandForDivision, type Division } from "./economy";


const STAR_VALUE = [
  15_000, 35_000, 70_000, 130_000, 240_000,
  430_000, 780_000, 1_400_000, 2_500_000, 4_500_000,
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

function rollHalfStarBand(rng: () => number, division: Division): number {
  return rollBandForDivision(division, rng);
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
}

function pickSpeciesForBand(band: number, rng: () => number): SpeciesBase {
  // Bandas altas (>=8): favorece espécies com overall base >=70
  // Bandas baixas (<=3): favorece espécies com base <=45
  const scored = BESTIARY.map((s) => ({ s, o: speciesBaseOverall(s) }));
  let pool: SpeciesBase[];
  if (band >= 8) pool = scored.filter((x) => x.o >= 68).map((x) => x.s);
  else if (band >= 6) pool = scored.filter((x) => x.o >= 55).map((x) => x.s);
  else if (band <= 3) pool = scored.filter((x) => x.o <= 55).map((x) => x.s);
  else pool = BESTIARY;
  if (!pool.length) pool = BESTIARY;
  return pick(rng, pool);
}

function generateOne(rng: () => number, division: Division): MarketListing {
  const band = rollHalfStarBand(rng, division);
  const targetOverall = band * 10; // 10..100
  const spBase = pickSpeciesForBand(band, rng);
  // Rola a criatura, depois ajusta atributos proporcionalmente para bater a banda
  const c = rollCreature(spBase, rng, { variation: 6 });
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

  const market_value = STAR_VALUE[band - 1];
  const priceMultiplier = 0.9 + rng() * 0.4;
  const price = Math.max(1000, Math.round((market_value * priceMultiplier) / 1000) * 1000);
  const idSeed = Math.floor(rng() * 1e9).toString(16);
  const age = 18 + Math.floor(rng() * 6); // 18..23

  return {
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
  };
}

export function generateMarketListings(
  trainerId: string,
  seasonNumber: number,
  division: Division = "bronze",
  count = 24,
): MarketListing[] {
  const seed = hashString(`${trainerId}:season:${seasonNumber}:${division}`);
  const rng = mulberry32(seed);
  const listings: MarketListing[] = [];
  for (let i = 0; i < count; i++) listings.push(generateOne(rng, division));
  return listings;
}

export function findListing(
  trainerId: string,
  seasonNumber: number,
  division: Division,
  listingId: string,
): MarketListing | null {
  return (
    generateMarketListings(trainerId, seasonNumber, division).find((l) => l.id === listingId) ??
    null
  );
}

export { overallToStars, computeMarketValue };
