// Motor de partida — regras do GDD §4-5.

export type Element = "fogo" | "agua" | "terra" | "ar" | "gelo";
export type SlotRole = "GOL" | "DEF" | "MEI" | "ATA";
export type Weather = "sol" | "chuva" | "vento" | "neve" | "nublado";

export interface EngineCreature {
  id: string;
  name: string;
  element: Element;
  overall: number;
  physical: number;
  energy: number; // 0..100
  affinity_fogo: number;
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
  starters: EngineSlot[];
  bench: EngineSlot[]; // reservas por ordem
  strategy: "ofensiva" | "equilibrada" | "defensiva";
}

export type EngineEventType =
  | "kickoff"
  | "goal"
  | "shot_saved"
  | "yellow_card"
  | "red_card"
  | "injury"
  | "substitution"
  | "halftime"
  | "fulltime"
  | "weather";

export interface EngineEventMeta {
  attacker?: string;
  defender?: string;
  goalie?: string;
  team?: string;
  element?: Element;
  defender_element?: Element;
  elemental_advantage?: boolean;
  long_shot?: boolean;
  is_danger?: boolean;
  outcome?: "goal" | "save" | "miss" | "block";
}

export interface EngineEvent {
  minute: number;
  event_type: EngineEventType;
  description: string;
  actor_creature_id: string | null;
  actor_team_id: string | null;
  meta?: EngineEventMeta;
}

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

const WEATHER_BOOST: Record<Weather, Element | null> = {
  sol: "fogo",
  chuva: "agua",
  vento: "ar",
  neve: "gelo",
  nublado: null,
};

