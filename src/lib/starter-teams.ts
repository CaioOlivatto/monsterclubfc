// Catálogo dos 6 times iniciais + gerador determinístico usando o Bestiário.
// O bestiário vem do banco — as funções recebem o objeto `LoadedBestiary`.

import {
  rollCreature,
  bestiaryByPosition,
  bestiaryByElement,
  computeMarketValue,
  type Element,
  type Position,
  type RolledCreature,
  type SpeciesBase,
} from "./bestiary";
import type { LoadedBestiary } from "./bestiary.server";
import { xpForHalfStars } from "./xp.server";

export type StarterKey =
  | "titas_pedra"
  | "furacoes_vento"
  | "chamas_rubras"
  | "mares_profundas"
  | "laminas_gelo"
  | "guardioes_mistos";

export type StarterStyle = "defensivo" | "ofensivo" | "equilibrado";
export type ElementKey = Element;

export interface StarterTeamDef {
  key: StarterKey;
  name: string;
  emblem: string;
  color: string;
  colorClass: string;
  dominant: ElementKey | "mesclado";
  style: StarterStyle;
  description: string;
}

export const STARTER_TEAMS: StarterTeamDef[] = [
  { key: "titas_pedra",      name: "Titãs de Pedra",    emblem: "🗿", color: "marrom/âmbar", colorClass: "from-amber-900/40 to-amber-700/10 border-amber-700/40", dominant: "terra", style: "defensivo",   description: "Muralha do elemento Terra. Segura resultado, sofre pra criar." },
  { key: "furacoes_vento",   name: "Furacões do Vento", emblem: "🌀", color: "lilás/branco",  colorClass: "from-violet-500/30 to-violet-300/10 border-violet-400/40", dominant: "ar",    style: "ofensivo",    description: "Velocidade e ataque de Ar. Placar alto, defesa frágil." },
  { key: "chamas_rubras",    name: "Chamas Rubras",     emblem: "🔥", color: "vermelho/laranja", colorClass: "from-red-600/40 to-orange-500/10 border-red-500/40", dominant: "fogo",  style: "ofensivo",    description: "Pressão constante do Fogo. Domina times de Gelo." },
  { key: "mares_profundas",  name: "Marés Profundas",   emblem: "🌊", color: "azul",           colorClass: "from-blue-600/40 to-blue-400/10 border-blue-500/40", dominant: "agua",  style: "equilibrado", description: "Água versátil. Vantagem elemental contra Fogo." },
  { key: "laminas_gelo",     name: "Lâminas de Gelo",   emblem: "❄️", color: "ciano/branco",   colorClass: "from-cyan-400/30 to-sky-200/10 border-cyan-400/40",  dominant: "gelo",  style: "defensivo",   description: "Gelo paciente. Controla o ritmo e contra-ataca." },
  { key: "guardioes_mistos", name: "Guardiões Mistos",  emblem: "🛡️", color: "verde/dourado",  colorClass: "from-emerald-600/30 to-yellow-500/10 border-emerald-500/40", dominant: "mesclado", style: "equilibrado", description: "Um pouco de cada elemento. Difícil de ler." },
];

export function getStarterTeam(key: string): StarterTeamDef | null {
  return STARTER_TEAMS.find((t) => t.key === key) ?? null;
}

// ---------- geração ----------

function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h || 1;
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

const SUPPORT: Record<Element, Element> = {
  fogo: "ar", agua: "gelo", terra: "agua", ar: "fogo", gelo: "terra",
};

function pickElementForTeam(team: StarterTeamDef, rng: () => number): Element {
  const all: Element[] = ["fogo","agua","terra","ar","gelo"];
  if (team.dominant === "mesclado") return all[Math.floor(rng() * 5)];
  const dom = team.dominant;
  const r = rng();
  if (r < 0.70) return dom;
  if (r < 0.90) return SUPPORT[dom];
  const others = all.filter((e) => e !== dom && e !== SUPPORT[dom]);
  return others[Math.floor(rng() * others.length)];
}

function pickSpecies(
  list: SpeciesBase[],
  pos: Position,
  el: Element,
  used: Set<string>,
  rng: () => number,
): SpeciesBase {
  const byPosEl = list.filter((s) => s.position === pos && s.element === el && !used.has(s.species));
  if (byPosEl.length) return byPosEl[Math.floor(rng() * byPosEl.length)];
  const byPos = bestiaryByPosition(list, pos).filter((s) => !used.has(s.species));
  if (byPos.length) return byPos[Math.floor(rng() * byPos.length)];
  const byEl = bestiaryByElement(list, el).filter((s) => !used.has(s.species));
  if (byEl.length) return byEl[Math.floor(rng() * byEl.length)];
  const any = list.filter((s) => !used.has(s.species));
  return any[Math.floor(rng() * any.length)] ?? list[Math.floor(rng() * list.length)];
}

// Composição: 3 GOL, 8 DEF, 8 MEI, 7 ATA — 26 criaturas (§9 novo balanceamento)
const ROSTER_PLAN: Position[] = [
  ...Array(3).fill("Goleiro"),
  ...Array(8).fill("Zagueiro"),
  ...Array(8).fill("Meio-campo"),
  ...Array(7).fill("Atacante"),
] as Position[];

