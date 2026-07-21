// Motor de partida — regras do GDD §4.
// Pura lógica: recebe dois lados escalados, devolve resultado + eventos minuto-a-minuto.

export type Element = "fogo" | "agua" | "terra" | "ar" | "gelo";
export type SlotRole = "GOL" | "DEF" | "MEI" | "ATA";

export interface EngineCreature {
  id: string;
  name: string;
  element: Element;
  overall: number;          // 0..100
  physical: number;         // 0..100
  affinity_fogo: number;    // 0..15 (%)
  affinity_agua: number;
  affinity_terra: number;
  affinity_ar: number;
  affinity_gelo: number;
}

export interface EngineSlot {
  role: SlotRole;
  creature: EngineCreature;
}

export interface EngineSide {
  team_id: string;
  team_name: string;
  starters: EngineSlot[]; // exatamente 11
  strategy: "ofensiva" | "equilibrada" | "defensiva";
}

export type EngineEventType =
  | "kickoff"
  | "goal"
  | "shot_saved"
  | "yellow_card"
  | "injury"
  | "halftime"
  | "fulltime";

export interface EngineEvent {
  minute: number;
  event_type: EngineEventType;
  description: string;
  actor_creature_id: string | null;
  actor_team_id: string | null;
}

// Ciclo elemental — cada elemento vence exatamente um (GDD §3.1)
const BEATS: Record<Element, Element> = {
  fogo: "gelo",
  gelo: "ar",
  ar: "terra",
  terra: "agua",
  agua: "fogo",
};

const AFFINITY_KEY: Record<Element, keyof EngineCreature> = {
  fogo: "affinity_fogo",
  agua: "affinity_agua",
  terra: "affinity_terra",
  ar: "affinity_ar",
  gelo: "affinity_gelo",
};

function elementalBonus(attacker: Element, defender: Element): number {
  if (BEATS[attacker] === defender) return 0.06;
  if (BEATS[defender] === attacker) return -0.05;
  return 0;
}

