// Regras econômicas compartilhadas — Balanceamento §2.4 (salários) e §8 (calibre e teto).

export type Division = "bronze" | "prata" | "ouro" | "diamante" | "lendaria";

/** Versão das regras usada para auditoria, telemetria e reprodução de temporadas. */
export const BALANCE_VERSION = "2.1.0";

export const DIVISION_ORDER: Division[] = ["bronze", "prata", "ouro", "diamante", "lendaria"];

export function divisionLabel(d: Division): string {
  return {
    bronze: "5ª Bronze",
    prata: "4ª Prata",
    ouro: "3ª Ouro",
    diamante: "2ª Diamante",
    lendaria: "1ª Lendária",
  }[d];
}

export const MATCHES_PER_SEASON = 26;

/** Salário anual (temporada de 26 partidas). Base para o teto de folha. */
export function seasonSalary(overall: number): number {
  if (overall < 30) return 4_000;
  if (overall < 50) return 12_000;
  if (overall < 70) return 35_000;
  if (overall < 90) return 110_000;
  return 400_000;
}

/** Salário por partida (§Economia-Por-Partida). */
export function matchSalary(overall: number): number {
  return Math.round(seasonSalary(overall) / MATCHES_PER_SEASON);
}

/** Folha por partida com pressão salarial de elite. Bronze e Prata mantêm
 * exatamente a regra v2.0; o adicional começa apenas em atletas fortes nas
 * divisões superiores. */
export function divisionalMatchSalary(overall: number, division: Division): number {
  const base = matchSalary(overall);
  const threshold =
    division === "ouro" ? 75 : division === "diamante" ? 65 : division === "lendaria" ? 60 : 101;
  const rate =
    division === "ouro"
      ? 0.025
      : division === "diamante"
        ? 0.055
        : division === "lendaria"
          ? 0.085
          : 0;
  const multiplier = 1 + Math.max(0, overall - threshold) * rate;
  return Math.round(base * multiplier);
}

/** Renovação anual do elenco. É zero até a Ouro e só se torna relevante no
 * endgame, onde contratos de estrelas precisam ser sustentados. */
export function eliteRenewalFee(
  division: Division,
  roster: Array<{ overall?: number | null; salary_mult?: number | null }>,
): number {
  const rate = division === "diamante" ? 0.3 : division === "lendaria" ? 0.55 : 0;
  if (!rate) return 0;
  const annualPayroll = (roster ?? []).reduce(
    (sum, creature) =>
      sum +
      divisionalMatchSalary(creature.overall ?? 40, division) *
        MATCHES_PER_SEASON *
        (creature.salary_mult ?? 1),
    0,
  );
  return Math.round(annualPayroll * rate);
}

/** Fundo anual de modernização das estruturas de elite. Prédios de Bronze,
 * Prata e Ouro não pagam esta camada adicional. */
export function eliteInfrastructureRenewalFee(
  division: Division,
  buildings: Array<{ building_type: string; level: number }>,
): number {
  const matches = division === "diamante" ? 5 : division === "lendaria" ? 9 : 0;
  return matches ? totalMaintenancePerMatch(division, buildings) * matches : 0;
}

/** Fundo progressivo aplicado somente a caixas muito altos no endgame. */
export function eliteTreasuryReserveFee(division: Division, cashAfterPrize: number): number {
  const threshold =
    division === "diamante" ? 12_000_000 : division === "lendaria" ? 18_000_000 : Infinity;
  const rate = division === "diamante" ? 0.06 : division === "lendaria" ? 0.1 : 0;
  return Math.round(Math.max(0, cashAfterPrize - threshold) * rate);
}

/** Margem mínima garantida por vitória fora (§Economia-Por-Partida — bônus dinâmico). */
export const AWAY_WIN_MIN_MARGIN = 8_000;

/** Bônus dinâmico de vitória fora: cobre o déficit entre despesas da partida e
 *  (receita fixa sem bilheteria + prêmio da partida), garantindo uma margem mínima.
 *  Assim, uma vitória fora sempre fecha positivo em ~$8k, mesmo quando o jogador
 *  sobe construções e aumenta manutenção/salários. */
export function computeAwayWinBonus(
  expenses: number,
  fixedRevenueNoGate: number,
  matchPrize: number,
): number {
  const deficit = expenses - fixedRevenueNoGate - matchPrize;
  return Math.max(0, deficit) + AWAY_WIN_MIN_MARGIN;
}

