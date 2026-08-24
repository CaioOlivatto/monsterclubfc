import { GEM_ECONOMY_CONFIG as cfg } from "../src/lib/gem-economy.ts";

type Activity = { name: "CASUAL" | "ATIVO" | "MUITO_ATIVO"; monthlyEarned: number; monthlyOrganicSpend: number; refreshes: number; scouts: number; consumables: number; seasonsPerMonth: number };
type Buyer = { name: string; monthlyBought: number };

const activities: Activity[] = [
  { name: "CASUAL", monthlyEarned: 32, monthlyOrganicSpend: 10, refreshes: 1, scouts: 0, consumables: 1, seasonsPerMonth: 0.45 },
  { name: "ATIVO", monthlyEarned: 58, monthlyOrganicSpend: 28, refreshes: 2, scouts: 1, consumables: 2, seasonsPerMonth: 0.75 },
  { name: "MUITO_ATIVO", monthlyEarned: 88, monthlyOrganicSpend: 50, refreshes: 3, scouts: 2, consumables: 3, seasonsPerMonth: 1 },
];
const buyers: Buyer[] = [
  { name: "FREE", monthlyBought: 0 }, { name: "R$10", monthlyBought: 100 },
  { name: "R$25", monthlyBought: 450 }, { name: "R$50", monthlyBought: 1_050 },
  { name: "R$85", monthlyBought: 2_200 }, { name: "R$200", monthlyBought: 6_000 },
];
const horizons = [1, 3, 6, 12] as const;
const targets = [
  { name: "2x", gems: cfg.speedCosts.speed2x }, { name: "4x", gems: cfg.speedCosts.speed4x },
  { name: "Instantâneo", gems: cfg.speedCosts.instant }, { name: "Bundle", gems: cfg.speedCosts.bundle },
  ...Object.entries(cfg.premiumGemPriceByDivision).map(([division, gems]) => ({ name: `Premium ${division}`, gems })),
];

function monthsToTarget(monthlyEarned: number, monthlySpend: number, target: number) {
  const net = monthlyEarned - monthlySpend;
  return net <= 0 ? null : Math.ceil(Math.max(0, target - cfg.initialGems) / net);
}

const scenarios = activities.flatMap((activity) => buyers.flatMap((buyer) => horizons.map((months) => {
  const earned = cfg.initialGems + activity.monthlyEarned * months;
  const bought = buyer.monthlyBought * months;
  const organicSpent = activity.monthlyOrganicSpend * months;
  const available = Math.max(0, earned + bought - organicSpent);
  const canPremium = available >= cfg.premiumGemPriceByDivision.bronze;
  const canBundle = available >= cfg.speedCosts.bundle;
  const discretionarySpent = canPremium ? cfg.premiumGemPriceByDivision.bronze : canBundle ? cfg.speedCosts.bundle : 0;
  return {
    activity: activity.name, buyer: buyer.name, months, earned, bought,
    spent: organicSpent + discretionarySpent, balance: available - discretionarySpent,
    refreshes: activity.refreshes * months, scouts: activity.scouts * months,
    consumables: activity.consumables * months, speeds: canBundle ? 1 : 0,
    premium: canPremium ? Math.min(1, Math.ceil(activity.seasonsPerMonth * months)) : 0,
    seasons: Number((activity.seasonsPerMonth * months).toFixed(1)),
    mainDecision: canPremium ? "Premium ou velocidades/serviços" : canBundle ? "Bundle ou poupar para Premium" : "Scouts/refreshes ou poupar",
  };
})));

const freeTargets = activities.map((activity) => ({
  activity: activity.name,
  typical: Object.fromEntries(targets.map((target) => [target.name, monthsToTarget(activity.monthlyEarned, activity.monthlyOrganicSpend, target.gems)])),
  saver: Object.fromEntries(targets.map((target) => [target.name, monthsToTarget(activity.monthlyEarned, 0, target.gems)])),
}));
const inflation = activities.map((activity) => ({
  activity: activity.name,
  balances: Object.fromEntries([3, 6, 12].map((months) => [months, cfg.initialGems + (activity.monthlyEarned - activity.monthlyOrganicSpend) * months])),
}));

const middle = cfg.shopPackages.find((pack) => pack.priceCents === 8_490);
if (!middle || middle.gems !== 2_200) throw new Error("Pacote central de R$ 84,90 deve entregar 2.200 gemas.");
if (middle.gems >= cfg.premiumGemPriceByDivision.bronze + cfg.speedCosts.bundle) throw new Error("Pacote central compra Premium Bronze e Bundle simultaneamente.");
if (cfg.weeklyMissions.weeklyGemCeiling < 20 || cfg.weeklyMissions.weeklyGemCeiling > 25) throw new Error("Teto semanal fora de 20–25 gemas.");
if (cfg.initialGems !== 10) throw new Error("Saldo inicial deve ser 10 gemas.");
if (cfg.marketCycleHours !== 12 || cfg.scoutGemCost !== 10) throw new Error("Mercado/Scout divergentes.");

console.log(JSON.stringify({ scenarios, freeTargets, inflation }, null, 2));
console.log(JSON.stringify({ verdict: "PASS", middlePackageGems: middle.gems, bronzePremiumPlusSpeed: cfg.premiumGemPriceByDivision.bronze + cfg.speedCosts.bundle, weeklyCeiling: cfg.weeklyMissions.weeklyGemCeiling, monthlyEmission: Object.fromEntries(activities.map((profile) => [profile.name, profile.monthlyEarned])) }));
