// Sistema de seleção com anti-repetição, mistura de registros e callbacks.
import {
  OPENING_NEUTRAL,
  OPENING_ELEMENT,
  DEVELOPMENT,
  OUTCOME_GOAL,
  OUTCOME_GOLACO,
  OUTCOME_SAVE,
  OUTCOME_MISS,
  OUTCOME_BLOCK,
  CALLBACKS,
  type Phrase,
  type NarrRegister,
  type NarrElement,
} from "./banks";

export type Outcome = "goal" | "save" | "miss" | "block";

export interface PlayMeta {
  attacker?: string;
  defender?: string;
  goalie?: string;
  team?: string;
  element?: NarrElement;
  elemental_advantage?: boolean;
  long_shot?: boolean;
  is_danger?: boolean;
  outcome?: Outcome;
}

export interface NarrationParts {
  p1: string;
  p2: string;
  p3: string;
  is_golaco: boolean;
  fast_beat: boolean;
  callbacks: string[];
}

const REGISTER_WEIGHTS: Record<NarrRegister, number> = {
  energia: 45,
  deadpan: 20,
  observacao: 20,
  cultura: 15,
};

function weightedPick(candidates: Phrase[], last: NarrRegister | null): Phrase {
  const filtered = candidates.filter((p) => p.register !== last);
  const pool = filtered.length ? filtered : candidates;
  const totals = pool.map((p) => REGISTER_WEIGHTS[p.register]);
  const sum = totals.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < pool.length; i++) {
    r -= totals[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

function fill(text: string, meta: PlayMeta): string {
  return text
    .replaceAll("{atacante}", meta.attacker ?? "o atacante")
    .replaceAll("{defensor}", meta.defender ?? "o zagueiro")
    .replaceAll("{goleiro}", meta.goalie ?? "o goleiro")
    .replaceAll("{time}", meta.team ?? "o time");
}

export class NarrationSession {
  private used = new Set<string>();
  private lastRegister: NarrRegister | null = null;
  private goalCount = 0;
  private golacoCount = 0;
  private lastReactionMinute = -999;
  private callbacksUsed = 0;
  // callback state
  private missedBy = new Set<string>();
  private scoredBy = new Map<string, number>();
  private dribbledPairs = new Map<string, number>();

  private pickFresh(pool: Phrase[]): Phrase {
    const notUsed = pool.filter((p) => !this.used.has(p.text));
    const source = notUsed.length ? notUsed : pool;
    if (!notUsed.length) {
      // reset scope for this pool
      pool.forEach((p) => this.used.delete(p.text));
    }
    const chosen = weightedPick(source, this.lastRegister);
    this.used.add(chosen.text);
    this.lastRegister = chosen.register;
    return chosen;
  }

  /** Escolhe apenas a frase de desfecho, para lances secundários que
   *  aparecem no painel sem pausa dramática. Mantém banco/anti-repetição. */
  buildSingleOutcome(outcome: Outcome, meta: PlayMeta): string {
    let pool: Phrase[];
    if (outcome === "goal") pool = OUTCOME_GOAL;
    else if (outcome === "save") pool = OUTCOME_SAVE;
    else if (outcome === "miss") pool = OUTCOME_MISS;
    else pool = OUTCOME_BLOCK;
    const chosen = this.pickFresh(pool);
    return fill(chosen.text, meta);
  }



  buildPlay(outcome: Outcome, meta: PlayMeta, minute: number): NarrationParts {
    // Opening: 40% elemento se houver
    let opening: Phrase;
    if (meta.element && Math.random() < 0.4) {
      opening = this.pickFresh([...OPENING_ELEMENT[meta.element], ...OPENING_NEUTRAL]);
    } else {
      opening = this.pickFresh(OPENING_NEUTRAL);
    }
    const development = this.pickFresh(DEVELOPMENT);

    // Outcome + golaço lógica
    let is_golaco = false;
    let outcomePool: Phrase[];
    if (outcome === "goal") {
      this.goalCount += 1;
      const eligibleGolaco =
        (meta.elemental_advantage || meta.long_shot) &&
        this.goalCount - this.golacoCount >= 4;
      if (eligibleGolaco && Math.random() < 0.7) {
        outcomePool = OUTCOME_GOLACO;
        is_golaco = true;
        this.golacoCount = this.goalCount;
      } else {
        outcomePool = OUTCOME_GOAL;
      }
    } else if (outcome === "save") outcomePool = OUTCOME_SAVE;
    else if (outcome === "miss") outcomePool = OUTCOME_MISS;
    else outcomePool = OUTCOME_BLOCK;

    const desfecho = this.pickFresh(outcomePool);

    // Callbacks
    const cbTexts: string[] = [];
    if (this.callbacksUsed < 3 && meta.attacker) {
      const attackerName = meta.attacker;
      if (outcome === "goal") {
        if (this.missedBy.has(attackerName)) {
          const cb = CALLBACKS.find((c) => c.kind === "actor_missed");
          if (cb) cbTexts.push(fill(cb.text, meta));
        } else {
          const prev = this.scoredBy.get(attackerName) ?? 0;
          if (prev >= 1) {
            const cb = CALLBACKS.find((c) => c.kind === "actor_scored");
            if (cb) cbTexts.push(fill(cb.text, meta));
          }
        }
        this.scoredBy.set(attackerName, (this.scoredBy.get(attackerName) ?? 0) + 1);
        this.missedBy.delete(attackerName);
      } else if (outcome === "miss") {
        this.missedBy.add(attackerName);
      }
      if (meta.defender && (outcome === "goal" || outcome === "save")) {
        const key = `${attackerName}||${meta.defender}`;
        const n = (this.dribbledPairs.get(key) ?? 0) + 1;
        this.dribbledPairs.set(key, n);
        if (n >= 2 && !cbTexts.length) {
          const cb = CALLBACKS.find((c) => c.kind === "defender_dribbled_again");
          if (cb) cbTexts.push(fill(cb.text, meta));
        }
      }
      if (cbTexts.length) this.callbacksUsed += 1;
    }

    // Ritmo acelerado ~15% dos lances
    const fast_beat = Math.random() < 0.15;

    return {
      p1: fill(opening.text, meta),
      p2: fill(development.text, meta),
      p3: fill(desfecho.text, meta),
      is_golaco,
      fast_beat,
      callbacks: cbTexts,
    };
  }

  maybeReaction(minute: number, ctx: { homeGoals: number; awayGoals: number; isPlayerHome: boolean }):
    | string
    | null {
    if (minute - this.lastReactionMinute < 15) return null;
    const diff = ctx.homeGoals - ctx.awayGoals;
    const playerDiff = ctx.isPlayerHome ? diff : -diff;
    let pool: string[] | null = null;
    if (Math.abs(diff) >= 3) pool = REACTION_POOLS.goleada;
    else if (minute >= 85 && diff === 0) pool = REACTION_POOLS.empate_fim;
    else if (playerDiff <= -2 && minute >= 60) pool = REACTION_POOLS.perdendo;
    if (!pool) return null;
    this.lastReactionMinute = minute;
    return pool[Math.floor(Math.random() * pool.length)];
  }
}

const REACTION_POOLS = {
  goleada: [
    "Tá virando treino isso aqui, gente...",
    "Alguém segura esse time!",
    "A essa altura já é crueldade.",
  ],
  empate_fim: [
    "Cinco minutos pro fim e tá tudo igual! Segura o coração!",
    "Tá nervoso isso aqui, hein!",
  ],
  perdendo: [
    "Precisa acordar, time! Precisa acordar!",
    "Ainda dá tempo! Ainda dá tempo!",
    "Tá difícil. Não vou mentir pra vocês.",
  ],
};