/**
 * Ajuda de participação mundial: cobre 75% do custo operacional que excede a
 * receita fixa. Classificar-se continua lucrativo sem remover o risco esportivo.
 */
export function computeWorldParticipationGrant(expenses: number, fixedRevenue: number): number {
  return Math.round(Math.max(0, expenses - fixedRevenue) * 0.75);
}

/** Prêmio de fase da Copa Nacional (spec Sistema-Tres-Competicoes.md).
 *  Valores fixos, independentes de divisão — a Copa é cross-divisão. */
export type CupFinish = "champion" | "runnerUp" | "semi" | "qf";

export const CUP_PHASE_BONUS: Record<Division, Record<CupFinish, number>> = {
  bronze: { champion: 2_000_000, runnerUp: 900_000, semi: 450_000, qf: 150_000 },
  prata: { champion: 3_000_000, runnerUp: 1_400_000, semi: 700_000, qf: 250_000 },
  ouro: { champion: 4_500_000, runnerUp: 2_200_000, semi: 1_100_000, qf: 400_000 },
  diamante: { champion: 7_000_000, runnerUp: 3_500_000, semi: 1_800_000, qf: 650_000 },
  lendaria: { champion: 10_000_000, runnerUp: 5_500_000, semi: 2_800_000, qf: 1_000_000 },
};

export function cupPhaseBonus(division: Division, finish: CupFinish): number {
  return CUP_PHASE_BONUS[division]?.[finish] ?? CUP_PHASE_BONUS.bronze[finish];
}

/** Prêmio de fase da Liga Mundial (spec Sistema-Tres-Competicoes.md). */
export type WorldLeagueFinish = "champion" | "runnerUp" | "semi" | "groups";

const WORLD_PHASE_BASE: Record<WorldLeagueFinish, number> = {
  champion: 5_000_000,
  runnerUp: 2_500_000,
  semi: 1_200_000,
  groups: 500_000,
};

const WORLD_PHASE_DIVISION_MULT: Record<Division, number> = {
  bronze: 1,
  prata: 1.25,
  ouro: 1.65,
  diamante: 2.2,
  lendaria: 3,
};

export function worldLeaguePhaseBonus(division: Division, finish: WorldLeagueFinish): number {
  return Math.round(WORLD_PHASE_BASE[finish] * WORLD_PHASE_DIVISION_MULT[division]);
}

/** Receita passiva por partida, por divisão (TV, Patrocínio, Merchandising). */
export const MATCH_REVENUE: Record<Division, { tv: number; sponsor: number; merch: number }> = {
  bronze: { tv: 8_000, sponsor: 9_000, merch: 4_000 },
  prata: { tv: 20_000, sponsor: 21_000, merch: 9_000 },
  ouro: { tv: 42_000, sponsor: 43_000, merch: 18_000 },
  diamante: { tv: 85_000, sponsor: 88_000, merch: 36_000 },
  lendaria: { tv: 160_000, sponsor: 168_000, merch: 70_000 },
};

/** Ingresso cresce com o poder de compra e os custos da divisão. */
export const TICKET_PRICE: Record<Division, number> = {
  bronze: 10,
  prata: 16,
  ouro: 24,
  diamante: 36,
  lendaria: 50,
};

/** Demanda máxima esperada por jogo. Um estádio maior prepara o clube para a
 * próxima divisão, mas não cria torcedores ilimitados em ligas menores. */
export const ATTENDANCE_DEMAND_CAP: Record<Division, number> = {
  bronze: 10_000,
  prata: 18_000,
  ouro: 30_000,
  diamante: 45_000,
  lendaria: 60_000,
};

export function revenueCapacity(division: Division, stadiumCapacity: number): number {
  return Math.min(Math.max(0, stadiumCapacity), ATTENDANCE_DEMAND_CAP[division]);
}

/** Manutenção por partida — base (nível 1) por divisão. Escala +40% por nível.
 *  Spec Economia-Por-Partida: derrota fora deve ser sempre risco financeiro. */
const MAINTENANCE_BASE: Record<Division, { estadio: number; ct: number; centro_medico: number }> = {
  bronze: { estadio: 18_000, ct: 9_000, centro_medico: 6_000 },
  prata: { estadio: 59_000, ct: 30_000, centro_medico: 20_000 },
  ouro: { estadio: 102_000, ct: 51_000, centro_medico: 36_000 },
  diamante: { estadio: 180_000, ct: 90_000, centro_medico: 64_000 },
  lendaria: { estadio: 310_000, ct: 160_000, centro_medico: 105_000 },
};