// Distribuição de idades do elenco inicial (26 = 6+6+5+5+4)
const AGE_PLAN: number[] = [
  ...Array(6).fill(18),
  ...Array(6).fill(21),
  ...Array(5).fill(24),
  ...Array(5).fill(27),
  ...Array(4).fill(30),
];

export function generateStarterRoster(teamKey: StarterKey, bestiary: LoadedBestiary): RolledCreature[] {
  const team = getStarterTeam(teamKey);
  if (!team) throw new Error("Time inicial inválido.");
  const rng = mulberry32(hashSeed(teamKey));
  const usedSpecies = new Set<string>();
  const roster: RolledCreature[] = [];

  // Distribuição da 5ª Divisão (Bronze) — Balanceamento §7.1
  // meia-estrelas: [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]
  const BRONZE_WEIGHTS = [5, 20, 33, 27, 12, 3, 0, 0, 0, 0];
  const pickBand = (): number => {
    const total = BRONZE_WEIGHTS.reduce((a, b) => a + b, 0);
    let r = rng() * total;
    for (let i = 0; i < BRONZE_WEIGHTS.length; i++) {
      r -= BRONZE_WEIGHTS[i];
      if (r <= 0) return i + 1; // 1..10
    }
    return 10;
  };

  const scaleAttrs = (c: RolledCreature, target: number): RolledCreature => {
    const current = c.overall || 40;
    if (current <= 0) return { ...c, overall: target };
    const factor = target / current;
    const scl = (n: number) => Math.max(5, Math.min(99, Math.round(n * factor)));
    return {
      ...c,
      attr_defender: scl(c.attr_defender),
      attr_passar: scl(c.attr_passar),
      attr_atacar: scl(c.attr_atacar),
      attr_tecnica: scl(c.attr_tecnica),
      attr_forca: scl(c.attr_forca),
      attr_pique: scl(c.attr_pique),
      attr_maos: scl(c.attr_maos),
      attr_concentracao: scl(c.attr_concentracao),
      attr_elasticidade: scl(c.attr_elasticidade),
      overall: target,
      market_value: computeMarketValue(target, 18),
    };
  };

  for (const pos of ROSTER_PLAN) {
    const el = pickElementForTeam(team, rng);
    const spBase = pickSpecies(bestiary.species, pos, el, usedSpecies, rng);
    if (usedSpecies.size < bestiary.species.length) usedSpecies.add(spBase.species);
    const c = rollCreature(spBase, bestiary.epithets[spBase.element] ?? [], rng, { variation: 6, prodigy: rng() < 0.005 });
    // Aplica banda da distribuição Bronze
    const band = pickBand();
    const target = Math.max(5, Math.min(99, band * 10 + Math.round((rng() * 2 - 1) * 4)));
    roster.push(scaleAttrs(c, target));
  }

  return roster;
}


export function starterTeamSummary(teamKey: StarterKey, bestiary: LoadedBestiary) {
  const roster = generateStarterRoster(teamKey, bestiary);
  const halfStars = roster.reduce((s, c) => s + Math.max(0, Math.min(10, Math.round(c.overall / 10))), 0);
  const totalStars = halfStars / 2;
  const avgAttack = Math.round(
    roster.reduce((s, c) => s + (c.attr_atacar || c.attr_elasticidade), 0) / roster.length,
  );
  const avgDefense = Math.round(
    roster.reduce((s, c) => s + (c.attr_defender || c.attr_maos), 0) / roster.length,
  );
  return { totalStars, avgAttack, avgDefense };
}

// Helper para inserts no banco (formata linhas prontas)
export function rosterToDbRows(trainerId: string, roster: RolledCreature[]) {
  return roster.map((c, i) => ({
    owner_trainer_id: trainerId,
    name: c.name,
    species: c.species,
    epithet: c.epithet,
    element: c.element,
    suggested_position: c.position,
    is_goalkeeper: c.is_goalkeeper,
    power_key: c.power_key,
    attr_defender: c.attr_defender,
    attr_passar: c.attr_passar,
    attr_atacar: c.attr_atacar,
    attr_tecnica: c.attr_tecnica,
    attr_forca: c.attr_forca,
    attr_pique: c.attr_pique,
    attr_maos: c.attr_maos,
    attr_concentracao: c.attr_concentracao,
    attr_elasticidade: c.attr_elasticidade,
    overall: c.overall,
    xp: 0,
    half_stars_earned: Math.max(0, Math.min(10, Math.round(c.overall / 10))),
    career_baseline_xp: xpForHalfStars(Math.max(0, Math.min(10, Math.round(c.overall / 10)))),
    pending_half_stars: 0,
    energy: 100,
    market_value: c.market_value,
    age: AGE_PLAN[i % AGE_PLAN.length] ?? 18,
    career_season: 1,
    retired: false,
    aff_fogo: 0, aff_agua: 0, aff_terra: 0, aff_ar: 0, aff_gelo: 0,
    is_prodigy: !!(c as any).is_prodigy,
  }));
}

export { computeMarketValue };
