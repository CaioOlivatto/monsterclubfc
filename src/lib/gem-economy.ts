import type { Division } from "./economy";

export const GEM_ECONOMY_CONFIG = {
  initialGems: 10,
  marketCycleHours: 12,
  marketRefreshGemCosts: [0, 0, 5, 10, 20, 30] as const,
  marketRefreshMoneyByDivision: {
    bronze: 25_000,
    prata: 60_000,
    ouro: 140_000,
    diamante: 320_000,
    lendaria: 700_000,
  } satisfies Record<Division, number>,
  scoutGemCost: 10,
  premiumFrequency: 0.14,
  premiumGemPriceByDivision: {
    bronze: 1_300,
    prata: 1_500,
    ouro: 1_700,
    diamante: 1_900,
    lendaria: 2_200,
  } satisfies Record<Division, number>,
  championshipRewards: {
    bronze: 20,
    prata: 30,
    ouro: 40,
    diamante: 50,
    lendaria: 75,
  } satisfies Record<Division, number>,
  promotionReward: 10,
  weeklyMissions: {
    activeDaysTarget: 5,
    completionTarget: 7,
    completionReward: 5,
    pool: [
      { key: "active_days_5", target: 5, reward: 3 },
      { key: "play_matches_3", target: 3, reward: 2 },
      { key: "win_matches_2", target: 2, reward: 2 },
      { key: "score_goals_5", target: 5, reward: 2 },
      { key: "training_1", target: 1, reward: 2 },
      { key: "market_visit_1", target: 1, reward: 1 },
      { key: "sign_player_1", target: 1, reward: 3 },
      { key: "building_upgrade_1", target: 1, reward: 2 },
      { key: "strategy_change_1", target: 1, reward: 1 },
      { key: "substitution_1", target: 1, reward: 1 },
    ],
    selectedRotatingCount: 6,
    // As sete missões fixadas pela migration somam 15; o bônus integral soma 5.
    weeklyGemCeiling: 20,
  },
  speedCosts: { speed2x: 100, speed4x: 300, instant: 800, bundle: 1_050 },
  shopPackages: [
    { gems: 100, priceCents: 790 },
    { gems: 450, priceCents: 2_490 },
    { gems: 1_050, priceCents: 4_990 },
    { gems: 2_200, priceCents: 8_490 },
    { gems: 6_000, priceCents: 19_990 },
  ],
} as const;

export type MarketScoutPosition = "GOL" | "DEF" | "MEI" | "ATA";

export function currentMarketCycle(now = Date.now()): number {
  return Math.floor(now / (GEM_ECONOMY_CONFIG.marketCycleHours * 60 * 60 * 1_000));
}

export function marketCycleEndsAt(cycle: number): string {
  return new Date((cycle + 1) * GEM_ECONOMY_CONFIG.marketCycleHours * 60 * 60 * 1_000).toISOString();
}

export function normalPlayerGemPrice(input: {
  division: Division;
  overall: number;
  age: number;
  halfStarBand: number;
  marketValue: number;
  isProdigy?: boolean;
}): number {
  const divisionFactor: Record<Division, number> = {
    bronze: 0.85, prata: 0.95, ouro: 1.05, diamante: 1.15, lendaria: 1.25,
  };
  const youth = Math.max(0, 24 - input.age) * 1.5;
  const valueComponent = Math.log10(Math.max(10_000, input.marketValue)) * 4;
  const raw = (input.overall * 0.72 + input.halfStarBand * 3.5 + youth + valueComponent + (input.isProdigy ? 18 : 0)) * divisionFactor[input.division];
  return Math.max(12, Math.min(450, Math.round(raw / 5) * 5));
}

export function refreshCost(refreshNumber: number, division: Division) {
  if (refreshNumber === 1) return { currency: "free" as const, amount: 0 };
  if (refreshNumber === 2) return { currency: "money" as const, amount: GEM_ECONOMY_CONFIG.marketRefreshMoneyByDivision[division] };
  const index = Math.min(refreshNumber, 6) - 1;
  return { currency: "gems" as const, amount: GEM_ECONOMY_CONFIG.marketRefreshGemCosts[index] };
}
