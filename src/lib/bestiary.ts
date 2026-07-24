// Bestiário Mitológico — tipos e helpers puros.
// Os catálogos de espécies (60) e epítetos (100) vivem no banco
// (tabelas public.species e public.epithets). Use `loadBestiary()`
// em src/lib/bestiary.server.ts para carregá-los.

export type Element = "fogo" | "agua" | "terra" | "ar" | "gelo";
export type Position = "Goleiro" | "Zagueiro" | "Meio-campo" | "Atacante";

// Atributos de linha (0..100)
export interface LineAttrs {
  defender: number;
  passar: number;
  atacar: number;
  tecnica: number;
  forca: number;
  pique: number;
}

// Atributos de goleiro (0..100)
export interface GkAttrs {
  maos: number;
  concentracao: number;
  elasticidade: number;
}

export interface SpeciesBase {
  species: string;
  element: Element;
  position: Position;
  origin: string;
  power_key: string;
  power_name: string;
  power_desc: string;
  line?: LineAttrs;
  gk?: GkAttrs;
}

export type EpithetMap = Record<Element, string[]>;

// -------- Epítetos "elite" (subida de estrela) --------
export const ELITE_EPITHETS = ["o Lendário", "o Imortal", "o Invicto", "o Ancião"];

export function pickEpithet(epithets: string[], rng: () => number): string {
  if (!epithets.length) return "";
  return epithets[Math.floor(rng() * epithets.length)];
}

export function pickEliteEpithet(rng: () => number): string {
  return ELITE_EPITHETS[Math.floor(rng() * ELITE_EPITHETS.length)];
}

// -------- Pesos por posição (§1.4) --------

const LINE_WEIGHTS: Record<"DEF" | "MEI" | "ATA", LineAttrs> = {
  DEF: { defender: 0.40, passar: 0.10, atacar: 0.05, tecnica: 0.10, forca: 0.25, pique: 0.10 },
  MEI: { defender: 0.15, passar: 0.30, atacar: 0.15, tecnica: 0.25, forca: 0.05, pique: 0.10 },
  ATA: { defender: 0.05, passar: 0.10, atacar: 0.40, tecnica: 0.20, forca: 0.10, pique: 0.15 },
};

export function positionRole(pos: Position): "GOL" | "DEF" | "MEI" | "ATA" {
  if (pos === "Goleiro") return "GOL";
  if (pos === "Zagueiro") return "DEF";
  if (pos === "Meio-campo") return "MEI";
  return "ATA";
}

export function computeLineOverall(a: LineAttrs, pos: Position): number {
  const role = positionRole(pos) as "DEF" | "MEI" | "ATA";
  const w = LINE_WEIGHTS[role] ?? LINE_WEIGHTS.MEI;
  return Math.round(
    a.defender * w.defender + a.passar * w.passar + a.atacar * w.atacar +
    a.tecnica * w.tecnica + a.forca * w.forca + a.pique * w.pique,
  );
}

export function computeGkOverall(g: GkAttrs): number {
  return Math.round(g.maos * 0.40 + g.concentracao * 0.30 + g.elasticidade * 0.30);
}

export function overallToStars(overall: number): number {
  return Math.max(0, Math.min(10, Math.round(overall / 10)));
}

function clamp100(n: number) { return Math.max(0, Math.min(100, n)); }

export interface RolledCreature {
  species: string;
  epithet: string;
  name: string;
  element: Element;
  position: Position;
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
  market_value: number;
  is_prodigy: boolean;
}

/** Chance base de nascimento excepcional (Prodígio). */
export const PRODIGY_CHANCE = 0.005;
/** Bônus fixo aplicado a todos os atributos quando prodígio. */
export const PRODIGY_ATTR_BONUS = 10;

/**
 * Gera uma criatura a partir da espécie base + lista de epítetos do elemento
 * (vinda do banco). Aplica variação ±`variation` (padrão 12) nos atributos.
 * Se `prodigy` for true, aplica bônus fixo em todos os atributos (~1★ acima).
 */