/** Manutenção por partida de um prédio (0 se não construído). Escala +40% por nível acima do 1. */
export function maintenancePerMatch(
  division: Division,
  buildingType: string,
  level: number,
): number {
  if (!level || level < 1) return 0;
  const base = MAINTENANCE_BASE[division] ?? MAINTENANCE_BASE.bronze;
  const key =
    buildingType === "estadio"
      ? ("estadio" as const)
      : buildingType === "centro_medico"
        ? ("centro_medico" as const)
        : buildingType === "ct_treino"
          ? ("ct" as const)
          : null;
  if (!key) return 0;
  // O estádio possui dez níveis. A expansão física encarece gradualmente,
  // mas setores premium passam a sustentar a operação nas divisões altas.
  // Na Bronze, a demanda limitada impede que um estádio gigante vire lucro fácil.
  if (key === "estadio") {
    const stadiumScale = Math.pow(1.10, Math.min(level - 1, 4)) * Math.pow(1.14, Math.max(0, level - 5));
    const stadiumEliteMultiplier =
      division === "diamante"
        ? 1 + Math.max(0, level - 5) * 0.05
        : division === "lendaria"
          ? 1 + Math.max(0, level - 5) * 0.08
          : 1;
    return Math.round(base.estadio * stadiumScale * stadiumEliteMultiplier);
  }
  // Níveis melhores continuam tendo custo, mas não anulam o benefício do prédio.
  const scale = Math.pow(1.18, level - 1);
  const eliteInfrastructureMultiplier =
    level < 4
      ? 1
      : division === "diamante"
        ? 1 + (level - 3) * 0.12
        : division === "lendaria"
          ? 1 + (level - 3) * 0.22
          : 1;
  return Math.round(base[key] * scale * eliteInfrastructureMultiplier);
}

/** Soma a manutenção por partida do conjunto de prédios do treinador. */
export function totalMaintenancePerMatch(
  division: Division,
  buildings: Array<{ building_type: string; level: number }>,
): number {
  return (buildings ?? []).reduce(
    (sum, b) => sum + maintenancePerMatch(division, b.building_type, b.level ?? 0),
    0,
  );
}

/** Limite de contratação (banda de meia-estrela máxima) — Balanceamento §8.1. */
export const DIVISION_MAX_BAND: Record<Division, number> = {
  bronze: 6, // até 3★
  prata: 8, // até 4★
  ouro: 10, // até 5★ (chance alta de recusa em 5★)
  diamante: 10, // até 5★
  lendaria: 10, // sem restrição
};

/** Teto de folha salarial por divisão (~35% da receita típica) — Balanceamento §8.2. */
export const DIVISION_SALARY_CAP: Record<Division, number> = {
  bronze: 770_000,
  prata: 1_440_000,
  ouro: 2_410_000,
  diamante: 3_920_000,
  lendaria: 6_020_000,
};

/** Chance de recusa por contratação acima do calibre confortável (§8.1). */
export function refusalChance(division: Division, band: number): number {
  if (division === "ouro" && band >= 9) return 0.6; // Ouro tentando 4,5★+
  if (division === "prata" && band >= 8) return 0.4; // Prata tentando 4★
  if (division === "bronze" && band >= 6) return 0.5; // Bronze no teto
  return 0;
}

/** Perfil de distribuição de estrelas por divisão — Balanceamento §7.1.
 *  Cada array tem 10 pesos, um por meia-estrela (índice 0 = 0,5★ ... índice 9 = 5★). */
export const DIVISION_STAR_PROFILE: Record<Division, number[]> = {
  //                   0.5, 1,  1.5, 2,  2.5, 3,  3.5, 4,  4.5, 5
  bronze: [5, 20, 33, 27, 12, 3, 0, 0, 0, 0],
  prata: [0, 5, 17, 32, 28, 14, 4, 0, 0, 0],
  ouro: [0, 0, 5, 15, 30, 30, 15, 5, 0, 0],
  diamante: [0, 0, 0, 6, 18, 32, 26, 14, 4, 0],
  lendaria: [0, 0, 0, 0, 8, 20, 30, 25, 12, 5],
};

/** Sorteia uma banda de meia-estrela conforme o perfil da divisão. */
export function rollBandForDivision(division: Division, rng: () => number): number {
  const weights = DIVISION_STAR_PROFILE[division];
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i + 1; // banda 1..10
  }
  return weights.length;
}
