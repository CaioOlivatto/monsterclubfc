import {
  generateCpuSideFor,
  simulate,
  type EngineSide,
  type SlotRole,
} from "../src/lib/match-engine.server.ts";
import { stadiumCapacity, BUILDINGS } from "../src/lib/buildings.server.ts";
import { computeMarketValue } from "../src/lib/bestiary.ts";
import {
  DIVISION_ORDER,
  MATCH_REVENUE,
  TICKET_PRICE,
  revenueCapacity,
  computeAwayWinBonus,
  cupPhaseBonus,
  divisionalMatchSalary,
  eliteRenewalFee,
  eliteInfrastructureRenewalFee,
  eliteTreasuryReserveFee,
  totalMaintenancePerMatch,
  worldLeaguePhaseBonus,
  type CupFinish,
  type Division,
} from "../src/lib/economy.ts";

const DIVISION_OVR: Record<Division, number> = {
  bronze: 33,
  prata: 44,
  ouro: 55,
  diamante: 64,
  lendaria: 72,
};
const MATCH_PRIZE: Record<Division, [number, number, number]> = {
  bronze: [15_000, 6_000, 2_000],
  prata: [28_000, 11_000, 4_000],
  ouro: [50_000, 20_000, 7_000],
  diamante: [90_000, 36_000, 13_000],
  lendaria: [160_000, 64_000, 24_000],
};
const ROLES: SlotRole[] = [
  "GOL",
  "DEF",
  "DEF",
  "DEF",
  "DEF",
  "MEI",
  "MEI",
  "MEI",
  "ATA",
  "ATA",
  "ATA",
];
const POLICIES = {
  conservador: { reserveMatches: 10, maxBuys: 1, stadiumPayback: 1.4 },
  equilibrado: { reserveMatches: 7, maxBuys: 2, stadiumPayback: 2.0 },
  agressivo: { reserveMatches: 5, maxBuys: 3, stadiumPayback: 2.8 },
} as const;

type Policy = keyof typeof POLICIES;
type Club = {
  division: Division;
  cash: number;
  overall: number;
  stadium: number;
  qualifiedWorld: boolean;
};
type CareerResult = {
  finalDivision: Division;
  cash: number;
  overall: number;
  stadium: number;
  promotions: number;
  relegations: number;
  broke: boolean;
  firstPromotion: number | null;
};

