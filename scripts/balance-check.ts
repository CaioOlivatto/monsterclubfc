import assert from "node:assert/strict";
import {
  CUP_PHASE_BONUS,
  DIVISION_MAX_BAND,
  DIVISION_ORDER,
  DIVISION_SALARY_CAP,
  MATCH_REVENUE,
  TICKET_PRICE,
  ATTENDANCE_DEMAND_CAP,
  computeAwayWinBonus,
  computeWorldParticipationGrant,
  divisionalMatchSalary,
  eliteRenewalFee,
  eliteTreasuryReserveFee,
  matchSalary,
  maintenancePerMatch,
  worldLeaguePhaseBonus,
} from "../src/lib/economy.ts";

for (let index = 1; index < DIVISION_ORDER.length; index += 1) {
  const lower = DIVISION_ORDER[index - 1];
  const higher = DIVISION_ORDER[index];
  const lowerRevenue = Object.values(MATCH_REVENUE[lower]).reduce((sum, value) => sum + value, 0);
  const higherRevenue = Object.values(MATCH_REVENUE[higher]).reduce((sum, value) => sum + value, 0);

  assert.ok(higherRevenue > lowerRevenue, `Receita deve crescer de ${lower} para ${higher}`);
  assert.ok(
    TICKET_PRICE[higher] > TICKET_PRICE[lower],
    `Ingresso deve crescer de ${lower} para ${higher}`,
  );
  assert.ok(
    ATTENDANCE_DEMAND_CAP[higher] > ATTENDANCE_DEMAND_CAP[lower],
    `Demanda deve crescer de ${lower} para ${higher}`,
  );
  assert.ok(
    DIVISION_SALARY_CAP[higher] > DIVISION_SALARY_CAP[lower],
    `Teto salarial deve crescer de ${lower} para ${higher}`,
  );
  assert.ok(
    CUP_PHASE_BONUS[higher].champion > CUP_PHASE_BONUS[lower].champion,
    `Copa deve premiar mais em ${higher}`,
  );
  assert.ok(worldLeaguePhaseBonus(higher, "champion") > worldLeaguePhaseBonus(lower, "champion"));
  assert.ok(DIVISION_MAX_BAND[higher] >= DIVISION_MAX_BAND[lower]);
}

for (const division of DIVISION_ORDER) {
  for (const building of ["estadio", "ct_treino", "centro_medico"]) {
    assert.ok(
      maintenancePerMatch(division, building, 2) > maintenancePerMatch(division, building, 1),
    );
  }
}

assert.equal(computeAwayWinBonus(100_000, 60_000, 20_000), 28_000);
assert.equal(computeAwayWinBonus(50_000, 60_000, 20_000), 8_000);
assert.equal(computeWorldParticipationGrant(100_000, 60_000), 30_000);
assert.equal(computeWorldParticipationGrant(50_000, 60_000), 0);
assert.equal(divisionalMatchSalary(90, "bronze"), matchSalary(90));
assert.equal(divisionalMatchSalary(90, "prata"), matchSalary(90));
assert.ok(divisionalMatchSalary(90, "diamante") > matchSalary(90));
assert.ok(divisionalMatchSalary(90, "lendaria") > divisionalMatchSalary(90, "diamante"));
assert.equal(eliteRenewalFee("ouro", [{ overall: 90 }]), 0);
assert.ok(eliteRenewalFee("lendaria", [{ overall: 90 }]) > 0);
assert.equal(eliteTreasuryReserveFee("bronze", 100_000_000), 0);
assert.equal(eliteTreasuryReserveFee("ouro", 100_000_000), 0);
assert.equal(eliteTreasuryReserveFee("diamante", 12_000_000), 0);
assert.ok(
  eliteTreasuryReserveFee("lendaria", 30_000_000) > eliteTreasuryReserveFee("diamante", 20_000_000),
);

console.log("Balance checks: OK");
