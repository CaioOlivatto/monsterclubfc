import assert from "node:assert/strict";
import { computeOdds, type EngineSide, type SlotRole } from "../src/lib/match-engine.server.ts";

const roles: SlotRole[] = ["GOL", "DEF", "DEF", "DEF", "DEF", "MEI", "MEI", "MEI", "MEI", "ATA", "ATA"];

function side(id: string, overall: number): EngineSide {
  const creature = (index: number) => ({
    id: `${id}-${index}`,
    name: `${id}-${index}`,
    element: (["fogo", "agua", "terra", "ar", "gelo"] as const)[index % 5],
    overall,
    physical: overall,
    energy: 100,
    morale: 50,
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
    division: "prata",
    strategy: "equilibrada",
    tactics: { mentalidade: 0, verticalidade: 0, pressao: 0, cortes: 0 },
    medical_level: 1,
    starters: roles.map((role, index) => ({ role, creature: creature(index) })),
    bench: roles.slice(0, 7).map((role, index) => ({ role, creature: creature(index + 20) })),
  };
}

const promoted = side("promovido", 46);
const established = side("prata-estabelecida", 56);
const samples = 4_000;

const promotedHome = computeOdds(promoted, established, 712_904, samples);
const establishedHome = computeOdds(established, promoted, 712_905, samples);

// Dez pontos de OVR precisam superar o mando de campo. A zebra continua
// possível, mas não pode se tornar o resultado mais provável.
assert.ok(
  promotedHome.away_win > promotedHome.home_win,
  `Prata +10 OVR como visitante deve ser favorita: ${JSON.stringify(promotedHome)}`,
);
assert.ok(
  establishedHome.home_win > establishedHome.away_win,
  `Prata +10 OVR em casa deve ser favorita: ${JSON.stringify(establishedHome)}`,
);

const averageGoals = (
  promotedHome.avg_home_goals + promotedHome.avg_away_goals
  + establishedHome.avg_home_goals + establishedHome.avg_away_goals
) / 2;
assert.ok(
  averageGoals >= 1.5 && averageGoals <= 4.2,
  `Média de gols fora da faixa de futebol: ${averageGoals.toFixed(2)}`,
);

console.log("Match balance regression: PASS", {
  promotedHome,
  establishedHome,
  averageGoals: Number(averageGoals.toFixed(2)),
});
