// Geração do mundo completo (70 times, 1820 criaturas, 5 calendários).
// Server-only: chamado por chooseStarterTeam para popular o mundo do treinador.

import {
  bestiaryByElement,
  bestiaryByPosition,
  rollCreature,
  type Element,
  type Position,
  type SpeciesBase,
} from "@/lib/bestiary";
import { loadBestiary, type LoadedBestiary } from "@/lib/bestiary.server";
import {
  AGE_BUCKETS,
  DIVISION_ORDER,
  ROSTER_COMPOSITION,
  WORLD_TEAMS,
  pickHalfStars,
  type DivisionSlug,
  type WorldTeam,
} from "./catalog";
import { generateSchedule } from "@/lib/league.server";

// ---------- RNG determinístico ----------

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

// ---------- Escolha de elemento e espécie ----------

const SUPPORT: Record<Element, Element> = {
  fogo: "ar",
  agua: "gelo",
  terra: "agua",
  ar: "fogo",
  gelo: "terra",
};
const ALL_ELEMENTS: Element[] = ["fogo", "agua", "terra", "ar", "gelo"];

function pickElement(team: WorldTeam, rng: () => number): Element {
  if (team.element === "mesclado") {
    return ALL_ELEMENTS[Math.floor(rng() * ALL_ELEMENTS.length)];
  }
  const dom = team.element as Element;
  const r = rng();
  if (r < 0.55) return dom;
  if (r < 0.75) return SUPPORT[dom];
  const others = ALL_ELEMENTS.filter((e) => e !== dom && e !== SUPPORT[dom]);
  return others[Math.floor(rng() * others.length)];
}

function pickSpecies(bestiary: LoadedBestiary, pos: Position, el: Element, rng: () => number): SpeciesBase {
  const posEl = bestiary.species.filter((s) => s.position === pos && s.element === el);
  if (posEl.length) return posEl[Math.floor(rng() * posEl.length)];
  const byPos = bestiaryByPosition(bestiary.species, pos);
  if (byPos.length) return byPos[Math.floor(rng() * byPos.length)];
  return bestiaryByElement(bestiary.species, el)[0] ?? bestiary.species[0];
}

// ---------- Ajuste de overall para alvo de estrelas ----------
// halfStars 0..10  →  overall alvo ~ halfStars*10 (com pequeno spread)

function targetOverall(halfStars: number, rng: () => number): number {
  const base = halfStars * 10;
  const jitter = Math.round((rng() * 2 - 1) * 4); // ±4
  return Math.max(5, Math.min(99, base + jitter));
}

/** Escala os atributos de uma linha/goleiro para bater no overall alvo. */
function scaleAttrsToTarget(attrs: Record<string, number>, currentOverall: number, target: number): Record<string, number> {
  if (currentOverall <= 0) return attrs;
  const factor = target / currentOverall;
  const out: Record<string, number> = { ...attrs };
  for (const k of Object.keys(out)) {
    // só ajusta chaves que estão em faixa de atributo real (>=15)
    if (out[k] >= 15) {
      out[k] = Math.max(5, Math.min(99, Math.round(out[k] * factor)));
    }
  }
  return out;
}

// ---------- Distribuição de idades (fisher-yates sobre buckets) ----------

