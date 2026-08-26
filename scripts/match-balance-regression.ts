import assert from "node:assert/strict";
import { computeOdds, type EngineSide, type SlotRole } from "../src/lib/match-engine.server.ts";

const roles: SlotRole[] = ["GOL", "DEF", "DEF", "DEF", "DEF", "MEI", "MEI", "MEI", "MEI", "ATA", "ATA"];

function side(id: string, overall: number, division: EngineSide["division"] = "prata"): EngineSide {
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
    division,
    strategy: "equilibrada",
    tactics: { mentalidade: 0, verticalidade: 0, pressao: 0, cortes: 0 },
    medical_level: 1,
    starters: roles.map((role, index) => ({ role, creature: creature(index) })),
    bench: roles.slice(0, 7).map((role, index) => ({ role, creature: creature(index + 20) })),
  };
}

const samples = 4_000;
const promotions = [
  { from: "bronze", to: "prata", promotedOvr: 46, establishedOvr: 56 },
  { from: "prata", to: "ouro", promotedOvr: 59, establishedOvr: 64 },
  { from: "ouro", to: "diamante", promotedOvr: 70, establishedOvr: 74 },
  { from: "diamante", to: "lendaria", promotedOvr: 80, establishedOvr: 83 },
] as const;

const reports = promotions.map(({ from, to, promotedOvr, establishedOvr }, index) => {
  const promoted = side(`${from}-promovido`, promotedOvr, to);
  const established = side(`${to}-estabelecido`, establishedOvr, to);
  const promotedHome = computeOdds(promoted, established, 712_904 + index * 2, samples);
  const establishedHome = computeOdds(established, promoted, 712_905 + index * 2, samples);

  // O acesso preserva chance de surpresa, mas o patamar superior continua
  // favorito nos dois mandos quando possui OVR maior.
  assert.ok(
    promotedHome.away_win > promotedHome.home_win,
    `${to}: time estabelecido deve ser favorito fora: ${JSON.stringify(promotedHome)}`,
  );
  assert.ok(
    establishedHome.home_win > establishedHome.away_win,
    `${to}: time estabelecido deve ser favorito em casa: ${JSON.stringify(establishedHome)}`,
  );
  return { from, to, promotedHome, establishedHome };
});

const averageGoals = reports.reduce(
  (sum, report) => sum
    + report.promotedHome.avg_home_goals + report.promotedHome.avg_away_goals
    + report.establishedHome.avg_home_goals + report.establishedHome.avg_away_goals,
  0,
) / (reports.length * 2);
assert.ok(
  averageGoals >= 1.5 && averageGoals <= 4.2,
  `Média de gols fora da faixa de futebol: ${averageGoals.toFixed(2)}`,
);

console.log("Match balance regression: PASS", JSON.stringify({
  promotions: reports.map(({ from, to, promotedHome, establishedHome }) => ({
    route: `${from} → ${to}`,
    promotedHome: { home: promotedHome.home_win, draw: promotedHome.draw, away: promotedHome.away_win },
    establishedHome: { home: establishedHome.home_win, draw: establishedHome.draw, away: establishedHome.away_win },
  })),
  averageGoals: Number(averageGoals.toFixed(2)),
}, null, 2));