export function rollCreature(
  species: SpeciesBase,
  epithetsForElement: string[],
  rng: () => number,
  opts: { variation?: number; prodigy?: boolean } = {},
): RolledCreature {
  const variation = opts.variation ?? 12;
  const prodigy = !!opts.prodigy;
  const bonus = prodigy ? PRODIGY_ATTR_BONUS : 0;
  const jitter = () => Math.round((rng() * 2 - 1) * variation);
  const epithet = pickEpithet(epithetsForElement, rng);

  const attrs = {
    attr_defender: 20, attr_passar: 20, attr_atacar: 20, attr_tecnica: 20,
    attr_forca: 20, attr_pique: 20,
    attr_maos: 20, attr_concentracao: 20, attr_elasticidade: 20,
  };

  let overall = 40;
  if (species.gk) {
    const g = species.gk;
    const rolled = {
      maos: clamp100(g.maos + bonus + jitter()),
      concentracao: clamp100(g.concentracao + bonus + jitter()),
      elasticidade: clamp100(g.elasticidade + bonus + jitter()),
    };
    attrs.attr_maos = rolled.maos;
    attrs.attr_concentracao = rolled.concentracao;
    attrs.attr_elasticidade = rolled.elasticidade;
    overall = computeGkOverall(rolled);
  } else if (species.line) {
    const l = species.line;
    const rolled: LineAttrs = {
      defender: clamp100(l.defender + bonus + jitter()),
      passar:   clamp100(l.passar   + bonus + jitter()),
      atacar:   clamp100(l.atacar   + bonus + jitter()),
      tecnica:  clamp100(l.tecnica  + bonus + jitter()),
      forca:    clamp100(l.forca    + bonus + jitter()),
      pique:    clamp100(l.pique    + bonus + jitter()),
    };
    attrs.attr_defender = rolled.defender;
    attrs.attr_passar   = rolled.passar;
    attrs.attr_atacar   = rolled.atacar;
    attrs.attr_tecnica  = rolled.tecnica;
    attrs.attr_forca    = rolled.forca;
    attrs.attr_pique    = rolled.pique;
    overall = computeLineOverall(rolled, species.position);
  }

  const isGk = species.position === "Goleiro";
  return {
    species: species.species,
    epithet,
    name: epithet ? `${species.species} ${epithet}` : species.species,
    element: species.element,
    position: species.position,
    is_goalkeeper: isGk,
    power_key: species.power_key,
    power_name: species.power_name,
    power_desc: species.power_desc,
    ...attrs,
    overall,
    market_value: computeMarketValue(overall, 18),
    is_prodigy: prodigy,
  };
}

/**
 * Valor de mercado canônico (Tabela de Balanceamento §9.1):
 * valor por estrela (band = overall / 10). Age não altera o valor.
 */
const STAR_VALUE_TABLE = [
  15_000, 35_000, 70_000, 130_000, 240_000,
  430_000, 780_000, 1_400_000, 2_500_000, 4_500_000,
];
export function computeMarketValue(overall: number, _age: number): number {
  const band = Math.max(1, Math.min(10, Math.round((overall ?? 0) / 10)));
  return STAR_VALUE_TABLE[band - 1];
}

// -------- Filtros sobre uma lista já carregada --------

export function bestiaryByElement(list: SpeciesBase[], el: Element): SpeciesBase[] {
  return list.filter((s) => s.element === el);
}

export function bestiaryByPosition(list: SpeciesBase[], pos: Position): SpeciesBase[] {
  return list.filter((s) => s.position === pos);
}

export function findSpecies(list: SpeciesBase[], name: string): SpeciesBase | null {
  return list.find((s) => s.species === name) ?? null;
}

export function findByPower(list: SpeciesBase[], key: string): SpeciesBase | null {
  return list.find((s) => s.power_key === key) ?? null;
}

export function speciesLineOverall(s: SpeciesBase): number {
  if (s.gk) return computeGkOverall(s.gk);
  return computeLineOverall(s.line!, s.position);
}