function buildAgeList(rng: () => number): number[] {
  const list: number[] = [];
  for (const [age, count] of AGE_BUCKETS) {
    for (let i = 0; i < count; i++) list.push(age);
  }
  // shuffle
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// ---------- Composição do plano de posições ----------

const ROSTER_PLAN: Position[] = [
  ...(Array(ROSTER_COMPOSITION.Goleiro).fill("Goleiro") as Position[]),
  ...(Array(ROSTER_COMPOSITION.Zagueiro).fill("Zagueiro") as Position[]),
  ...(Array(ROSTER_COMPOSITION["Meio-campo"]).fill("Meio-campo") as Position[]),
  ...(Array(ROSTER_COMPOSITION.Atacante).fill("Atacante") as Position[]),
];

// ---------- Geração dos 26 rows de criaturas de um time ----------

export interface GeneratedCreature {
  owner_team_id?: string; // preenchido no insert
  owner_trainer_id: string | null; // null para CPU
  name: string;
  species: string;
  epithet: string;
  element: Element;
  suggested_position: Position;
  is_goalkeeper: boolean;
  power_key: string;
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
  half_stars_earned: number;
  pending_half_stars: number;
  energy: number;
  market_value: number;
  age: number;
  career_season: number;
  retired: boolean;
  xp: number;
  aff_fogo: number;
  aff_agua: number;
  aff_terra: number;
  aff_ar: number;
  aff_gelo: number;
}

export function generateTeamRoster(bestiary: LoadedBestiary, team: WorldTeam, division: DivisionSlug, seed: number): GeneratedCreature[] {
  const rng = mulberry32(seed);
  const ages = buildAgeList(rng);
  const out: GeneratedCreature[] = [];

  for (let i = 0; i < ROSTER_PLAN.length; i++) {
    const pos = ROSTER_PLAN[i];
    const el = pickElement(team, rng);
    const spBase = pickSpecies(bestiary, pos, el, rng);
    const rolled = rollCreature(spBase, bestiary.epithets[spBase.element] ?? [], rng, { variation: 6, prodigy: rng() < 0.005 });

    // Ajuste ao alvo de estrelas da divisão
    const half = pickHalfStars(division, rng);
    const target = targetOverall(half, rng);
    const attrsIn = {
      attr_defender: rolled.attr_defender, attr_passar: rolled.attr_passar,
      attr_atacar: rolled.attr_atacar, attr_tecnica: rolled.attr_tecnica,
      attr_forca: rolled.attr_forca, attr_pique: rolled.attr_pique,
      attr_maos: rolled.attr_maos, attr_concentracao: rolled.attr_concentracao,
      attr_elasticidade: rolled.attr_elasticidade,
    };
    const scaled = scaleAttrsToTarget(attrsIn, rolled.overall, target);

    const age = ages[i % ages.length];
    const marketValue = Math.max(1000, target * target * 20);

    out.push({
      owner_trainer_id: null,
      name: rolled.name,
      species: rolled.species,
      epithet: rolled.epithet,
      element: rolled.element,
      suggested_position: rolled.position,
      is_goalkeeper: rolled.is_goalkeeper,
      power_key: rolled.power_key,
      attr_defender: scaled.attr_defender,
      attr_passar: scaled.attr_passar,
      attr_atacar: scaled.attr_atacar,
      attr_tecnica: scaled.attr_tecnica,
      attr_forca: scaled.attr_forca,
      attr_pique: scaled.attr_pique,
      attr_maos: scaled.attr_maos,
      attr_concentracao: scaled.attr_concentracao,
      attr_elasticidade: scaled.attr_elasticidade,
      overall: target,
      half_stars_earned: half,
      pending_half_stars: 0,
      energy: 100,
      market_value: Math.round(marketValue),
      age,
      career_season: 1,
      retired: false,
      xp: 0,
      aff_fogo: 0, aff_agua: 0, aff_terra: 0, aff_ar: 0, aff_gelo: 0,
      is_prodigy: !!(rolled as any).is_prodigy,
    });
  }

  return out;
}

// ---------- Seed completo (chamado por seedWorldForTrainer) ----------

export interface SeedInput {
  supabase: any;
  trainerId: string;
  seasonId: string;
  playerStarterKey: string;    // ex: "titas_pedra"
  playerTeamName?: string;     // opcional (override do nome do time)
  playerRoster: GeneratedCreature[]; // criaturas já criadas do jogador (owner_trainer_id definido)
}

export async function seedWorldForTrainer({
  supabase,
  trainerId,
  seasonId,
  playerStarterKey,
  playerRoster,
}: SeedInput): Promise<{ competitionsByDiv: Record<DivisionSlug, string>; playerTeamId: string }> {
  const bestiary = await loadBestiary(supabase);
  // 1) Cria 5 competições (uma por divisão)
  const competitionsByDiv = {} as Record<DivisionSlug, string>;
  for (const div of DIVISION_ORDER) {
    const { data, error } = await supabase
      .from("competitions")
      .insert({
        trainer_id: trainerId,
        season_id: seasonId,
        division: div,
        type: "league",
        status: "active",
      })
      .select("id")
      .single();
    if (error) throw error;
    competitionsByDiv[div] = data.id;
  }

  // 2) Cria os 70 times (14 por divisão). O time do jogador substitui o slot com starterKey do BRONZE.
  const teamIdByKey = new Map<string, string>(); // "div:index" -> teamId
  let playerTeamId = "";

  for (const div of DIVISION_ORDER) {
    const teams = WORLD_TEAMS[div];
    const rows = teams.map((t, i) => {
      const isPlayerSlot = div === "bronze" && t.starterKey === playerStarterKey;
      return {
        competition_id: competitionsByDiv[div],
        trainer_id: isPlayerSlot ? trainerId : null,
        is_player: isPlayerSlot,
        is_cpu: !isPlayerSlot,
        name: t.name,
        color: t.primary,
        emblem: (t.starterKey === "titas_pedra" ? "🗿" : t.name[0]),
        dominant_element: t.element === "mesclado" ? null : t.element,
        starter_key: t.starterKey ?? null,
        division: div,
        colors: { primary: t.primary, secondary: t.secondary },
        cpu_strength: null,
      };
    });
    const { data: inserted, error } = await supabase
      .from("teams")
      .insert(rows)
      .select("id, name, is_player, division");
    if (error) throw error;

    for (let i = 0; i < inserted.length; i++) {
      const row = inserted[i];
      teamIdByKey.set(`${div}:${i}`, row.id);
      if (row.is_player) playerTeamId = row.id;
    }
  }

  if (!playerTeamId) {
    throw new Error("Slot do time do jogador não foi encontrado na 5ª Divisão.");
  }

  // 3) Gera criaturas de cada time (exceto do jogador — vem de fora)
  const creatureRows: GeneratedCreature[] = [];
  for (const div of DIVISION_ORDER) {
    const teams = WORLD_TEAMS[div];
    for (let i = 0; i < teams.length; i++) {
      const teamId = teamIdByKey.get(`${div}:${i}`)!;
      const isPlayer = teams[i].starterKey === playerStarterKey && div === "bronze";
      if (isPlayer) {
        for (const c of playerRoster) creatureRows.push({ ...c, owner_team_id: teamId });
        continue;
      }
      const seed = hashSeed(`${trainerId}:${div}:${i}:${teams[i].name}`);
      const roster = generateTeamRoster(bestiary, teams[i], div, seed);
      for (const c of roster) creatureRows.push({ ...c, owner_team_id: teamId });
    }
  }

  // Insere em lotes de 200 (para não estourar payload)
  const CHUNK = 200;
  for (let i = 0; i < creatureRows.length; i += CHUNK) {
    const chunk = creatureRows.slice(i, i + CHUNK);
    const { error } = await supabase.from("creatures").insert(chunk as any);
    if (error) throw error;
  }

  // 4) Standings + calendário para cada divisão
  for (const div of DIVISION_ORDER) {
    const compId = competitionsByDiv[div];
    const teamIds = WORLD_TEAMS[div].map((_, i) => teamIdByKey.get(`${div}:${i}`)!);

    const standingsRows = teamIds.map((tid) => ({
      competition_id: compId,
      team_id: tid,
      division: div,
      points: 0, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0,
    }));
    const { error: sErr } = await supabase.from("standings").insert(standingsRows);
    if (sErr) throw sErr;

    const schedule = generateSchedule(14, true); // 26 rodadas
    const matchesRows: any[] = [];
    schedule.forEach((round, rIdx) => {
      round.forEach(([h, a]) => {
        matchesRows.push({
          competition_id: compId,
          round: rIdx + 1,
          division: div,
          home_team_id: teamIds[h],
          away_team_id: teamIds[a],
          status: "scheduled",
          is_friendly: false,
        });
      });
    });
    // Insere calendário em lotes
    for (let i = 0; i < matchesRows.length; i += CHUNK) {
      const chunk = matchesRows.slice(i, i + CHUNK);
      const { error } = await supabase.from("matches").insert(chunk);
      if (error) throw error;
    }
  }

  // 5) world_state
  await supabase
    .from("world_state")
    .upsert({ trainer_id: trainerId, season_id: seasonId, current_round: 1, seeded: true });

  return { competitionsByDiv, playerTeamId };
}
