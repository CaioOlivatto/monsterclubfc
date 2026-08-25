import { DIVISION_ORDER, MATCH_REVENUE, TICKET_PRICE, revenueCapacity, maintenancePerMatch, divisionalMatchSalary, computeAwayWinBonus, type Division } from "../src/lib/economy.ts";
import { stadiumCapacity, stadiumRevenueMultiplier } from "../src/lib/buildings.server.ts";
import { calculatePerformanceRewards } from "../src/lib/performance-rewards.ts";

const prizes: Record<Division, Record<"W" | "D" | "L", number>> = {
  bronze: { W: 15_000, D: 6_000, L: 2_000 }, prata: { W: 28_000, D: 11_000, L: 4_000 }, ouro: { W: 50_000, D: 20_000, L: 7_000 }, diamante: { W: 90_000, D: 36_000, L: 13_000 }, lendaria: { W: 160_000, D: 64_000, L: 24_000 },
};
const ovr: Record<Division, number> = { bronze: 42, prata: 53, ouro: 64, diamante: 74, lendaria: 83 };
const infra = { basica: [1, 1, 1], media: [3, 5, 3], alta: [5, 10, 5] } as const;
const campaigns = { fraca: { W: 5, D: 6, L: 15 }, media: { W: 9, D: 8, L: 9 }, forte: { W: 15, D: 6, L: 5 } } as const;

function random(seed: number) { let s = seed >>> 0; return () => ((s = Math.imul(1664525, s) + 1013904223 >>> 0) / 2 ** 32); }
function scenario(d: Division, levels: readonly number[], campaign: { W: number; D: number; L: number }, seed: number) {
  const [ct, stadium, med] = levels;
  const rng = random(seed);
  const fixed = Object.values(MATCH_REVENUE[d]).reduce((a, b) => a + b, 0);
  const salary = 26 * divisionalMatchSalary(ovr[d], d);
  const maintenance = maintenancePerMatch(d, "ct_treino", ct) + maintenancePerMatch(d, "estadio", stadium) + maintenancePerMatch(d, "centro_medico", med);
  const gate = Math.round(revenueCapacity(d, stadiumCapacity(stadium)) * .73 * TICKET_PRICE[d] * stadiumRevenueMultiplier(stadium));
  const outcomes = ([...Array(campaign.W).fill("W"), ...Array(campaign.D).fill("D"), ...Array(campaign.L).fill("L")] as Array<"W" | "D" | "L">).sort(() => rng() - .5);
  let normal = 0, bonus = 0;
  outcomes.forEach((outcome, i) => {
    const home = i % 2 === 0;
    const gf = outcome === "W" ? 1 + Math.floor(rng() * 4) : outcome === "D" ? Math.floor(rng() * 3) : Math.floor(rng() * 2);
    const ga = outcome === "W" ? Math.floor(rng() * Math.min(2, gf)) : outcome === "D" ? gf : 1 + Math.floor(rng() * 4);
    const strategy = outcome === "W" && gf >= 4 ? "ofensiva" : outcome === "W" && ga === 0 ? "defensiva" : "equilibrada";
    const rewards = calculatePerformanceRewards({ division: d, official: true, playerGoals: gf, opponentGoals: ga, playerCards: rng() < .62 ? 0 : 1, outcome, strategy, strategyMinutes: 90 });
    bonus += rewards.reduce((s, r) => s + r.amount, 0);
    normal += fixed + prizes[d][outcome] + (home ? gate : 0) + (!home && outcome === "W" ? computeAwayWinBonus(0, 0, 0, d) : 0);
  });
  const expense = salary + maintenance * 26;
  return { normal, bonus, expense, net: normal + bonus - expense, bonusPct: bonus / Math.max(1, normal) };
}

const report: any[] = [];
for (const d of DIVISION_ORDER) for (const [name, levels] of Object.entries(infra)) for (const [campaign, outcomes] of Object.entries(campaigns)) {
  const runs = Array.from({ length: 1000 }, (_, i) => scenario(d, levels, outcomes, i + 1));
  const avg = (key: keyof ReturnType<typeof scenario>) => Math.round(runs.reduce((s, row) => s + Number(row[key]), 0) / runs.length);
  report.push({ divisao: d, infraestrutura: name, campanha: campaign, receita_normal: avg("normal"), bonus: avg("bonus"), bonus_pct: `${(runs.reduce((s, r) => s + r.bonusPct, 0) / runs.length * 100).toFixed(1)}%`, despesas: avg("expense"), saldo_operacional: avg("net"), insolvencia: `${(runs.filter(r => 400_000 + r.net < 0).length / 10).toFixed(1)}%` });
}
console.table(report);
if (report.length !== 45) throw new Error("Esperados 45 cenários econômicos");
const bonusRates = report.map(r => Number.parseFloat(r.bonus_pct));
console.log(`PASS economia v3: 45 cenários × 1.000 temporadas; bônus médio ${(bonusRates.reduce((a,b)=>a+b,0)/bonusRates.length).toFixed(1)}% da receita normal`);
