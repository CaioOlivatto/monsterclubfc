import {
  DIVISION_ORDER,
  DIVISION_STAR_PROFILE,
  MATCH_REVENUE,
  TICKET_PRICE,
  computeAwayWinBonus,
  divisionalMatchSalary,
  revenueCapacity,
  totalMaintenancePerMatch,
  type Division,
} from "../src/lib/economy.ts";
import { stadiumCapacity } from "../src/lib/buildings.server.ts";

const prizes: Record<Division, Record<"W" | "D" | "L", number>> = {
  bronze: { W: 15_000, D: 6_000, L: 2_000 }, prata: { W: 28_000, D: 11_000, L: 4_000 },
  ouro: { W: 50_000, D: 20_000, L: 7_000 }, diamante: { W: 90_000, D: 36_000, L: 13_000 },
  lendaria: { W: 160_000, D: 64_000, L: 24_000 },
};
const buildings = [
  { building_type: "ct_treino", level: 1 }, { building_type: "estadio", level: 1 },
  { building_type: "centro_medico", level: 1 },
];
const averageOverall = (division: Division) => {
  const weights = DIVISION_STAR_PROFILE[division];
  return Math.round(weights.reduce((sum, weight, index) => sum + weight * (index + 1) * 10, 0) / weights.reduce((a, b) => a + b, 0));
};

const rows: object[] = [];
for (const division of DIVISION_ORDER) {
  const payroll = 26 * divisionalMatchSalary(averageOverall(division), division);
  const maintenance = totalMaintenancePerMatch(division, buildings);
  const expenses = payroll + maintenance;
  const fixed = Object.values(MATCH_REVENUE[division]).reduce((a, b) => a + b, 0);
  const gate = Math.round(revenueCapacity(division, stadiumCapacity(1)) * 0.73 * TICKET_PRICE[division]);
  for (const venue of ["home", "away"] as const) for (const result of ["W", "D", "L"] as const) {
    const awayBonus = venue === "away" && result === "W" ? computeAwayWinBonus(expenses, fixed, prizes[division][result], division) : 0;
    const net = fixed + (venue === "home" ? gate : 0) + prizes[division][result] + awayBonus - expenses;
    if (!Number.isFinite(net)) throw new Error(`Resultado inválido: ${division}/${venue}/${result}`);
    rows.push({ division, venue, result, fixed, gate: venue === "home" ? gate : 0, prize: prizes[division][result], awayBonus, payroll, maintenance, net });
  }
}
console.table(rows);
if (rows.length !== 30) throw new Error(`Esperados 30 cenários; recebidos ${rows.length}.`);
console.log("PASS auditoria econômica: 5 divisões × casa/fora × vitória/empate/derrota");
