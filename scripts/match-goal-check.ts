import { simulateFast, type EngineSide, type SlotRole } from "../src/lib/match-engine.server.ts";

const ROLES: SlotRole[] = ["GOL", "DEF", "DEF", "DEF", "DEF", "MEI", "MEI", "MEI", "MEI", "ATA", "ATA"];

function side(id: string, strategy: EngineSide["strategy"]): EngineSide {
  const starters = ROLES.map((role, index) => ({
    role,
    creature: {
      id: `${id}-${index}`,
      name: `${id}-${index}`,
      element: (["fogo", "agua", "terra", "ar", "gelo"] as const)[index % 5],
      overall: 33,
      physical: 33,
      energy: 100,
      morale: 50,
      age: 24,
      affinity_fogo: 0,
      affinity_agua: 0,
      affinity_terra: 0,
      affinity_ar: 0,
      affinity_gelo: 0,
    },
  }));
  return {
    team_id: id,
    team_name: id,
    starters,
    bench: [],
    strategy,
    division: "bronze",
    medical_level: 1,
  };
}

const samples = Math.max(10_000, Number(process.argv[2] ?? 50_000));
for (const strategy of ["defensiva", "equilibrada", "ofensiva"] as const) {
  let goals = 0;
  let sevenPlus = 0;
  let fourGoalMargin = 0;
  let scoreNinePlus = 0;
  for (let seed = 1; seed <= samples; seed += 1) {
    const result = simulateFast(side("home", strategy), side("away", "equilibrada"), seed * 7919);
    const total = result.home_score + result.away_score;
    goals += total;
    if (total >= 7) sevenPlus += 1;
    if (Math.abs(result.home_score - result.away_score) >= 4) fourGoalMargin += 1;
    if (total >= 9) scoreNinePlus += 1;
  }
  console.log(JSON.stringify({
    strategy,
    samples,
    avg_total_goals: Number((goals / samples).toFixed(3)),
    seven_plus_pct: Number((sevenPlus * 100 / samples).toFixed(2)),
    four_goal_margin_pct: Number((fourGoalMargin * 100 / samples).toFixed(2)),
    nine_plus_pct: Number((scoreNinePlus * 100 / samples).toFixed(2)),
  }));
}