function rngFor(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function side(id: string, overall: number, division: Division): EngineSide {
  const creature = (index: number) => ({
    id: `${id}-${index}`,
    name: `${id}-${index}`,
    element: (["fogo", "agua", "terra", "ar", "gelo"] as const)[index % 5],
    overall,
    physical: overall,
    energy: 85,
    morale: 65,
    age: 24,
    affinity_fogo: 0,
    affinity_agua: 0,
    affinity_terra: 0,
    affinity_ar: 0,
    affinity_gelo: 0,
  });
  return {
    team_id: id,
    team_name: id,
    division,
    strategy: "equilibrada",
    medical_level: 1,
    starters: ROLES.map((role, index) => ({ role, creature: creature(index) })),
    bench: ROLES.slice(0, 7).map((role, index) => ({ role, creature: creature(index + 20) })),
  };
}

function operatingCost(club: Club) {
  const rosterSalary = divisionalMatchSalary(club.overall, club.division) * 18;
  const maintenance = totalMaintenancePerMatch(club.division, [
    { building_type: "estadio", level: club.stadium },
    { building_type: "ct_treino", level: 1 },
    { building_type: "centro_medico", level: 1 },
  ]);
  return rosterSalary + maintenance;
}

function play(seed: number, club: Club, opponentOverall: number, home: boolean) {
  const player = side("player", Math.round(club.overall), club.division);
  const cpu = generateCpuSideFor(seed ^ 0xabc, "cpu", "cpu", Math.round(opponentOverall));
  const result = home ? simulate(player, cpu, seed) : simulate(cpu, player, seed);
  const gf = home ? result.home_score : result.away_score;
  const ga = home ? result.away_score : result.home_score;
  return gf > ga ? 0 : gf === ga ? 1 : 2;
}

function matchNet(club: Club, outcome: number, home: boolean, rng: () => number) {
  const fixed = Object.values(MATCH_REVENUE[club.division]).reduce((sum, value) => sum + value, 0);
  const prize = MATCH_PRIZE[club.division][outcome];
  const cost = operatingCost(club);
  const occupancy = 0.63 + rng() * 0.2;
  const gate = home
    ? Math.round(
        revenueCapacity(club.division, stadiumCapacity(club.stadium)) *
          occupancy *
          TICKET_PRICE[club.division],
      )
    : 0;
  const awayBonus = !home && outcome === 0 ? computeAwayWinBonus(cost, fixed, prize) : 0;
  return fixed + prize + gate + awayBonus - cost;
}

function invest(club: Club, policy: Policy) {
  const rules = POLICIES[policy];
  const reserve = operatingCost(club) * rules.reserveMatches;
  if (club.stadium < 5) {
    const next = club.stadium + 1;
    const cost = BUILDINGS.estadio.cost(next);
    const extraGate =
      (revenueCapacity(club.division, stadiumCapacity(next)) -
        revenueCapacity(club.division, stadiumCapacity(club.stadium))) *
      0.73 *
      TICKET_PRICE[club.division] *
      13;
    const extraMaintenance =
      (totalMaintenancePerMatch(club.division, [{ building_type: "estadio", level: next }]) -
        totalMaintenancePerMatch(club.division, [
          { building_type: "estadio", level: club.stadium },
        ])) *
      26;
    const annualReturn = Math.max(1, extraGate - extraMaintenance);
    if (club.cash - cost >= reserve && cost / annualReturn <= rules.stadiumPayback) {
      club.cash -= cost;
      club.stadium = next;
    }
  }

  const target = Math.min(82, DIVISION_OVR[club.division] + 4);
  for (let buy = 0; buy < rules.maxBuys && club.overall < target; buy += 1) {
    const playerOverall = Math.min(100, Math.round(target + 5));
    const price = Math.round(computeMarketValue(playerOverall, 24) * 1.05);
    if (club.cash - price < reserve) break;
    club.cash -= price;
    // A contratação substitui prioritariamente um titular fraco; seu impacto é
    // diluído no onze principal, não em todo o elenco de 18 jogadores.
    club.overall += Math.max(0.35, (playerOverall - club.overall) / 11);
  }
}

function playCup(club: Club, seed: number) {
  const finishes: CupFinish[] = ["qf", "semi", "runnerUp"];
  for (let stage = 0; stage < 3; stage += 1) {
    const outcome = play(
      seed + stage * 17,
      club,
      DIVISION_OVR[club.division] + stage,
      stage % 2 === 0,
    );
    club.cash += matchNet(club, outcome, stage % 2 === 0, rngFor(seed + stage));
    if (outcome !== 0) {
      club.cash += cupPhaseBonus(club.division, finishes[stage]);
      return;
    }
  }
  club.cash += cupPhaseBonus(club.division, "champion");
}

function playWorld(club: Club, seed: number) {
  if (!club.qualifiedWorld) return;
  let wins = 0;
  for (let round = 0; round < 5; round += 1) {
    const outcome = play(seed + round * 23, club, DIVISION_OVR[club.division] + 4, round % 2 === 0);
    if (outcome === 0) wins += 1;
    club.cash += matchNet(club, outcome, round % 2 === 0, rngFor(seed + round));
  }
  club.cash += worldLeaguePhaseBonus(club.division, wins >= 4 ? "semi" : "groups");
}

function simulateCareer(seed: number, policy: Policy, seasons: number): CareerResult {
  const club: Club = {
    division: "bronze",
    cash: 400_000,
    overall: 33,
    stadium: 1,
    qualifiedWorld: false,
  };
  let promotions = 0;
  let relegations = 0;
  let firstPromotion: number | null = null;
  let broke = false;
  for (let season = 1; season <= seasons; season += 1) {
    invest(club, policy);
    let points = 0;
    for (let round = 0; round < 26; round += 1) {
      const home = round % 2 === 0;
      const outcome = play(
        seed * 100_000 + season * 1000 + round,
        club,
        DIVISION_OVR[club.division],
        home,
      );
      points += outcome === 0 ? 3 : outcome === 1 ? 1 : 0;
      club.cash += matchNet(club, outcome, home, rngFor(seed + season * 97 + round));
    }
    playCup(club, seed * 1301 + season * 41);
    playWorld(club, seed * 1709 + season * 53);
    club.qualifiedWorld = points >= 52;

    const simulatedRoster = Array.from({ length: 18 }, () => ({
      overall: club.overall,
      salary_mult: 1,
    }));
    const simulatedBuildings = [
      { building_type: "estadio", level: club.stadium },
      { building_type: "ct_treino", level: 1 },
      { building_type: "centro_medico", level: 1 },
    ];
    club.cash -= eliteRenewalFee(club.division, simulatedRoster);
    club.cash -= eliteInfrastructureRenewalFee(club.division, simulatedBuildings);
    club.cash -= eliteTreasuryReserveFee(club.division, club.cash);

    const index = DIVISION_ORDER.indexOf(club.division);
    if (points >= 45 && index < DIVISION_ORDER.length - 1) {
      club.division = DIVISION_ORDER[index + 1];
      promotions += 1;
      firstPromotion ??= season;
    } else if (points <= 24 && index > 0) {
      club.division = DIVISION_ORDER[index - 1];
      relegations += 1;
    }

    // Evolução orgânica líquida de treino, parcialmente compensada por idade/renovação.
    club.overall = Math.max(28, Math.min(85, club.overall + 0.65 - (season % 4 === 0 ? 0.8 : 0)));
    if (club.cash < 0) broke = true;
  }
  return {
    finalDivision: club.division,
    cash: Math.round(club.cash),
    overall: club.overall,
    stadium: club.stadium,
    promotions,
    relegations,
    broke,
    firstPromotion,
  };
}

function avg(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}
const careers = Math.max(20, Number(process.argv[2] ?? 200));
const seasons = Math.max(5, Number(process.argv[3] ?? 10));
const requestedPolicy = process.argv[4] as Policy | undefined;
const policies =
  requestedPolicy && requestedPolicy in POLICIES
    ? [requestedPolicy]
    : (Object.keys(POLICIES) as Policy[]);
console.log(`Carreira longitudinal: ${careers} treinadores por política, ${seasons} temporadas`);
for (const policy of policies) {
  const results = Array.from({ length: careers }, (_, index) =>
    simulateCareer(index + 1, policy, seasons),
  );
  const divisionCounts = Object.fromEntries(
    DIVISION_ORDER.map((division) => [
      division,
      results.filter((result) => result.finalDivision === division).length,
    ]),
  );
  const promoted = results.filter((result) => result.firstPromotion !== null);
  console.log(
    JSON.stringify({
      policy,
      bankruptcyRate: `${((results.filter((result) => result.broke).length / careers) * 100).toFixed(1)}%`,
      firstPromotionSeason: promoted.length
        ? Number(avg(promoted.map((result) => result.firstPromotion!)).toFixed(1))
        : null,
      averageCash: Math.round(avg(results.map((result) => result.cash))),
      averageOverall: Number(avg(results.map((result) => result.overall)).toFixed(1)),
      averagePromotions: Number(avg(results.map((result) => result.promotions)).toFixed(1)),
      averageRelegations: Number(avg(results.map((result) => result.relegations)).toFixed(1)),
      finalDivisions: divisionCounts,
    }),
  );
}
