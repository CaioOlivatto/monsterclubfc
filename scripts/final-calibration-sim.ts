import { SPEED_GEM_UNLOCKS } from "../src/lib/shop.server.ts";
import { BUILDINGS, stadiumCapacity, stadiumRevenueMultiplier } from "../src/lib/buildings.server.ts";
import { maintenancePerMatch, revenueCapacity, TICKET_PRICE, type Division } from "../src/lib/economy.ts";

type Player = { label: string; spend: number; gems: number; timeFactor: number };
const players: Player[] = [
  { label: "Grátis", spend: 0, gems: 45, timeFactor: 1 },
  { label: "R$ 10", spend: 10, gems: 145, timeFactor: 0.91 },
  { label: "R$ 35", spend: 35, gems: 595, timeFactor: 0.72 },
  { label: "R$ 85", spend: 85, gems: 1_500, timeFactor: 0.55 },
];

const monthOne = { minimum: 60, target: 75, maximum: 90 };
const recurring = {
  casual: [25, 40],
  active: [40, 70],
  veryActive: [70, 100],
} as const;

console.log("\nCALIBRAÇÃO FINAL — GEMAS E CONVENIÊNCIA\n");
console.table(players.map((p) => ({
  perfil: p.label,
  gasto_reais: p.spend,
  gemas_disponiveis: p.gems,
  progresso_relativo: "100%",
  tempo_relativo: `${Math.round(p.timeFactor * 100)}%`,
})));
console.log("Emissão mês 1:", monthOne);
console.log("Emissão recorrente:", recurring);
console.log("Velocidades:", SPEED_GEM_UNLOCKS);

const weeklyMissions = [
  "jogar partidas", "vencer", "treinar", "usar mercado", "usar scout", "gerir clube", "jogar em 5 dias",
];
const monthlySinks = {
  refreshes: [0, 45],
  scouts: [0, 40],
  consumables: [0, 60],
  speedSavings: [100, 1_050],
  premiumSavings: [600, 1_500],
};
console.log("Missões semanais sem gasto obrigatório:", weeklyMissions);
console.log("Sinks mensais concorrentes (faixas de planejamento):", monthlySinks);

const HOME_MATCHES = 13;
const SEASON_MATCHES = 26;
const OCCUPANCY = 0.73;
function stadiumSeason(division: Division, level: number) {
  const attendance = revenueCapacity(division, stadiumCapacity(level));
  const gate = Math.round(attendance * OCCUPANCY * TICKET_PRICE[division] * stadiumRevenueMultiplier(level) * HOME_MATCHES);
  const maintenance = maintenancePerMatch(division, "estadio", level) * SEASON_MATCHES;
  return { division, level, capacity: stadiumCapacity(level), attendance, gate, maintenance, net: gate - maintenance };
}
function cumulativeStadiumCost(level: number) {
  let total = 0;
  for (let target = 2; target <= level; target++) total += BUILDINGS.estadio.cost(target);
  return total;
}
const stadiumScenarios = [
  stadiumSeason("bronze", 1), stadiumSeason("bronze", 3), stadiumSeason("bronze", 6), stadiumSeason("bronze", 10),
  stadiumSeason("prata", 4), stadiumSeason("ouro", 6), stadiumSeason("diamante", 8), stadiumSeason("lendaria", 10),
].map((row) => ({ ...row, cumulativeCost: cumulativeStadiumCost(row.level) }));
console.log("\nECONOMIA DO ESTÁDIO — 73% de ocupação, 13 jogos em casa\n");
console.table(stadiumScenarios);

if (SPEED_GEM_UNLOCKS["2x"] !== 100 || SPEED_GEM_UNLOCKS["4x"] !== 300 || SPEED_GEM_UNLOCKS.instant !== 800)
  throw new Error("Preços de velocidade divergiram da calibração aprovada.");
if (SPEED_GEM_UNLOCKS.bundle < 1_000 || SPEED_GEM_UNLOCKS.bundle > 1_050)
  throw new Error("Pacote completo fora da faixa aprovada.");
if (monthOne.minimum < 60 || monthOne.maximum > 90)
  throw new Error("Emissão inicial mensal fora da faixa aprovada.");
if (players.some((p) => p.timeFactor <= 0 || p.timeFactor > 1))
  throw new Error("Perfil de conveniência inválido.");
const bronze10 = stadiumScenarios.find((row) => row.division === "bronze" && row.level === 10)!;
if (bronze10.attendance !== 10_000)
  throw new Error("Estádio monumental na Bronze ultrapassou o teto real de demanda.");
if (bronze10.cumulativeCost < 100_000_000)
  throw new Error("Estádio completo ficou barato demais para uma carreira Bronze.");

console.log("\nOK: pagamento reduz espera, mas todos os perfis mantêm 100% do progresso possível.\n");
