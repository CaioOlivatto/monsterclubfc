// Fase B — helpers server-only para Liga/Copa Mundial (per-trainer)
// Reaproveita padrão de simulação rápida (Poisson por força) do league.functions.

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

// Bônus por divisão (média OVR aproximada) — usado para converter strength em lambda
const DIV_BASE: Record<Division, number> = {
  bronze: 33, prata: 44, ouro: 55, diamante: 64, lendaria: 72,
};

/** Simula placar CPUxCPU a partir de strengths médios. Retorna gols. */
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

/** Decide vencedor de mata-mata em caso de empate (pênaltis). */
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
  // pênaltis levemente influenciados por força
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
 * Distribui 20 times em 5 grupos de 4 (potes por divisão para equilibrar).
 * Player sempre no grupo A.
 */
export function drawLeagueGroups(teams: PoolTeam[], seed: number): { group: string; teams: PoolTeam[] }[] {
  if (teams.length !== 20) throw new Error(`Liga Mundial exige 20 times, recebeu ${teams.length}`);
  const rng = mulberry32(seed);
  const shuffled = teams.slice();
  // sort by strength desc for pot assignment
  shuffled.sort((a, b) => b.strength - a.strength);
  // 4 pots de 5 times
  const pots: PoolTeam[][] = [shuffled.slice(0, 5), shuffled.slice(5, 10), shuffled.slice(10, 15), shuffled.slice(15, 20)];
  // Embaralha cada pote
  for (const pot of pots) {
    for (let i = pot.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pot[i], pot[j]] = [pot[j], pot[i]];
    }
  }
  const groups: PoolTeam[][] = [[], [], [], [], []];
  // 1 time de cada pote em cada grupo
  for (const pot of pots) {
    for (let g = 0; g < 5; g++) groups[g].push(pot[g]);
  }
  // Garante que o jogador fique no grupo A (índice 0)
  const playerGroupIdx = groups.findIndex((g) => g.some((t) => t.is_player));
  if (playerGroupIdx > 0) {
    const player = groups[playerGroupIdx].find((t) => t.is_player)!;
    // troca player com um time do mesmo pote no grupo A
    const potOfPlayer = pots.findIndex((p) => p.includes(player));
    const groupA = groups[0];
    const swapTarget = groupA.find((t) => pots[potOfPlayer].includes(t));
    if (swapTarget) {
      groups[playerGroupIdx] = groups[playerGroupIdx].map((t) => (t === player ? swapTarget : t));
      groups[0] = groups[0].map((t) => (t === swapTarget ? player : t));
    }
  }
  return groups.map((g, i) => ({ group: String.fromCharCode(65 + i), teams: g }));
}

/** Round-robin de 4 times → 3 rodadas × 2 jogos (só ida). */
export function groupFixtures(teams: PoolTeam[]): Array<{ round: number; home: PoolTeam; away: PoolTeam }> {
  const [a, b, c, d] = teams;
  return [
    { round: 1, home: a, away: b },
    { round: 1, home: c, away: d },
    { round: 2, home: a, away: c },
    { round: 2, home: b, away: d },
    { round: 3, home: a, away: d },
    { round: 3, home: b, away: c },
  ];
}

/** Nomes de fase da Liga Mundial por rodada (1-7). */
export const LEAGUE_PHASE_NAMES: Record<number, string> = {
  1: "Grupos R1", 2: "Grupos R2", 3: "Grupos R3",
  4: "Playoff", 5: "Quartas", 6: "Semifinal", 7: "Final",
};

/** Nomes de fase da Copa Mundial por rodada (1-4). */
export const CUP_PHASE_NAMES: Record<number, string> = {
  1: "Pré-oitavas", 2: "Quartas", 3: "Semifinal", 4: "Final",
};

DIV_BASE; // referência não usada externamente ainda
