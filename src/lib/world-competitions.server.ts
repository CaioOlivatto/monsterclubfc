// Fase B — helpers server-only para Liga/Copa Mundial (per-trainer)
// Poisson usado APENAS em partidas CPU vs CPU. Partidas do jogador rodam
// no motor de duelos completo (match-engine) via world-competitions.functions.

export type Division = "bronze" | "prata" | "ouro" | "diamante" | "lendaria";
export const DIVISIONS: Division[] = ["lendaria", "diamante", "ouro", "prata", "bronze"];

export function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fastPoisson(lambda: number, rng: () => number): number {
  const L = Math.exp(-Math.max(0.1, lambda));
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L && k < 20);
  return Math.max(0, k - 1);
}

/** Simula placar CPUxCPU (Poisson). Nunca usado quando o jogador está em campo. */
export function simulateSummaryScore(
  homeStrength: number,
  awayStrength: number,
  seed: number,
  neutralField = false,
): { home: number; away: number } {
  const rng = mulberry32(seed);
  const homeBoost = neutralField ? 1.0 : 1.05;
  const homeLambda = Math.max(0.2, (homeStrength / 28) * homeBoost);
  const awayLambda = Math.max(0.2, awayStrength / 28);
  const home = fastPoisson(homeLambda, rng);
  const away = fastPoisson(awayLambda, rng);
  return { home, away };
}

export function decideKnockoutWinner(
  homeStrength: number,
  awayStrength: number,
  home: number,
  away: number,
  seed: number,
): "home" | "away" {
  if (home > away) return "home";
  if (away > home) return "away";
  const rng = mulberry32(seed ^ 0xdeadbeef);
  const homeChance = homeStrength / (homeStrength + awayStrength);
  return rng() < homeChance ? "home" : "away";
}

export type PoolTeam = {
  id: string;
  name: string;
  division: Division;
  strength: number;
  is_player: boolean;
};

/**
 * Distribui 20 times em 4 GRUPOS DE 5 (potes por força).
 * Player sempre no grupo A.
 */
export function drawLeagueGroups(
  teams: PoolTeam[],
  seed: number,
): { group: string; teams: PoolTeam[] }[] {
  if (teams.length !== 20) throw new Error(`Liga Mundial exige 20 times, recebeu ${teams.length}`);
  const rng = mulberry32(seed);
  const sorted = teams.slice().sort((a, b) => b.strength - a.strength);
  // 5 potes de 4 (1 time por pote em cada grupo)
  const pots: PoolTeam[][] = [
    sorted.slice(0, 4),
    sorted.slice(4, 8),
    sorted.slice(8, 12),
    sorted.slice(12, 16),
    sorted.slice(16, 20),
  ];
  for (const pot of pots) {
    for (let i = pot.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pot[i], pot[j]] = [pot[j], pot[i]];
    }
  }
  const groups: PoolTeam[][] = [[], [], [], []];
  for (const pot of pots) {
    for (let g = 0; g < 4; g++) groups[g].push(pot[g]);
  }
  // Player no grupo A
  const playerGroupIdx = groups.findIndex((g) => g.some((t) => t.is_player));
  if (playerGroupIdx > 0) {
    const player = groups[playerGroupIdx].find((t) => t.is_player)!;
    const potOfPlayer = pots.findIndex((p) => p.includes(player));
    const swapTarget = groups[0].find((t) => pots[potOfPlayer].includes(t));
    if (swapTarget) {
      groups[playerGroupIdx] = groups[playerGroupIdx].map((t) => (t === player ? swapTarget : t));
      groups[0] = groups[0].map((t) => (t === swapTarget ? player : t));
    }
  }
  return groups.map((g, i) => ({ group: String.fromCharCode(65 + i), teams: g }));
}

/**
 * Round-robin de 5 times → 5 rodadas × 2 jogos (um time descansa por rodada).
 * Cada time joga 4 partidas.
 */
export function groupFixtures(
  teams: PoolTeam[],
): Array<{ round: number; home: PoolTeam; away: PoolTeam }> {
  const [t1, t2, t3, t4, t5] = teams;
  return [
    { round: 1, home: t1, away: t2 }, { round: 1, home: t3, away: t4 }, // t5 folga
    { round: 2, home: t1, away: t3 }, { round: 2, home: t2, away: t5 }, // t4 folga
    { round: 3, home: t1, away: t4 }, { round: 3, home: t3, away: t5 }, // t2 folga
    { round: 4, home: t1, away: t5 }, { round: 4, home: t2, away: t4 }, // t3 folga
    { round: 5, home: t2, away: t3 }, { round: 5, home: t4, away: t5 }, // t1 folga
  ];
}

/** Rodadas 1-5 = grupos; 6 = QF (8 times); 7 = SF; 8 = Final. */
export const LEAGUE_PHASE_NAMES: Record<number, string> = {
  1: "Grupos R1", 2: "Grupos R2", 3: "Grupos R3", 4: "Grupos R4", 5: "Grupos R5",
  6: "Quartas", 7: "Semifinal", 8: "Final",
};

export const CUP_PHASE_NAMES: Record<number, string> = {
  1: "Pré-oitavas", 2: "Quartas", 3: "Semifinal", 4: "Final",
};
