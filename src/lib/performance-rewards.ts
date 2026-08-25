import type { Division } from "./economy";

export type PerformanceRewardType = "goals" | "clean_sheet" | "fair_play" | "tactical_wall" | "total_attack";

const BY_DIVISION: Record<Division, Record<PerformanceRewardType, number>> = {
  bronze: { goals: 1_250, clean_sheet: 2_500, fair_play: 2_000, tactical_wall: 2_500, total_attack: 2_500 },
  prata: { goals: 2_500, clean_sheet: 5_000, fair_play: 4_000, tactical_wall: 5_000, total_attack: 5_000 },
  ouro: { goals: 5_000, clean_sheet: 10_000, fair_play: 7_500, tactical_wall: 10_000, total_attack: 10_000 },
  diamante: { goals: 10_000, clean_sheet: 18_000, fair_play: 15_000, tactical_wall: 20_000, total_attack: 20_000 },
  lendaria: { goals: 18_000, clean_sheet: 30_000, fair_play: 25_000, tactical_wall: 35_000, total_attack: 35_000 },
};

export type Strategy = "defensiva" | "equilibrada" | "ofensiva";
export type PerformanceReward = { type: PerformanceRewardType; amount: number; details: Record<string, number | string> };

export function calculatePerformanceRewards(input: {
  division: Division;
  official: boolean;
  playerGoals: number;
  opponentGoals: number;
  playerCards: number;
  outcome: "W" | "D" | "L";
  strategy: Strategy;
  strategyMinutes: number;
}): PerformanceReward[] {
  if (!input.official) return [];
  const reward = BY_DIVISION[input.division];
  const out: PerformanceReward[] = [];
  const goals = Math.min(5, Math.max(0, input.playerGoals));
  if (goals) out.push({ type: "goals", amount: goals * reward.goals, details: { goals, cap: 5 } });
  if (input.opponentGoals === 0) out.push({ type: "clean_sheet", amount: reward.clean_sheet, details: {} });
  if (input.playerCards === 0) out.push({ type: "fair_play", amount: reward.fair_play, details: {} });
  if (input.outcome === "W" && input.opponentGoals === 0 && input.strategy === "defensiva" && input.strategyMinutes >= 54) {
    out.push({ type: "tactical_wall", amount: reward.tactical_wall, details: { strategy_minutes: input.strategyMinutes } });
  }
  if (input.outcome === "W" && input.playerGoals >= 4 && input.strategy === "ofensiva" && input.strategyMinutes >= 54) {
    out.push({ type: "total_attack", amount: reward.total_attack, details: { strategy_minutes: input.strategyMinutes } });
  }
  return out;
}

export function rewardLabel(type: PerformanceRewardType) {
  return { goals: "Bônus por gols", clean_sheet: "Defesa impecável", fair_play: "Fair Play", tactical_wall: "Muralha tática", total_attack: "Ataque total" }[type];
}