const WEATHER_LABEL: Record<Weather, string> = {
  sol: "Sol forte",
  chuva: "Chuva",
  vento: "Vento",
  neve: "Neve",
  nublado: "Nublado",
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

function energyAdjusted(c: EngineCreature): number {
  // GDD §4.6: energia baixa penaliza overall efetivo
  const penalty = Math.max(0, (60 - c.energy)) * 0.25;
  return Math.max(10, c.overall - penalty);
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

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

interface LiveSide {
  side: EngineSide;
  starters: EngineSlot[]; // mutável — remove por vermelho, troca por sub
  bench: EngineSlot[];
  subsUsed: number;
}

interface SideStrength {
  attack: number;
  defense: number;
  attackers: EngineSlot[];
  defenders: EngineSlot[];
}

function computeStrength(live: LiveSide): SideStrength {
  const attackers = live.starters.filter((s) => s.role === "MEI" || s.role === "ATA");
  const defenders = live.starters.filter((s) => s.role === "GOL" || s.role === "DEF");
  const mod = strategyMod(live.side.strategy);
  return {
    attack: avg(attackers.map((s) => energyAdjusted(s.creature))) + mod.atk,
    defense: avg(defenders.map((s) => energyAdjusted(s.creature))) + mod.def,
    attackers,
    defenders,
  };
}

function trySubstitute(
  live: LiveSide,
  outSlot: EngineSlot,
  minute: number,
  events: EngineEvent[],
): boolean {
  if (live.subsUsed >= 5) return false;
  if (!live.bench.length) return false;
  // Reserva com maior energia, preferindo mesmo role
  const candidates = [...live.bench].sort((a, b) => {
    const rolePrefA = a.role === outSlot.role ? 0 : 1;
    const rolePrefB = b.role === outSlot.role ? 0 : 1;
    if (rolePrefA !== rolePrefB) return rolePrefA - rolePrefB;
    return b.creature.energy - a.creature.energy;
  });
  const inSlot = candidates[0];
  const idxBench = live.bench.indexOf(inSlot);
  if (idxBench < 0) return false;
  const idxStart = live.starters.indexOf(outSlot);
  if (idxStart < 0) return false;
  // Substituição mantém a role da posição
  live.starters[idxStart] = { role: outSlot.role, creature: inSlot.creature };
  live.bench.splice(idxBench, 1);
  live.subsUsed += 1;
  events.push({
    minute,
    event_type: "substitution",
    description: `Substituição em ${live.side.team_name}: entra ${inSlot.creature.name}, sai ${outSlot.creature.name}.`,
    actor_creature_id: inSlot.creature.id,
    actor_team_id: live.side.team_id,
  });
  return true;
}

export interface SimulationResult {
  home_score: number;
  away_score: number;
  events: EngineEvent[];
  weather: Weather;
  // Diminuição de energia final por criatura (id -> perda)
  energy_loss: Record<string, number>;
  // Criaturas que participaram como titular
  starter_ids: string[];
  // Criaturas do banco que foram utilizadas (subs)
  used_bench_ids: string[];
}

export function simulate(home: EngineSide, away: EngineSide, seed: number): SimulationResult {
  const rand = mulberry32(seed);
  const events: EngineEvent[] = [];

  const weathers: Weather[] = ["sol", "chuva", "vento", "neve", "nublado"];
  const weather = weathers[Math.floor(rand() * weathers.length)];

  const liveHome: LiveSide = { side: home, starters: [...home.starters], bench: [...home.bench], subsUsed: 0 };
  const liveAway: LiveSide = { side: away, starters: [...away.starters], bench: [...away.bench], subsUsed: 0 };

  events.push({
    minute: 0,
    event_type: "kickoff",
    description: `Começa a partida: ${home.team_name} x ${away.team_name}`,
    actor_creature_id: null,
    actor_team_id: null,
  });
  events.push({
    minute: 0,
    event_type: "weather",
    description: `Clima: ${WEATHER_LABEL[weather]}.`,
    actor_creature_id: null,
    actor_team_id: null,
  });

  const initialHomeIds = new Set(home.starters.map((s) => s.creature.id));
  const initialAwayIds = new Set(away.starters.map((s) => s.creature.id));

  for (let minute = 1; minute <= 90; minute++) {
    const H = computeStrength(liveHome);
    const A = computeStrength(liveAway);
    const chanceHome = (H.attack + 4) / 1900;
    const chanceAway = A.attack / 2100;

    processTeamChance(true, minute, liveHome, H, A, chanceHome, rand, events, weather);
    processTeamChance(false, minute, liveAway, A, H, chanceAway, rand, events, weather);

    // Cartão amarelo ~1,5%/min
    if (rand() < 0.015) {
      const live = rand() < 0.5 ? liveHome : liveAway;
      if (live.starters.length) {
        const actorSlot = pick(live.starters, rand);
        const actor = actorSlot.creature;
        events.push({
          minute,
          event_type: "yellow_card",
          description: `Cartão amarelo para ${actor.name} (${live.side.team_name}).`,
          actor_creature_id: actor.id,
          actor_team_id: live.side.team_id,
        });
      }
    }
    // Cartão vermelho ~0,25%/min (§4.5)
    if (rand() < 0.0025) {
      const live = rand() < 0.5 ? liveHome : liveAway;
      if (live.starters.length > 7) {
        const idx = Math.floor(rand() * live.starters.length);
        const outSlot = live.starters[idx];
        const actor = outSlot.creature;
        live.starters.splice(idx, 1);
        events.push({
          minute,
          event_type: "red_card",
          description: `CARTÃO VERMELHO! ${actor.name} está expulso (${live.side.team_name}).`,
          actor_creature_id: actor.id,
          actor_team_id: live.side.team_id,
        });
      }
    }
    // Lesão ~0,4%/min — tenta substituir automaticamente (§5.5)
    if (rand() < 0.004) {
      const live = rand() < 0.5 ? liveHome : liveAway;
      if (live.starters.length) {
        const outSlot = pick(live.starters, rand);
        const actor = outSlot.creature;
        events.push({
          minute,
          event_type: "injury",
          description: `${actor.name} sente uma lesão (${live.side.team_name}).`,
          actor_creature_id: actor.id,
          actor_team_id: live.side.team_id,
        });
        // Remove titular lesionado
        const i = live.starters.indexOf(outSlot);
        if (i >= 0) live.starters.splice(i, 1);
        trySubstitute(live, outSlot, minute, events);
      }
    }

    if (minute === 45) {
      const hs = events.filter((e) => e.event_type === "goal" && e.actor_team_id === home.team_id).length;
      const as = events.filter((e) => e.event_type === "goal" && e.actor_team_id === away.team_id).length;
      events.push({
        minute: 45,
        event_type: "halftime",
        description: `Fim do primeiro tempo — ${home.team_name} ${hs} x ${as} ${away.team_name}`,
        actor_creature_id: null,
        actor_team_id: null,
      });
      // Substituição estratégica: titular com energia baixa é sacado (por lado)
      for (const live of [liveHome, liveAway]) {
        const tired = live.starters
          .filter((s) => s.creature.energy < 40)
          .sort((a, b) => a.creature.energy - b.creature.energy);
        for (const outSlot of tired) {
          if (live.subsUsed >= 3 || !live.bench.length) break;
          const idx = live.starters.indexOf(outSlot);
          if (idx < 0) continue;
          live.starters.splice(idx, 1);
          trySubstitute(live, outSlot, 46, events);
        }
      }
    }
  }

  const hs = events.filter((e) => e.event_type === "goal" && e.actor_team_id === home.team_id).length;
  const as = events.filter((e) => e.event_type === "goal" && e.actor_team_id === away.team_id).length;
  events.push({
    minute: 90,
    event_type: "fulltime",
    description: `Fim de jogo — ${home.team_name} ${hs} x ${as} ${away.team_name}`,
    actor_creature_id: null,
    actor_team_id: null,
  });

  // Perda de energia por criatura utilizada (titular: 25, entrou do banco: 15)
  const energy_loss: Record<string, number> = {};
  const usedHome = new Set([...initialHomeIds, ...liveHome.starters.map((s) => s.creature.id)]);
  const usedAway = new Set([...initialAwayIds, ...liveAway.starters.map((s) => s.creature.id)]);
  for (const id of initialHomeIds) energy_loss[id] = 25;
  for (const id of initialAwayIds) energy_loss[id] = 25;
  // Reservas que entraram: usadas mas não estão no titular original
  for (const s of liveHome.starters) if (!initialHomeIds.has(s.creature.id)) energy_loss[s.creature.id] = 15;
  for (const s of liveAway.starters) if (!initialAwayIds.has(s.creature.id)) energy_loss[s.creature.id] = 15;

  const used_home_bench = [...usedHome].filter((id) => !initialHomeIds.has(id));
  const used_away_bench = [...usedAway].filter((id) => !initialAwayIds.has(id));

  return {
    home_score: hs,
    away_score: as,
    events,
    weather,
    energy_loss,
    starter_ids: [...initialHomeIds, ...initialAwayIds],
    used_bench_ids: [...used_home_bench, ...used_away_bench],
  };
}

function processTeamChance(
  isHome: boolean,
  minute: number,
  live: LiveSide,
  own: SideStrength,
  opp: SideStrength,
  chance: number,
  rand: () => number,
  events: EngineEvent[],
  weather: Weather,
) {
  if (rand() >= chance) return;
  if (!own.attackers.length || !opp.defenders.length) return;

  const finisher = pick(own.attackers, rand).creature;
  const defender = pick(opp.defenders, rand).creature;

  const bonusElem = elementalBonus(finisher.element, defender.element);
  const affinityRaw = finisher[AFFINITY_KEY[finisher.element]] as number;
  const affinityBonus = (affinityRaw || 0) / 100;
  const weatherBonus = WEATHER_BOOST[weather] === finisher.element ? 0.04 : 0;

  const homeAdv = isHome ? 4 : 0;
  let chanceGoal =
    (own.attack + homeAdv - opp.defense + 40) / 260 + bonusElem + affinityBonus + weatherBonus;
  if (chanceGoal < 0.07) chanceGoal = 0.07;

  const goalieSlot = opp.defenders.find((s) => s.role === "GOL");
  const goalie = goalieSlot?.creature;
  const elementalAdv = bonusElem > 0;
  const longShot = rand() < 0.2;
  const baseMeta: EngineEventMeta = {
    attacker: finisher.name,
    defender: defender.name,
    goalie: goalie?.name,
    team: live.side.team_name,
    element: finisher.element,
    defender_element: defender.element,
    elemental_advantage: elementalAdv,
    long_shot: longShot,
    is_danger: true,
  };

  if (rand() < chanceGoal) {
    events.push({
      minute,
      event_type: "goal",
      description: `GOL de ${finisher.name}! (${live.side.team_name})`,
      actor_creature_id: finisher.id,
      actor_team_id: live.side.team_id,
      meta: { ...baseMeta, outcome: "goal" },
    });
  } else {
    const roll = rand();
    if (roll < 0.5 && goalie) {
      events.push({
        minute,
        event_type: "shot_saved",
        description: `${finisher.name} arrisca, mas ${goalie.name} defende.`,
        actor_creature_id: finisher.id,
        actor_team_id: live.side.team_id,
        meta: { ...baseMeta, outcome: "save" },
      });
    } else if (roll < 0.8) {
      events.push({
        minute,
        event_type: "shot_saved",
        description: `${finisher.name} chuta para fora.`,
        actor_creature_id: finisher.id,
        actor_team_id: live.side.team_id,
        meta: { ...baseMeta, outcome: "miss" },
      });
    } else {
      events.push({
        minute,
        event_type: "shot_saved",
        description: `${defender.name} corta a jogada de ${finisher.name}.`,
        actor_creature_id: finisher.id,
        actor_team_id: live.side.team_id,
        meta: { ...baseMeta, outcome: "block" },
      });
    }
  }
}

// ---------- gerador CPU ----------

const CPU_PREFIXES = ["Falcão", "Lobo", "Trovão", "Sombra", "Fúria", "Cometa", "Chama", "Vaga", "Rocha", "Nevasca"];
const CPU_SUFFIXES = ["FC", "Atlético", "United", "Sporting", "Real", "Racing", "Selvagem", "Elemental"];
const ELS: Element[] = ["fogo", "agua", "terra", "ar", "gelo"];

export function generateCpuSide(seed: number, playerOverall: number): EngineSide {
  const rand = mulberry32(seed ^ 0x5f3759df);
  const name = `${pick(CPU_PREFIXES, rand)} ${pick(CPU_SUFFIXES, rand)}`;
  const target = Math.max(15, Math.min(95, playerOverall + Math.floor((rand() - 0.5) * 20)));
  return buildCpuSideCore(seed, target, name, `cpu-${seed}`);
}

export function generateCpuSideFor(seed: number, teamId: string, teamName: string, strength: number): EngineSide {
  return buildCpuSideCore(seed, strength, teamName, teamId);
}

function buildCpuSideCore(seed: number, target: number, teamName: string, teamId: string): EngineSide {
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const roles: SlotRole[] = ["GOL", "DEF", "DEF", "DEF", "DEF", "MEI", "MEI", "MEI", "MEI", "ATA", "ATA"];
  const benchRoles: SlotRole[] = ["GOL", "DEF", "MEI", "ATA", "MEI"];
  const buildSlot = (role: SlotRole, i: number, tag: string): EngineSlot => {
    const overall = Math.max(10, Math.min(99, Math.round(target + (rand() - 0.5) * 15)));
    const element = pick(ELS, rand);
    return {
      role,
      creature: {
        id: `cpu-${teamId}-${tag}-${i}`,
        name: `${pick(CPU_PREFIXES, rand)}${pick(CPU_SUFFIXES, rand)}`.replace(/\s+/g, ""),
        element,
        overall,
        physical: overall,
        energy: 100,
        affinity_fogo: element === "fogo" ? 7 : 1,
        affinity_agua: element === "agua" ? 7 : 1,
        affinity_terra: element === "terra" ? 7 : 1,
        affinity_ar: element === "ar" ? 7 : 1,
        affinity_gelo: element === "gelo" ? 7 : 1,
      },
    };
  };
  const starters = roles.map((r, i) => buildSlot(r, i, "s"));
  const bench = benchRoles.map((r, i) => buildSlot(r, i, "b"));
  return { team_id: teamId, team_name: teamName, starters, bench, strategy: "equilibrada" };
}
