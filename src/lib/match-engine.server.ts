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

// GDD — Táticas ao vivo (§4.7). Cada eixo é um inteiro de -2 a +2.
export interface Tactics {
  mentalidade: number;   // -2 defensivo … +2 ofensivo
  verticalidade: number; // -2 posse …    +2 direto
  pressao: number;       // -2 baixa …    +2 alta
  cortes: number;        // -2 leve …     +2 duro
}
export const NEUTRAL_TACTICS: Tactics = { mentalidade: 0, verticalidade: 0, pressao: 0, cortes: 0 };

export interface EngineSide {
  team_id: string;
  team_name: string;
  starters: EngineSlot[];
  bench: EngineSlot[]; // reservas por ordem
  strategy: "ofensiva" | "equilibrada" | "defensiva";
  tactics?: Tactics;
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

export type InjurySeverity = "leve" | "moderada" | "grave";

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
  injury_severity?: InjurySeverity;
  injury_matches?: number;
}

export interface EngineEvent {
  minute: number;
  event_type: EngineEventType;
  description: string;
  actor_creature_id: string | null;
  actor_team_id: string | null;
  meta?: EngineEventMeta;
}

export interface EngineInjury {
  creature_id: string;
  team_id: string;
  severity: InjurySeverity;
  matches: number;
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

const P_LESAO = 0.004; // 0,4% por minuto por time; sorteio base antes da vítima/fadiga.
const MAX_INJURIES_PER_TEAM = 2;

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

// Táticas ao vivo: efeito matemático sobre ataque/defesa/frequência de chances.
// mentalidade: +atk/-def   ·   verticalidade: mais chances, menor precisão
// pressao: +atk/+lesão/+cartão · cortes: +def/+cartão
function tacticsMod(t: Tactics | undefined) {
  const raw = t ?? NEUTRAL_TACTICS;
  const axis = (value: unknown): number => {
    const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
    return Math.max(-2, Math.min(2, n));
  };
  const T: Tactics = {
    mentalidade: axis(raw.mentalidade),
    verticalidade: axis(raw.verticalidade),
    pressao: axis(raw.pressao),
    cortes: axis(raw.cortes),
  };
  return {
    atk: T.mentalidade * 2 + T.pressao * 1,
    def: -T.mentalidade * 1 + T.cortes * 2,
    freq: 1 + T.verticalidade * 0.05,      // mult. na frequência de chances
    quality: 1 - T.verticalidade * 0.02,   // qualidade média (chute mais afoito)
    yellowMul: 1 + T.pressao * 0.3 + T.cortes * 0.5,
    injuryMul: 1 + Math.max(0, T.pressao) * 0.4,
  };
}

/**
 * GDD §4.6 — Fadiga aplicada como multiplicador sobre o overall efetivo.
 * A energia registrada NO INÍCIO da partida define a faixa; o motor não
 * degrada essa faixa durante os 90min (fadiga acumula entre partidas).
 *   70-100 → x1,00 (Pleno)
 *   50-69  → x0,95 (Levemente cansado)
 *   30-49  → x0,85 (Cansado)
 *   15-29  → x0,70 (Exausto)
 *    0-14  → x0,50 (Esgotado)
 */
export function energyMultiplier(energy: number): number {
  if (energy >= 70) return 1.0;
  if (energy >= 50) return 0.95;
  if (energy >= 30) return 0.85;
  if (energy >= 15) return 0.7;
  return 0.5;
}

export type FatigueState = "pleno" | "leve" | "cansado" | "exausto" | "esgotado";
export function fatigueState(energy: number): FatigueState {
  if (energy >= 70) return "pleno";
  if (energy >= 50) return "leve";
  if (energy >= 30) return "cansado";
  if (energy >= 15) return "exausto";
  return "esgotado";
}

function normalizedEnergy(energy: number | null | undefined): number {
  if (typeof energy !== "number" || !Number.isFinite(energy)) return 100;
  return Math.max(0, Math.min(100, energy));
}

function energyAdjusted(c: EngineCreature): number {
  return Math.max(10, Math.round(c.overall * energyMultiplier(normalizedEnergy(c.energy))));
}

// Multiplicador de risco de lesão por fadiga (GDD §Fadiga).
function injuryFatigueMult(energy: number | null | undefined): number {
  energy = normalizedEnergy(energy);
  if (energy >= 30) return 1.0;
  if (energy >= 15) return 2.0;
  return 3.0;
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
  const t = tacticsMod(live.side.tactics);
  return {
    attack: avg(attackers.map((s) => energyAdjusted(s.creature))) + mod.atk + t.atk,
    defense: avg(defenders.map((s) => energyAdjusted(s.creature))) + mod.def + t.def,
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
  // Lesões ocorridas nesta partida
  injuries: EngineInjury[];
}

export function simulate(home: EngineSide, away: EngineSide, seed: number): SimulationResult {
  const rand = mulberry32(seed);
  const events: EngineEvent[] = [];
  const injuries: EngineInjury[] = [];


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
  const injuriesByTeam = new Map<string, number>([
    [home.team_id, 0],
    [away.team_id, 0],
  ]);

  const tH = tacticsMod(home.tactics);
  const tA = tacticsMod(away.tactics);
  const yellowRate = 0.015 * ((tH.yellowMul + tA.yellowMul) / 2);
  const redRate = 0.0025 * ((tH.yellowMul + tA.yellowMul) / 2);

  for (let minute = 1; minute <= 90; minute++) {
    const H = computeStrength(liveHome);
    const A = computeStrength(liveAway);
    const chanceHome = ((H.attack + 4) / 600) * tH.freq;
    const chanceAway = (A.attack / 670) * tA.freq;

    processTeamChance(true, minute, liveHome, H, A, chanceHome, rand, events, weather, tH.quality);
    processTeamChance(false, minute, liveAway, A, H, chanceAway, rand, events, weather, tA.quality);

    // Cartão amarelo — modulado por pressão/cortes de ambos os lados
    if (rand() < yellowRate) {
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
    if (rand() < redRate) {
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
    // Lesão: UM sorteio base por minuto POR TIME (não por criatura).
    // Se acertar, escolhemos a vítima e só então aplicamos o multiplicador de fadiga dela.
    for (const live of [liveHome, liveAway] as const) {
      const teamInjuries = injuriesByTeam.get(live.side.team_id) ?? 0;
      if (teamInjuries >= MAX_INJURIES_PER_TEAM) continue;
      const candidates = live.starters;
      if (!candidates.length) continue;
      const outSlot = pick(candidates, rand);
      const actor = outSlot.creature;
      const tacticsInjuryMul = live === liveHome ? tH.injuryMul : tA.injuryMul;
      const fatigueMul = injuryFatigueMult(actor.energy);
      const injuryProbability = Math.min(1, P_LESAO * fatigueMul * tacticsInjuryMul);
      if (rand() >= injuryProbability) continue;
      console.log("[injury-diagnostic]", JSON.stringify({
        minute,
        source: "src/lib/match-engine.server.ts:simulate",
        team_id: live.side.team_id,
        team_name: live.side.team_name,
        probability: injuryProbability,
        base_probability: P_LESAO,
        fatigue_multiplier: fatigueMul,
        tactics_multiplier: tacticsInjuryMul,
        injuries_this_team: teamInjuries,
      }));
      // Sortear gravidade (§Lesões): 45% leve, 40% moderada, 15% grave.
      const rr = rand();
      let severity: InjurySeverity;
      let matches: number;
      if (rr < 0.45) { severity = "leve"; matches = 1; }
      else if (rr < 0.85) { severity = "moderada"; matches = 2 + Math.floor(rand() * 2); }
      else { severity = "grave"; matches = 4 + Math.floor(rand() * 2); }
      const sevLabel = severity === "leve" ? "leve" : severity === "moderada" ? "moderada" : "GRAVE";
      injuriesByTeam.set(live.side.team_id, teamInjuries + 1);
      injuries.push({ creature_id: actor.id, team_id: live.side.team_id, severity, matches });
      events.push({
        minute,
        event_type: "injury",
        description: `${actor.name} sofreu lesão ${sevLabel} (${matches} ${matches === 1 ? "partida" : "partidas"}) — ${live.side.team_name}.`,
        actor_creature_id: actor.id,
        actor_team_id: live.side.team_id,
        meta: { injury_severity: severity, injury_matches: matches },
      });
      const i = live.starters.indexOf(outSlot);
      if (i >= 0) live.starters.splice(i, 1);
      trySubstitute(live, outSlot, minute, events);
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
          if (live.subsUsed >= 5 || !live.bench.length) break;
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

  // Perda de energia por criatura utilizada. GDD/Fadiga: base 36 titular, 18 reserva
  // que entrou. Cada ponto de FÍSICO (0..100) reduz o desgaste em ~0,15% —
  // criatura 5★ (100) tem -15%. Fórmula: loss = base * (1 - physical/100 * 0.15).
  const energy_loss: Record<string, number> = {};
  const usedHome = new Set([...initialHomeIds, ...liveHome.starters.map((s) => s.creature.id)]);
  const usedAway = new Set([...initialAwayIds, ...liveAway.starters.map((s) => s.creature.id)]);
  const wearFactor = (physical: number) => Math.max(0.5, 1 - (physical / 100) * 0.15);
  const allSlots: EngineSlot[] = [
    ...home.starters, ...home.bench, ...away.starters, ...away.bench,
  ];
  const physById = new Map<string, number>(allSlots.map((s) => [s.creature.id, s.creature.physical ?? 40]));
  for (const id of initialHomeIds) energy_loss[id] = Math.round(36 * wearFactor(physById.get(id) ?? 40));
  for (const id of initialAwayIds) energy_loss[id] = Math.round(36 * wearFactor(physById.get(id) ?? 40));
  for (const s of liveHome.starters)
    if (!initialHomeIds.has(s.creature.id))
      energy_loss[s.creature.id] = Math.round(18 * wearFactor(s.creature.physical ?? 40));
  for (const s of liveAway.starters)
    if (!initialAwayIds.has(s.creature.id))
      energy_loss[s.creature.id] = Math.round(18 * wearFactor(s.creature.physical ?? 40));

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
    injuries,
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
  qualityMul: number = 1,
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
    ((own.attack + homeAdv - opp.defense + 40) / 260 + bonusElem + affinityBonus + weatherBonus) * qualityMul;
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

const ELS: Element[] = ["fogo", "agua", "terra", "ar", "gelo"];

// Bestiário mínimo necessário para nomes (species + epithets por elemento).
// `is_goalkeeper` permite restringir espécies de goleiro ao slot GOL e mantê-las
// fora de posições de linha (DEF/MEI/ATA) — evita "Alicanto atacante".
export interface EngineBestiary {
  species: { species: string; element: Element; is_goalkeeper: boolean }[];
  epithets: Record<Element, string[]>;
}

/**
 * Gera um lado da CPU com um NOME DE TIME EXPLÍCITO. Não há mais fallback de
 * nomes aleatórios ("Sombra United" etc.) — o chamador deve escolher um time
 * real do catálogo (WORLD_TEAMS) para amistoso/liga/copa.
 */
export function generateCpuSide(
  seed: number,
  playerOverall: number,
  teamName: string,
  bestiary?: EngineBestiary,
): EngineSide {
  const rand = mulberry32(seed ^ 0x5f3759df);
  const target = Math.max(15, Math.min(95, playerOverall + Math.floor((rand() - 0.5) * 20)));
  return buildCpuSideCore(seed, target, teamName, `cpu-${seed}`, bestiary);
}

export function generateCpuSideFor(
  seed: number, teamId: string, teamName: string, strength: number, bestiary?: EngineBestiary,
): EngineSide {
  return buildCpuSideCore(seed, strength, teamName, teamId, bestiary);
}

function creatureName(
  el: Element,
  role: SlotRole,
  rand: () => number,
  bestiary?: EngineBestiary,
): string {
  if (bestiary && bestiary.species.length) {
    // GOL usa apenas espécies de goleiro; linha exclui goleiros.
    const isGk = role === "GOL";
    const roleFiltered = bestiary.species.filter((s) => s.is_goalkeeper === isGk);
    const roleList = roleFiltered.length ? roleFiltered : bestiary.species;
    const pool = roleList.filter((s) => s.element === el);
    const list = pool.length ? pool : roleList;
    const sp = list[Math.floor(rand() * list.length)];
    const eps = bestiary.epithets[sp.element] ?? [];
    const ep = eps.length ? eps[Math.floor(rand() * eps.length)] : "";
    return ep ? `${sp.species} ${ep}` : sp.species;
  }
  // Sem bestiário: nome neutro por role (nunca inventa "clube").
  const tag = role === "GOL" ? "Goleiro" : role === "DEF" ? "Zagueiro" : role === "MEI" ? "Meia" : "Atacante";
  return `${tag} ${Math.floor(rand() * 900 + 100)}`;
}

function buildCpuSideCore(
  seed: number, target: number, teamName: string, teamId: string, bestiary?: EngineBestiary,
): EngineSide {
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
        name: creatureName(element, role, rand, bestiary),
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


