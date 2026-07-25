// Motor de partida — GDD §4-5 + CADEIA DE DUELOS.
//
// Cada lance perigoso é uma sequência de dois duelos individuais:
//   1) criar o lance   → chance por minuto vem da força ofensiva média
//   2) finalizador vs zagueiro (logística com k=24)
//   3) finalizador vs goleiro (goleiro +18 no rating)
// Rating efetivo = Overall × mult_fadiga × mult_elemental (por duelo).

export type Element = "fogo" | "agua" | "terra" | "ar" | "gelo";
export type SlotRole = "GOL" | "DEF" | "MEI" | "ATA";
export type Weather = "sol" | "chuva" | "vento" | "neve" | "nublado";

export interface EngineCreature {
  id: string;
  name: string;
  element: Element;
  overall: number;
  physical: number;
  energy: number;
  /** Moral 0..100 (default 50). Multiplica o rating (±10% no extremo). */
  morale?: number;
  /** Idade em anos. Sem valor → tratada como auge (24). */
  age?: number;
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

export interface Tactics {
  mentalidade: number;
  verticalidade: number;
  pressao: number;
  cortes: number;
}
export const NEUTRAL_TACTICS: Tactics = { mentalidade: 0, verticalidade: 0, pressao: 0, cortes: 0 };

export type Division = "bronze" | "prata" | "ouro" | "diamante" | "lendaria";

export interface EngineSide {
  team_id: string;
  team_name: string;
  starters: EngineSlot[];
  bench: EngineSlot[];
  strategy: "ofensiva" | "equilibrada" | "defensiva";
  tactics?: Tactics;
  /** Nível do Centro Médico (1–5). Reduz chance de lesão. Default 1. */
  medical_level?: number;
  /** Divisão do time. Normaliza a taxa de criação de lances. */
  division?: Division;
}


/** Multiplicador de CHANCE de lesão pelo Centro Médico. Nível 1 = 1.00 … Nível 5 = 0.50. */
export function medicalInjuryMult(level: number | undefined | null): number {
  const l = Math.max(1, Math.min(5, level ?? 1));
  return [1.0, 0.85, 0.70, 0.60, 0.50][l - 1];
}


export type EngineEventType =
  | "kickoff" | "goal" | "shot_saved" | "yellow_card" | "red_card"
  | "injury" | "substitution" | "halftime" | "fulltime" | "weather";

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

// ---------- constantes do motor ----------

const BEATS: Record<Element, Element> = {
  fogo: "gelo", gelo: "ar", ar: "terra", terra: "agua", agua: "fogo",
};

const WEATHER_BOOST: Record<Weather, Element | null> = {
  sol: "fogo", chuva: "agua", vento: "ar", neve: "gelo", nublado: null,
};

const WEATHER_LABEL: Record<Weather, string> = {
  sol: "Sol forte", chuva: "Chuva", vento: "Vento", neve: "Neve", nublado: "Nublado",
};

const K_DUEL = 24;              // sensibilidade do duelo logístico
const GOALIE_BONUS = 20;        // vantagem do goleiro no duelo 2
const HOME_ATK_BONUS = 4;       // fator casa somado à força ofensiva
const CHANCE_RATE = 0.09;       // taxa-base de criação de lance por minuto (normalizada pela divisão)

/** OVR médio de cada divisão — usado para normalizar a chance de lance por minuto. */
const DIVISION_OVR: Record<Division, number> = {
  bronze: 33, prata: 44, ouro: 55, diamante: 64, lendaria: 72,
};

/** OVR de referência do time. Usa a divisão quando conhecida; senão infere pelo attackAvg. */
function referenceOvr(side: EngineSide, attackAvg: number): number {
  if (side.division) return DIVISION_OVR[side.division];
  // Fallback: aproxima ao balde de divisão mais próximo do attackAvg.
  const buckets: number[] = [33, 44, 55, 64, 72];
  let best = buckets[0], d = Infinity;
  for (const b of buckets) { const dd = Math.abs(b - attackAvg); if (dd < d) { d = dd; best = b; } }
  return best;
}

const P_LESAO = 0.004;
const MAX_INJURIES_PER_TEAM = 2;


// Elemental multiplicativo, aplicado DUELO A DUELO (não mais bônus de time).
function elementalMult(attacker: Element, defender: Element): number {
  if (BEATS[attacker] === defender) return 1.06;
  if (BEATS[defender] === attacker) return 0.95;
  return 1.0;
}

// Estratégia (Mentalidade) — GDD: multiplica chance de lance (x0.70..x1.30)
// e altera rating dos defensores adversários (+8 defensiva / -8 ofensiva).
function strategyMod(s: EngineSide["strategy"]): { atk: number; def: number; freqMul: number } {
  if (s === "ofensiva") return { atk: 8, def: -8, freqMul: 1.30 };
  if (s === "defensiva") return { atk: -8, def: 8, freqMul: 0.70 };
  return { atk: 0, def: 0, freqMul: 1.0 };
}


// Táticas ao vivo:
//   mentalidade → +atk / +def (defende mais quando ofensiva)  · multiplica chance
//   verticalidade → mais chances, menor precisão · soma no duelo 2
//   pressao → +atk / +cartão / +lesão / +chance frequência
//   cortes → +def / +cartão
function tacticsMod(t: Tactics | undefined) {
  const raw = t ?? NEUTRAL_TACTICS;
  const axis = (v: unknown): number => {
    const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
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
    def: T.mentalidade * 1 + T.cortes * 2,
    freq: 1 + T.verticalidade * 0.05 + T.mentalidade * 0.03 + Math.max(0, T.pressao) * 0.03,
    vertical2: T.verticalidade * 1.5,   // soma no duelo 2 (chute mais direto)
    yellowMul: 1 + T.pressao * 0.3 + T.cortes * 0.5,
    injuryMul: 1 + Math.max(0, T.pressao) * 0.4,
  };
}

/** Piso de energia v2: nunca cai abaixo de 30 em lugar nenhum. */
export const ENERGY_FLOOR = 30;

/** Escala contínua: >=70 → 1.00; senão 0.50 + 0.50 * (e-30)/40. */
export function energyMultiplier(energy: number): number {
  const e = Math.max(ENERGY_FLOOR, Math.min(100, Number.isFinite(energy) ? energy : 100));
  if (e >= 70) return 1.0;
  return 0.5 + 0.5 * (e - 30) / 40;
}

export type FatigueState = "pleno" | "leve" | "cansado" | "muito_cansado" | "exausto";
export function fatigueState(energy: number): FatigueState {
  const e = Math.max(ENERGY_FLOOR, Math.min(100, Number.isFinite(energy) ? energy : 100));
  if (e >= 70) return "pleno";
  if (e >= 60) return "leve";
  if (e >= 50) return "cansado";
  if (e >= 40) return "muito_cansado";
  return "exausto";
}

function normalizedEnergy(e: number | null | undefined): number {
  if (typeof e !== "number" || !Number.isFinite(e)) return 100;
  return Math.max(ENERGY_FLOOR, Math.min(100, e));
}

function fatMult(c: EngineCreature): number {
  return energyMultiplier(normalizedEnergy(c.energy));
}

function moraleMult(c: EngineCreature): number {
  const m = typeof c.morale === "number" && Number.isFinite(c.morale)
    ? Math.max(0, Math.min(100, c.morale)) : 50;
  if (m >= 80) return 1.10;
  if (m >= 60) return 1.05;
  if (m >= 40) return 1.00;
  if (m >= 20) return 0.95;
  return 0.90;
}

function ratingBase(c: EngineCreature): number {
  return c.overall * fatMult(c) * moraleMult(c);
}

function ratingVs(attacker: EngineCreature, opponent: EngineCreature): number {
  return ratingBase(attacker) * elementalMult(attacker.element, opponent.element);
}

function logistic(diff: number): number {
  return 1 / (1 + Math.exp(-diff / K_DUEL));
}

/** Risco de lesão por fadiga — faixas ajustadas ao piso 30. */
function injuryFatigueMult(energy: number | null | undefined): number {
  const e = normalizedEnergy(energy);
  if (e >= 50) return 1.0;
  if (e >= 40) return 1.5;
  return 2.0;
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

// ---------- estado vivo ----------

interface LiveSide {
  side: EngineSide;
  starters: EngineSlot[];
  bench: EngineSlot[];
  subsUsed: number;
}

interface SideView {
  attackers: EngineSlot[]; // MEI + ATA
  defenders: EngineSlot[]; // DEF
  goalie: EngineSlot | undefined;
  attackAvg: number;       // média de rating base (fadiga aplicada) + strat + tática
}

function computeView(live: LiveSide): SideView {
  const attackers = live.starters.filter((s) => s.role === "MEI" || s.role === "ATA");
  const defenders = live.starters.filter((s) => s.role === "DEF");
  const goalie = live.starters.find((s) => s.role === "GOL");
  const mod = strategyMod(live.side.strategy);
  const t = tacticsMod(live.side.tactics);
  const attackAvg = avg(attackers.map((s) => ratingBase(s.creature))) + mod.atk + t.atk;
  return { attackers, defenders, goalie, attackAvg };
}

function trySubstitute(
  live: LiveSide, outSlot: EngineSlot, minute: number, events: EngineEvent[],
): boolean {
  if (live.subsUsed >= 5 || !live.bench.length) return false;
  const candidates = [...live.bench].sort((a, b) => {
    const pA = a.role === outSlot.role ? 0 : 1;
    const pB = b.role === outSlot.role ? 0 : 1;
    if (pA !== pB) return pA - pB;
    return b.creature.energy - a.creature.energy;
  });
  const inSlot = candidates[0];
  const idxBench = live.bench.indexOf(inSlot);
  const idxStart = live.starters.indexOf(outSlot);
  if (idxBench < 0 || idxStart < 0) return false;
  live.starters[idxStart] = { role: outSlot.role, creature: inSlot.creature };
  live.bench.splice(idxBench, 1);
  live.subsUsed += 1;
  events.push({
    minute, event_type: "substitution",
    description: `Substituição em ${live.side.team_name}: entra ${inSlot.creature.name}, sai ${outSlot.creature.name}.`,
    actor_creature_id: inSlot.creature.id,
    actor_team_id: live.side.team_id,
  });
  return true;
}

// ---------- resultado ----------

export interface SimulationResult {
  home_score: number;
  away_score: number;
  events: EngineEvent[];
  weather: Weather;
  energy_loss: Record<string, number>;
  starter_ids: string[];
  used_bench_ids: string[];
  injuries: EngineInjury[];
  /** Gols por creature_id (para atualização de moral). */
  goals_by_creature: Record<string, number>;
}

export function persistableSimulationEvents(result: SimulationResult): EngineEvent[] {
  const newInjuries = new Map<string, number>();
  for (const injury of result.injuries) {
    const key = `${injury.team_id}:${injury.creature_id}`;
    newInjuries.set(key, (newInjuries.get(key) ?? 0) + 1);
  }
  return result.events.filter((e) => {
    if (e.event_type !== "injury") return true;
    if (!e.actor_team_id || !e.actor_creature_id) return false;
    const key = `${e.actor_team_id}:${e.actor_creature_id}`;
    const remaining = newInjuries.get(key) ?? 0;
    if (remaining <= 0) return false;
    newInjuries.set(key, remaining - 1);
    return true;
  });
}

// ---------- resolução de lance (cadeia de duelos) ----------

function resolveChance(
  isHome: boolean, minute: number,
  own: SideView, opp: SideView,
  live: LiveSide, oppTact: ReturnType<typeof tacticsMod>,
  oppMod: ReturnType<typeof strategyMod>,
  rand: () => number, events: EngineEvent[], weather: Weather,
) {
  if (!own.attackers.length || !opp.defenders.length) return;

  const finisher = pick(own.attackers, rand).creature;
  const defender = pick(opp.defenders, rand).creature;
  const goalieSlot = opp.goalie;
  const goalie = goalieSlot?.creature;

  const weatherBoostEl = WEATHER_BOOST[weather];
  const weatherMul = weatherBoostEl === finisher.element ? 1.03 : 1.0;

  // DUELO 1 — finalizador vs zagueiro
  const finVsDef = ratingVs(finisher, defender) * weatherMul;
  const defRating = ratingBase(defender) + oppTact.def + oppMod.def;
  const pPass = logistic(finVsDef - defRating);


  const elementalAdv = BEATS[finisher.element] === defender.element;
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

  if (rand() >= pPass) {
    // Cortado pelo zagueiro
    events.push({
      minute, event_type: "shot_saved",
      description: `${defender.name} corta a jogada de ${finisher.name}.`,
      actor_creature_id: finisher.id,
      actor_team_id: live.side.team_id,
      meta: { ...baseMeta, outcome: "block" },
    });
    return;
  }

  if (!goalie) {
    // Sem goleiro (evento raro pós-vermelho) — passa direto
    events.push({
      minute, event_type: "goal",
      description: `GOL de ${finisher.name}! (${live.side.team_name})`,
      actor_creature_id: finisher.id,
      actor_team_id: live.side.team_id,
      meta: { ...baseMeta, outcome: "goal" },
    });
    return;
  }

  // DUELO 2 — finalizador vs goleiro
  const finVsGk = ratingVs(finisher, goalie) * weatherMul;
  const gkRating = ratingBase(goalie) + GOALIE_BONUS;
  const ownTact = tacticsMod(live.side.tactics);
  const pGoal = logistic(finVsGk + ownTact.vertical2 - gkRating);

  if (rand() < pGoal) {
    events.push({
      minute, event_type: "goal",
      description: `GOL de ${finisher.name}! (${live.side.team_name})`,
      actor_creature_id: finisher.id,
      actor_team_id: live.side.team_id,
      meta: { ...baseMeta, outcome: "goal" },
    });
  } else {
    const roll = rand();
    if (roll < 0.6) {
      events.push({
        minute, event_type: "shot_saved",
        description: `${finisher.name} arrisca, mas ${goalie.name} defende.`,
        actor_creature_id: finisher.id,
        actor_team_id: live.side.team_id,
        meta: { ...baseMeta, outcome: "save" },
      });
    } else {
      events.push({
        minute, event_type: "shot_saved",
        description: `${finisher.name} chuta para fora.`,
        actor_creature_id: finisher.id,
        actor_team_id: live.side.team_id,
        meta: { ...baseMeta, outcome: "miss" },
      });
    }
  }
}

// ---------- simulate ----------

export function simulate(home: EngineSide, away: EngineSide, seed: number): SimulationResult {
  const rand = mulberry32(seed);
  const events: EngineEvent[] = [];
  const injuries: EngineInjury[] = [];

  const weathers: Weather[] = ["sol", "chuva", "vento", "neve", "nublado"];
  const weather = weathers[Math.floor(rand() * weathers.length)];

  const liveHome: LiveSide = { side: home, starters: [...home.starters], bench: [...home.bench], subsUsed: 0 };
  const liveAway: LiveSide = { side: away, starters: [...away.starters], bench: [...away.bench], subsUsed: 0 };

  events.push({
    minute: 0, event_type: "kickoff",
    description: `Começa a partida: ${home.team_name} x ${away.team_name}`,
    actor_creature_id: null, actor_team_id: null,
  });
  events.push({
    minute: 0, event_type: "weather",
    description: `Clima: ${WEATHER_LABEL[weather]}.`,
    actor_creature_id: null, actor_team_id: null,
  });

  const initialHomeIds = new Set(home.starters.map((s) => s.creature.id));
  const initialAwayIds = new Set(away.starters.map((s) => s.creature.id));
  const injuriesByTeam = new Map<string, number>([[home.team_id, 0], [away.team_id, 0]]);

  const tH = tacticsMod(home.tactics);
  const tA = tacticsMod(away.tactics);
  const sH = strategyMod(home.strategy);
  const sA = strategyMod(away.strategy);
  // Pressão de ambos os lados eleva o ritmo do jogo dos dois times.
  const pressureFreq = 1 + Math.max(0, (tH.injuryMul - 1) + (tA.injuryMul - 1)) * 0.2;
  const yellowRate = 0.015 * ((tH.yellowMul + tA.yellowMul) / 2);
  const redRate = 0.0025 * ((tH.yellowMul + tA.yellowMul) / 2);

  for (let minute = 1; minute <= 90; minute++) {
    const H = computeView(liveHome);
    const A = computeView(liveAway);

    const chanceHome = CHANCE_RATE * ((H.attackAvg + HOME_ATK_BONUS) / referenceOvr(home, H.attackAvg)) * tH.freq * sH.freqMul * pressureFreq;
    const chanceAway = CHANCE_RATE * (A.attackAvg / referenceOvr(away, A.attackAvg)) * tA.freq * sA.freqMul * pressureFreq;


    if (rand() < chanceHome) resolveChance(true, minute, H, A, liveHome, tA, sA, rand, events, weather);
    if (rand() < chanceAway) resolveChance(false, minute, A, H, liveAway, tH, sH, rand, events, weather);


    // Cartões
    if (rand() < yellowRate) {
      const live = rand() < 0.5 ? liveHome : liveAway;
      if (live.starters.length) {
        const actor = pick(live.starters, rand).creature;
        events.push({
          minute, event_type: "yellow_card",
          description: `Cartão amarelo para ${actor.name} (${live.side.team_name}).`,
          actor_creature_id: actor.id, actor_team_id: live.side.team_id,
        });
      }
    }
    if (rand() < redRate) {
      const live = rand() < 0.5 ? liveHome : liveAway;
      if (live.starters.length > 7) {
        const idx = Math.floor(rand() * live.starters.length);
        const outSlot = live.starters[idx];
        const actor = outSlot.creature;
        live.starters.splice(idx, 1);
        events.push({
          minute, event_type: "red_card",
          description: `CARTÃO VERMELHO! ${actor.name} está expulso (${live.side.team_name}).`,
          actor_creature_id: actor.id, actor_team_id: live.side.team_id,
        });
      }
    }

    // Lesões — UM sorteio por time por minuto
    for (const live of [liveHome, liveAway] as const) {
      const count = injuriesByTeam.get(live.side.team_id) ?? 0;
      if (count >= MAX_INJURIES_PER_TEAM) continue;
      const cands = live.starters;
      if (!cands.length) continue;
      const outSlot = pick(cands, rand);
      const actor = outSlot.creature;
      const tMul = live === liveHome ? tH.injuryMul : tA.injuryMul;
      const fMul = injuryFatigueMult(actor.energy);
      const mMul = medicalInjuryMult(live.side.medical_level);
      const p = Math.min(1, P_LESAO * fMul * tMul * mMul);
      if (rand() >= p) continue;

      const rr = rand();
      let severity: InjurySeverity; let matches: number;
      if (rr < 0.45) { severity = "leve"; matches = 1; }
      else if (rr < 0.85) { severity = "moderada"; matches = 2 + Math.floor(rand() * 2); }
      else { severity = "grave"; matches = 4 + Math.floor(rand() * 2); }
      const sevLabel = severity === "grave" ? "grave" : severity === "moderada" ? "moderada" : "leve";
      injuriesByTeam.set(live.side.team_id, count + 1);
      injuries.push({ creature_id: actor.id, team_id: live.side.team_id, severity, matches });
      events.push({
        minute, event_type: "injury",
        description: `${actor.name} sentiu e precisa sair! Lesão ${sevLabel} — fora por ${matches} ${matches === 1 ? "partida" : "partidas"} (${live.side.team_name}).`,
        actor_creature_id: actor.id, actor_team_id: live.side.team_id,
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
        minute: 45, event_type: "halftime",
        description: `Fim do primeiro tempo — ${home.team_name} ${hs} x ${as} ${away.team_name}`,
        actor_creature_id: null, actor_team_id: null,
      });
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
    minute: 90, event_type: "fulltime",
    description: `Fim de jogo — ${home.team_name} ${hs} x ${as} ${away.team_name}`,
    actor_creature_id: null, actor_team_id: null,
  });

  // ---------- Fadiga v3: desgaste POR EVENTO (não por minuto) ----------
  // Base por resultado (só quem jogou): V=-3, E=-4, D=-5.
  // Pressão: alta -2 extra, baixa poupa 1. Cartões: amarelo -5, vermelho -10.
  // Lesão: leve/1=-4, moderada/2=-7, moderada/3=-15, grave/4=-20, grave/5=-25.
  const energy_loss: Record<string, number> = {};
  const usedHome = new Set([...initialHomeIds, ...liveHome.starters.map((s) => s.creature.id)]);
  const usedAway = new Set([...initialAwayIds, ...liveAway.starters.map((s) => s.creature.id)]);

  const outcomeLoss = (isHome: boolean): number => {
    if (hs === as) return 4;
    const won = isHome ? hs > as : as > hs;
    return won ? 3 : 5;
  };
  const pressureAdj = (t: Tactics | undefined): number => {
    const p = t?.pressao ?? 0;
    if (p >= 1) return 2;      // Pressão alta: -2 extra
    if (p <= -1) return -1;    // Pressão baixa: poupa 1
    return 0;
  };
  const homeBase = outcomeLoss(true) + pressureAdj(home.tactics);
  const awayBase = outcomeLoss(false) + pressureAdj(away.tactics);

  // Toda criatura que jogou (titular do início OU reserva que entrou) sofre o base.
  for (const id of usedHome) energy_loss[id] = (energy_loss[id] ?? 0) + homeBase;
  for (const id of usedAway) energy_loss[id] = (energy_loss[id] ?? 0) + awayBase;

  // Cartões cumulativos.
  for (const e of events) {
    if (!e.actor_creature_id) continue;
    if (e.event_type === "yellow_card") {
      energy_loss[e.actor_creature_id] = (energy_loss[e.actor_creature_id] ?? 0) + 5;
    } else if (e.event_type === "red_card") {
      energy_loss[e.actor_creature_id] = (energy_loss[e.actor_creature_id] ?? 0) + 10;
    }
  }

  // Lesões: custo fisiológico único (além da indisponibilidade).
  const injuryDrain = (sev: InjurySeverity, matches: number): number => {
    if (sev === "leve") return 4;
    if (sev === "moderada") return matches >= 3 ? 15 : 7;
    return matches >= 5 ? 25 : 20; // grave
  };
  for (const inj of injuries) {
    energy_loss[inj.creature_id] =
      (energy_loss[inj.creature_id] ?? 0) + injuryDrain(inj.severity, inj.matches);
  }

  const used_home_bench = [...usedHome].filter((id) => !initialHomeIds.has(id));
  const used_away_bench = [...usedAway].filter((id) => !initialAwayIds.has(id));

  const goals_by_creature: Record<string, number> = {};
  for (const e of events) {
    if (e.event_type === "goal" && e.actor_creature_id) {
      goals_by_creature[e.actor_creature_id] = (goals_by_creature[e.actor_creature_id] ?? 0) + 1;
    }
  }

  return {
    home_score: hs, away_score: as, events, weather, energy_loss,
    starter_ids: [...initialHomeIds, ...initialAwayIds],
    used_bench_ids: [...used_home_bench, ...used_away_bench],
    injuries,
    goals_by_creature,
  };
}

// ---------- simulação rápida (só placar) + odds ----------

/**
 * Simulação rápida: mesma lógica de duelos, sem gerar eventos, narração,
 * cartões, lesões nem substituições. Usada para cálculo de odds.
 */
export function simulateFast(home: EngineSide, away: EngineSide, seed: number): { home_score: number; away_score: number } {
  const rand = mulberry32(seed);
  const weathers: Weather[] = ["sol", "chuva", "vento", "neve", "nublado"];
  const weather = weathers[Math.floor(rand() * weathers.length)];

  const H0 = viewFromSide(home);
  const A0 = viewFromSide(away);
  const tH = tacticsMod(home.tactics);
  const tA = tacticsMod(away.tactics);
  const sH = strategyMod(home.strategy);
  const sA = strategyMod(away.strategy);
  const pressureFreq = 1 + Math.max(0, (tH.injuryMul - 1) + (tA.injuryMul - 1)) * 0.2;

  let hs = 0, as = 0;
  const chanceHome = CHANCE_RATE * ((H0.attackAvg + HOME_ATK_BONUS) / referenceOvr(home, H0.attackAvg)) * tH.freq * sH.freqMul * pressureFreq;
  const chanceAway = CHANCE_RATE * (A0.attackAvg / referenceOvr(away, A0.attackAvg)) * tA.freq * sA.freqMul * pressureFreq;


  for (let m = 1; m <= 90; m++) {
    if (rand() < chanceHome && fastGoal(H0, A0, home, tA, sA, rand, weather, true)) hs++;
    if (rand() < chanceAway && fastGoal(A0, H0, away, tH, sH, rand, weather, false)) as++;
  }
  return { home_score: hs, away_score: as };
}

function fastGoal(
  own: SideView, opp: SideView, ownSide: EngineSide,
  oppTact: ReturnType<typeof tacticsMod>,
  oppMod: ReturnType<typeof strategyMod>,
  rand: () => number, weather: Weather, _isHome: boolean,
): boolean {
  if (!own.attackers.length || !opp.defenders.length) return false;
  const finisher = pick(own.attackers, rand).creature;
  const defender = pick(opp.defenders, rand).creature;
  const goalie = opp.goalie?.creature;
  const wMul = WEATHER_BOOST[weather] === finisher.element ? 1.03 : 1.0;

  const finVsDef = ratingVs(finisher, defender) * wMul;
  const defRating = ratingBase(defender) + oppTact.def + oppMod.def;
  if (rand() >= logistic(finVsDef - defRating)) return false;
  if (!goalie) return true;

  const finVsGk = ratingVs(finisher, goalie) * wMul;
  const gkRating = ratingBase(goalie) + GOALIE_BONUS;
  const ownT = tacticsMod(ownSide.tactics);
  return rand() < logistic(finVsGk + ownT.vertical2 - gkRating);
}


function viewFromSide(side: EngineSide): SideView {
  const attackers = side.starters.filter((s) => s.role === "MEI" || s.role === "ATA");
  const defenders = side.starters.filter((s) => s.role === "DEF");
  const goalie = side.starters.find((s) => s.role === "GOL");
  const mod = strategyMod(side.strategy);
  const t = tacticsMod(side.tactics);
  const attackAvg = avg(attackers.map((s) => ratingBase(s.creature))) + mod.atk + t.atk;
  return { attackers, defenders, goalie, attackAvg };
}

export interface OddsResult {
  home_win: number;
  draw: number;
  away_win: number;
  samples: number;
  avg_home_goals: number;
  avg_away_goals: number;
}

/**
 * Roda `samples` simulações rápidas e devolve % de vitória do mandante,
 * empate e vitória do visitante. Não gera eventos nem narração.
 */
export function computeOdds(home: EngineSide, away: EngineSide, seed: number, samples = 500): OddsResult {
  let hw = 0, dr = 0, aw = 0, gh = 0, ga = 0;
  for (let i = 0; i < samples; i++) {
    const r = simulateFast(home, away, seed + i * 2654435761);
    gh += r.home_score; ga += r.away_score;
    if (r.home_score > r.away_score) hw++;
    else if (r.home_score < r.away_score) aw++;
    else dr++;
  }
  // Piso 3% / teto 85% em cada resultado (incerteza real do futebol),
  // depois normaliza para somar 100%.
  const MIN = 0.03, MAX = 0.85;
  const raw = [hw / samples, dr / samples, aw / samples];
  const clamped = raw.map((p) => Math.max(MIN, Math.min(MAX, p)));
  const sum = clamped[0] + clamped[1] + clamped[2];
  const [home_win, draw, away_win] = clamped.map((p) => p / sum);
  return {
    home_win,
    draw,
    away_win,
    samples,
    avg_home_goals: gh / samples,
    avg_away_goals: ga / samples,
  };
}


// ---------- análise pré-partida ----------

export interface PrognosticAlert {
  kind: "sector_tired" | "exhausted_starter" | "elemental_edge" | "quality_gap" | "elemental_weak";
  side: "home" | "away";
  message: string;
  positive: boolean;
}

export interface KeyDuel {
  attacker: { id: string; name: string; overall: number; energy: number; element: Element };
  defender: { id: string; name: string; overall: number; energy: number; element: Element };
  side: "home" | "away";
  role_defender: SlotRole;
  favor: "attacker" | "defender" | "even";
  p_attacker: number;
}

export interface PrognosticAnalysis {
  odds: OddsResult;
  alerts: PrognosticAlert[];
  key_duels: KeyDuel[];
  sector_summary: {
    home: { def: number; mei: number; ata: number; def_energy: number; mei_energy: number; ata_energy: number };
    away: { def: number; mei: number; ata: number; def_energy: number; mei_energy: number; ata_energy: number };
  };
}

function sectorAvgs(side: EngineSide) {
  const def = side.starters.filter((s) => s.role === "DEF" || s.role === "GOL");
  const mei = side.starters.filter((s) => s.role === "MEI");
  const ata = side.starters.filter((s) => s.role === "ATA");
  const oa = (arr: EngineSlot[], k: keyof EngineCreature) =>
    arr.length ? avg(arr.map((s) => (s.creature[k] as number) ?? 0)) : 0;
  return {
    def: oa(def, "overall"),
    mei: oa(mei, "overall"),
    ata: oa(ata, "overall"),
    def_energy: oa(def, "energy"),
    mei_energy: oa(mei, "energy"),
    ata_energy: oa(ata, "energy"),
  };
}

export function analyzeMatchup(home: EngineSide, away: EngineSide, seed: number, samples = 500): PrognosticAnalysis {
  const odds = computeOdds(home, away, seed, samples);
  const alerts: PrognosticAlert[] = [];
  const secH = sectorAvgs(home);
  const secA = sectorAvgs(away);

  const pushSectorTired = (side: "home" | "away", label: string, energy: number, own: boolean) => {
    if (energy < 50 && energy > 0) {
      alerts.push({
        kind: "sector_tired", side,
        message: own
          ? `Sua ${label} está cansada (média ${Math.round(energy)}%)`
          : `${label} do adversário está cansada (${Math.round(energy)}%)`,
        positive: !own,
      });
    }
  };
  pushSectorTired("home", "defesa", secH.def_energy, true);
  pushSectorTired("home", "meia", secH.mei_energy, true);
  pushSectorTired("home", "linha ofensiva", secH.ata_energy, true);
  pushSectorTired("away", "defesa", secA.def_energy, false);
  pushSectorTired("away", "meia", secA.mei_energy, false);
  pushSectorTired("away", "linha ofensiva", secA.ata_energy, false);

  const exhaustedHome = home.starters.filter((s) => (s.creature.energy ?? 100) < 30);
  if (exhaustedHome.length) {
    alerts.push({
      kind: "exhausted_starter", side: "home",
      message: `${exhaustedHome.length} titular${exhaustedHome.length > 1 ? "es" : ""} exaust${exhaustedHome.length > 1 ? "os" : "o"} escalad${exhaustedHome.length > 1 ? "os" : "o"} (${exhaustedHome.map((s) => s.creature.name).join(", ")})`,
      positive: false,
    });
  }

  // Vantagem elemental do ataque (MEI+ATA) contra defesa adversária (DEF+GOL)
  const oppDef = away.starters.filter((s) => s.role === "DEF" || s.role === "GOL");
  const oppAtk = away.starters.filter((s) => s.role === "MEI" || s.role === "ATA");
  const myAtk = home.starters.filter((s) => s.role === "MEI" || s.role === "ATA");
  const myDef = home.starters.filter((s) => s.role === "DEF" || s.role === "GOL");
  const countAdv = (atk: EngineSlot[], def: EngineSlot[]) =>
    atk.filter((a) => def.some((d) => BEATS[a.creature.element] === d.creature.element)).length;
  const advOwn = countAdv(myAtk, oppDef);
  const advOpp = countAdv(oppAtk, myDef);
  if (advOwn >= 3) alerts.push({ kind: "elemental_edge", side: "home", positive: true, message: `Seu ataque tem vantagem elemental (${advOwn} atacantes)` });
  if (advOpp >= 3) alerts.push({ kind: "elemental_weak", side: "away", positive: false, message: `Ataque adversário tem vantagem elemental sobre sua defesa (${advOpp})` });

  // Gap de qualidade
  const gap = (a: number, b: number) => Math.abs(a - b) >= 10;
  if (gap(secH.def, secA.ata)) alerts.push({
    kind: "quality_gap", side: secH.def > secA.ata ? "home" : "away", positive: secH.def > secA.ata,
    message: secH.def > secA.ata
      ? `Sua defesa é bem superior ao ataque deles (${Math.round(secH.def)} vs ${Math.round(secA.ata)})`
      : `Ataque adversário é bem superior à sua defesa (${Math.round(secA.ata)} vs ${Math.round(secH.def)})`,
  });
  if (gap(secH.ata, secA.def)) alerts.push({
    kind: "quality_gap", side: secH.ata > secA.def ? "home" : "away", positive: secH.ata > secA.def,
    message: secH.ata > secA.def
      ? `Seu ataque supera a defesa deles (${Math.round(secH.ata)} vs ${Math.round(secA.def)})`
      : `Defesa adversária supera seu ataque (${Math.round(secA.def)} vs ${Math.round(secH.ata)})`,
  });

  // Confrontos-chave: seu melhor atacante vs melhor zagueiro deles + goleiro deles
  const bestOwnAtk = [...myAtk].sort((a, b) => ratingBase(b.creature) - ratingBase(a.creature))[0];
  const bestOppDef = [...away.starters.filter((s) => s.role === "DEF")]
    .sort((a, b) => ratingBase(b.creature) - ratingBase(a.creature))[0];
  const oppGoalie = away.starters.find((s) => s.role === "GOL");
  const bestOppAtk = [...oppAtk].sort((a, b) => ratingBase(b.creature) - ratingBase(a.creature))[0];
  const bestOwnDef = [...home.starters.filter((s) => s.role === "DEF")]
    .sort((a, b) => ratingBase(b.creature) - ratingBase(a.creature))[0];

  const key_duels: KeyDuel[] = [];
  const makeDuel = (atk: EngineSlot | undefined, def: EngineSlot | undefined, side: "home" | "away", role: SlotRole, gkBonus = 0): KeyDuel | null => {
    if (!atk || !def) return null;
    const a = ratingVs(atk.creature, def.creature);
    const d = ratingBase(def.creature) + gkBonus;
    const p = logistic(a - d);
    return {
      attacker: { id: atk.creature.id, name: atk.creature.name, overall: atk.creature.overall, energy: atk.creature.energy, element: atk.creature.element },
      defender: { id: def.creature.id, name: def.creature.name, overall: def.creature.overall, energy: def.creature.energy, element: def.creature.element },
      side, role_defender: role, favor: p > 0.55 ? "attacker" : p < 0.45 ? "defender" : "even",
      p_attacker: p,
    };
  };
  const d1 = makeDuel(bestOwnAtk, bestOppDef, "home", "DEF");
  const d2 = makeDuel(bestOwnAtk, oppGoalie, "home", "GOL", GOALIE_BONUS);
  const d3 = makeDuel(bestOppAtk, bestOwnDef, "away", "DEF");
  for (const d of [d1, d2, d3]) if (d) key_duels.push(d);

  return {
    odds, alerts, key_duels,
    sector_summary: { home: secH, away: secA },
  };
}

// ---------- gerador CPU ----------

const ELS: Element[] = ["fogo", "agua", "terra", "ar", "gelo"];

export interface EngineBestiary {
  species: { species: string; element: Element; is_goalkeeper: boolean }[];
  epithets: Record<Element, string[]>;
}

export function generateCpuSide(
  seed: number, playerOverall: number, teamName: string, bestiary?: EngineBestiary,
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

function creatureName(el: Element, role: SlotRole, rand: () => number, bestiary?: EngineBestiary): string {
  if (bestiary && bestiary.species.length) {
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
        element, overall, physical: overall, energy: 100,
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
  // Inferir divisão a partir do OVR alvo (para normalização de chances).
  const buckets: [number, Division][] = [[33,"bronze"],[44,"prata"],[55,"ouro"],[64,"diamante"],[72,"lendaria"]];
  let division: Division = "bronze"; let dbest = Infinity;
  for (const [ovr, d] of buckets) { const dd = Math.abs(ovr - target); if (dd < dbest) { dbest = dd; division = d; } }
  return { team_id: teamId, team_name: teamName, starters, bench, strategy: "equilibrada", division };
}