function strategyMod(s: EngineSide["strategy"]): { atk: number; def: number } {
  if (s === "ofensiva") return { atk: 3, def: -2 };
  if (s === "defensiva") return { atk: -2, def: 3 };
  return { atk: 0, def: 0 };
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// PRNG determinística por seed (mulberry32) — permite replay estável.
function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

interface SideStrength {
  attack: number;
  defense: number;
  attackers: EngineSlot[]; // MEI+ATA
  defenders: EngineSlot[]; // GOL+DEF
}

function computeStrength(side: EngineSide): SideStrength {
  const attackers = side.starters.filter((s) => s.role === "MEI" || s.role === "ATA");
  const defenders = side.starters.filter((s) => s.role === "GOL" || s.role === "DEF");
  const mod = strategyMod(side.strategy);
  return {
    attack: avg(attackers.map((s) => s.creature.overall)) + mod.atk,
    defense: avg(defenders.map((s) => s.creature.overall)) + mod.def,
    attackers,
    defenders,
  };
}

export interface SimulationResult {
  home_score: number;
  away_score: number;
  events: EngineEvent[];
}

export function simulate(home: EngineSide, away: EngineSide, seed: number): SimulationResult {
  const rand = mulberry32(seed);
  const events: EngineEvent[] = [];
  const H = computeStrength(home);
  const A = computeStrength(away);

  let hs = 0;
  let as = 0;

  events.push({
    minute: 0,
    event_type: "kickoff",
    description: `Começa a partida: ${home.team_name} x ${away.team_name}`,
    actor_creature_id: null,
    actor_team_id: null,
  });

  for (let minute = 1; minute <= 90; minute++) {
    // Fator casa: +4 no ataque do mandante (GDD §4.3)
    const chanceHome = (H.attack + 4) / 1900;
    const chanceAway = A.attack / 2100;

    processTeamChance(true, minute, home, H, A, chanceHome, rand, events, () => hs++);
    processTeamChance(false, minute, away, A, H, chanceAway, rand, events, () => as++);

    // Cartão amarelo ~1,5%/min
    if (rand() < 0.015) {
      const which = rand() < 0.5 ? home : away;
      const actor = pick(which.starters, rand).creature;
      events.push({
        minute,
        event_type: "yellow_card",
        description: `Cartão amarelo para ${actor.name} (${which.team_name}).`,
        actor_creature_id: actor.id,
        actor_team_id: which.team_id,
      });
    }
    // Lesão ~0,4%/min
    if (rand() < 0.004) {
      const which = rand() < 0.5 ? home : away;
      const actor = pick(which.starters, rand).creature;
      events.push({
        minute,
        event_type: "injury",
        description: `${actor.name} sente uma lesão (${which.team_name}).`,
        actor_creature_id: actor.id,
        actor_team_id: which.team_id,
      });
    }

    if (minute === 45) {
      events.push({
        minute: 45,
        event_type: "halftime",
        description: `Fim do primeiro tempo — ${home.team_name} ${hs} x ${as} ${away.team_name}`,
        actor_creature_id: null,
        actor_team_id: null,
      });
    }
  }

  // reconta placares (fechamento após loop, pois usamos closures)
  hs = events.filter((e) => e.event_type === "goal" && e.actor_team_id === home.team_id).length;
  as = events.filter((e) => e.event_type === "goal" && e.actor_team_id === away.team_id).length;

  events.push({
    minute: 90,
    event_type: "fulltime",
    description: `Fim de jogo — ${home.team_name} ${hs} x ${as} ${away.team_name}`,
    actor_creature_id: null,
    actor_team_id: null,
  });

  return { home_score: hs, away_score: as, events };
}

function processTeamChance(
  isHome: boolean,
  minute: number,
  side: EngineSide,
  own: SideStrength,
  opp: SideStrength,
  chance: number,
  rand: () => number,
  events: EngineEvent[],
  onGoal: () => void,
) {
  if (rand() >= chance) return;
  if (!own.attackers.length || !opp.defenders.length) return;

  const finisher = pick(own.attackers, rand).creature;
  const defender = pick(opp.defenders, rand).creature;

  const bonusElem = elementalBonus(finisher.element, defender.element);
  const affinityRaw = finisher[AFFINITY_KEY[finisher.element]] as number;
  const affinityBonus = (affinityRaw || 0) / 100;

  const homeAdv = isHome ? 4 : 0;
  let chanceGoal =
    (own.attack + homeAdv - opp.defense + 40) / 260 + bonusElem + affinityBonus;
  if (chanceGoal < 0.07) chanceGoal = 0.07;

  if (rand() < chanceGoal) {
    onGoal();
    events.push({
      minute,
      event_type: "goal",
      description: `GOL de ${finisher.name}! (${side.team_name})`,
      actor_creature_id: finisher.id,
      actor_team_id: side.team_id,
    });
  } else {
    events.push({
      minute,
      event_type: "shot_saved",
      description: `${finisher.name} arrisca, mas ${defender.name} evita o gol.`,
      actor_creature_id: finisher.id,
      actor_team_id: side.team_id,
    });
  }
}

// ---------- gerador de adversário (CPU) para amistosos ----------

const CPU_PREFIXES = ["Falcão", "Lobo", "Trovão", "Sombra", "Fúria", "Cometa", "Chama", "Vaga", "Rocha", "Nevasca"];
const CPU_SUFFIXES = ["FC", "Atlético", "United", "Sporting", "Real", "Racing", "Selvagem", "Elemental"];
const ELS: Element[] = ["fogo", "agua", "terra", "ar", "gelo"];

export function generateCpuSide(seed: number, playerOverall: number): EngineSide {
  const rand = mulberry32(seed ^ 0x5f3759df);
  const name = `${pick(CPU_PREFIXES, rand)} ${pick(CPU_SUFFIXES, rand)}`;
  // Ajusta força do CPU perto da do jogador (±10)
  const target = Math.max(15, Math.min(95, playerOverall + Math.floor((rand() - 0.5) * 20)));

  const roles: SlotRole[] = ["GOL", "DEF", "DEF", "DEF", "DEF", "MEI", "MEI", "MEI", "MEI", "ATA", "ATA"];
  const starters: EngineSlot[] = roles.map((role, i) => {
    const overall = Math.max(10, Math.min(99, Math.round(target + (rand() - 0.5) * 15)));
    const element = pick(ELS, rand);
    return {
      role,
      creature: {
        id: `cpu-${seed}-${i}`,
        name: `${pick(CPU_PREFIXES, rand)}${pick(CPU_SUFFIXES, rand)}`.replace(/\s+/g, ""),
        element,
        overall,
        physical: overall,
        affinity_fogo: element === "fogo" ? 7 : 1,
        affinity_agua: element === "agua" ? 7 : 1,
        affinity_terra: element === "terra" ? 7 : 1,
        affinity_ar: element === "ar" ? 7 : 1,
        affinity_gelo: element === "gelo" ? 7 : 1,
      },
    };
  });

  return {
    team_id: `cpu-${seed}`,
    team_name: name,
    starters,
    strategy: "equilibrada",
  };
}
