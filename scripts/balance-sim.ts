import { generateCpuSideFor, simulate, type EngineSide, type SlotRole } from "../src/lib/match-engine.server.ts";
import {
  BALANCE_VERSION,
  DIVISION_ORDER,
  DIVISION_STAR_PROFILE,
  MATCH_REVENUE,
  TICKET_PRICE,
  revenueCapacity,
  computeAwayWinBonus,
  divisionalMatchSalary,
  totalMaintenancePerMatch,
  type Division,
} from "../src/lib/economy.ts";
import { stadiumCapacity } from "../src/lib/buildings.server.ts";

const DIVISION_OVR: Record<Division, number> = {
  bronze: 33, prata: 44, ouro: 55, diamante: 64, lendaria: 72,
};
const MATCH_PRIZE: Record<Division, [number, number, number]> = {
  bronze: [15_000, 6_000, 2_000],
  prata: [28_000, 11_000, 4_000],
  ouro: [50_000, 20_000, 7_000],
  diamante: [90_000, 36_000, 13_000],
  lendaria: [160_000, 64_000, 24_000],
};
const PROFILES = {
  sobrevivencia: -5,
  equilibrado: 0,
  promocao: 3,
  favorito: 5,
} as const;
const ROLES: SlotRole[] = ["GOL", "DEF", "DEF", "DEF", "DEF", "MEI", "MEI", "MEI", "ATA", "ATA", "ATA"];

function side(id: string, overall: number, division: Division): EngineSide {
  const creature = (i: number) => ({
    id: `${id}-${i}`, name: `${id}-${i}`,
    element: (["fogo", "agua", "terra", "ar", "gelo"] as const)[i % 5],
    overall, physical: overall, energy: 85, morale: 70, age: 24,
    affinity_fogo: 0, affinity_agua: 0, affinity_terra: 0, affinity_ar: 0, affinity_gelo: 0,
  });
  return {
    team_id: id, team_name: id, division, strategy: "equilibrada", medical_level: 1,
    starters: ROLES.map((role, i) => ({ role, creature: creature(i) })),
    bench: ROLES.slice(0, 7).map((role, i) => ({ role, creature: creature(i + 20) })),
  };
}

function expectedPayroll(division: Division): number {
  const weights = DIVISION_STAR_PROFILE[division];
  const perPlayer = weights.reduce(
    (sum, weight, i) => sum + (weight / 100) * divisionalMatchSalary((i + 1) * 10, division), 0,
  );
  return Math.round(perPlayer * 26);
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
}

const seasons = Math.max(20, Number(process.argv[2] ?? 100));
console.log(`Monster Club Manager — simulador econômico/esportivo v${BALANCE_VERSION}`);
console.log(`${seasons} temporadas por perfil; 26 rodadas por temporada\n`);

for (const division of DIVISION_ORDER) {
  for (const [profile, delta] of Object.entries(PROFILES)) {
    const points: number[] = [];
    const nets: number[] = [];
    for (let season = 0; season < seasons; season++) {
      let seasonPoints = 0;
      let seasonNet = 0;
      const payroll = expectedPayroll(division);
      const salaryPerMatch = payroll / 26;
      const buildings = [
        { building_type: "estadio", level: 1 },
        { building_type: "ct_treino", level: 1 },
        { building_type: "centro_medico", level: 1 },
      ];
      const maintenance = totalMaintenancePerMatch(division, buildings);
      const fixed = Object.values(MATCH_REVENUE[division]).reduce((a, b) => a + b, 0);
      const gate = Math.round(revenueCapacity(division, stadiumCapacity(1)) * 0.73 * TICKET_PRICE[division]);

      for (let round = 0; round < 26; round++) {
        const isHome = round % 2 === 0;
        const player = side("player", DIVISION_OVR[division] + delta, division);
        const matchSeed = season * 10_000 + round + 1;
        const cpu = generateCpuSideFor(matchSeed ^ 0xabc, "cpu", "cpu", DIVISION_OVR[division]);
        const result = isHome
          ? simulate(player, cpu, matchSeed)
          : simulate(cpu, player, matchSeed);
        const gf = isHome ? result.home_score : result.away_score;
        const ga = isHome ? result.away_score : result.home_score;
        const outcome = gf > ga ? 0 : gf === ga ? 1 : 2;
        seasonPoints += outcome === 0 ? 3 : outcome === 1 ? 1 : 0;
        const prize = MATCH_PRIZE[division][outcome];
        const awayBonus = !isHome && outcome === 0
          ? computeAwayWinBonus(salaryPerMatch + maintenance, fixed, prize, division)
          : 0;
        seasonNet += fixed + prize + (isHome ? gate : 0) + awayBonus - salaryPerMatch - maintenance;
      }
      points.push(seasonPoints);
      nets.push(Math.round(seasonNet));
    }
    const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
    console.log([
      division.padEnd(9), profile.padEnd(12),
      `pts=${String(avg(points)).padStart(2)}`,
      `caixa médio=$${avg(nets).toLocaleString("pt-BR")}`,
      `p10=$${percentile(nets, 0.1).toLocaleString("pt-BR")}`,
    ].join(" | "));
  }
}
