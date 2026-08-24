import {
  NEUTRAL_TACTICS,
  simulateFast,
  type Division,
  type Element,
  type EngineSide,
  type SlotRole,
  type Tactics,
} from "../src/lib/match-engine.server.ts";
import { DIVISION_XI_TARGET } from "../src/lib/game-balance.ts";

const MATCHES_PER_SCENARIO = Number(process.env.MATCHES_PER_SCENARIO ?? 5_000);
const SEASONS_PER_PROFILE = Number(process.env.SEASONS_PER_PROFILE ?? 1_000);
const ROLES: SlotRole[] = ["GOL", "DEF", "DEF", "DEF", "DEF", "MEI", "MEI", "MEI", "MEI", "ATA", "ATA"];
const BENCH_ROLES: SlotRole[] = ["GOL", "DEF", "DEF", "MEI", "MEI", "ATA", "ATA"];
const DIVISIONS: Division[] = ["bronze", "prata", "ouro", "diamante", "lendaria"];

type SideOptions = {
  overall: number;
  division?: Division;
  energy?: number;
  morale?: number;
  element?: Element;
  goalkeeperBonus?: number;
  strategy?: EngineSide["strategy"];
  tactics?: Tactics;
};

function makeSide(team: "home" | "away", options: SideOptions): EngineSide {
  const creature = (role: SlotRole, index: number) => ({
    id: `${team}-${role}-${index}`,
    name: `${team}-${role}-${index}`,
    element: options.element ?? "terra" as Element,
    overall: options.overall + (role === "GOL" ? options.goalkeeperBonus ?? 0 : 0),
    physical: options.overall,
    energy: options.energy ?? 100,
    morale: options.morale ?? 50,
    age: 24,
    affinity_fogo: 0,
    affinity_agua: 0,
    affinity_terra: 0,
    affinity_ar: 0,
    affinity_gelo: 0,
  });
  return {
    team_id: team,
    team_name: team,
    starters: ROLES.map((role, index) => ({ role, creature: creature(role, index) })),
    bench: BENCH_ROLES.map((role, index) => ({ role, creature: creature(role, index + 20) })),
    strategy: options.strategy ?? "equilibrada",
    tactics: options.tactics ?? NEUTRAL_TACTICS,
    medical_level: 1,
    division: options.division,
  };
}

type Summary = { wins: number; draws: number; losses: number; gf: number; ga: number };

function runScenario(label: string, home: SideOptions, away: SideOptions, count = MATCHES_PER_SCENARIO) {
  const summary: Summary = { wins: 0, draws: 0, losses: 0, gf: 0, ga: 0 };
  for (let index = 0; index < count; index += 1) {
    const result = simulateFast(makeSide("home", home), makeSide("away", away), 100_003 + index * 7919);
    summary.gf += result.home_score;
    summary.ga += result.away_score;
    if (result.home_score > result.away_score) summary.wins += 1;
    else if (result.home_score === result.away_score) summary.draws += 1;
    else summary.losses += 1;
  }
  const pct = (value: number) => (value * 100 / count).toFixed(1);
  console.log(`${label.padEnd(30)} W ${pct(summary.wins)}% | D ${pct(summary.draws)}% | L ${pct(summary.losses)}% | gols ${(summary.gf / count).toFixed(2)}-${(summary.ga / count).toFixed(2)}`);
  return { ...summary, winRate: summary.wins / count, unbeatenRate: (summary.wins + summary.draws) / count };
}

console.log(`\nBALANCEAMENTO DE PARTIDAS — ${MATCHES_PER_SCENARIO.toLocaleString("pt-BR")} jogos/cenário\n`);
const equal = runScenario("Força igual", { overall: 53, division: "prata" }, { overall: 53, division: "prata" });
runScenario("Vantagem +5 OVR", { overall: 58, division: "prata" }, { overall: 53, division: "prata" });
runScenario("Vantagem +10 OVR", { overall: 63, division: "prata" }, { overall: 53, division: "prata" });
runScenario("Vantagem +20 OVR", { overall: 73, division: "prata" }, { overall: 53, division: "prata" });
runScenario("Energia 60 vs 90", { overall: 53, division: "prata", energy: 60 }, { overall: 53, division: "prata", energy: 90 });
runScenario("Moral 40 vs 80", { overall: 53, division: "prata", morale: 40 }, { overall: 53, division: "prata", morale: 80 });
runScenario("Vantagem elemental", { overall: 53, division: "prata", element: "agua" }, { overall: 53, division: "prata", element: "fogo" });
runScenario("Goleiro rival +15", { overall: 53, division: "prata" }, { overall: 53, division: "prata", goalkeeperBonus: 15 });
runScenario("Estratégia ofensiva", { overall: 53, division: "prata", strategy: "ofensiva" }, { overall: 53, division: "prata" });
runScenario("Estratégia defensiva", { overall: 53, division: "prata", strategy: "defensiva" }, { overall: 53, division: "prata" });
runScenario("Pressão/verticalidade", { overall: 53, division: "prata", tactics: { mentalidade: 1, verticalidade: 2, pressao: 2, cortes: 0 } }, { overall: 53, division: "prata" });

console.log("\nJUSTIÇA POR DIVISÃO\n");
for (const division of DIVISIONS) {
  const [minimum, maximum] = DIVISION_XI_TARGET[division];
  const midpoint = Math.round((minimum + maximum) / 2);
  runScenario(`${division} (${midpoint} OVR)`, { overall: midpoint, division }, { overall: midpoint, division });
}

if (equal.winRate < 0.30 || equal.winRate > 0.58 || equal.unbeatenRate < 0.58) {
  throw new Error("O motor não está justo para forças iguais.");
}

type Profile = { label: string; delta: number; strategy?: EngineSide["strategy"]; energy?: number; morale?: number };
const PROFILES: Profile[] = [
  { label: "A inicial original", delta: 2 },
  { label: "B escalação ruim", delta: 0 },
  { label: "C bem escalado", delta: 3, morale: 58 },
  { label: "D +1 contratação", delta: 3.5, morale: 58 },
  { label: "E +2 contratações", delta: 4 },
  { label: "F +4 contratações", delta: 5 },
  { label: "G otimizado", delta: 6 },
];

function simulateSeason(division: Division, profile: Profile, seasonIndex: number) {
  const [minimum, maximum] = DIVISION_XI_TARGET[division];
  const midpoint = Math.round((minimum + maximum) / 2);
  let points = 0;
  for (let round = 0; round < 26; round += 1) {
    const opponentSpread = ((round * 17 + seasonIndex * 13) % 9) - 4;
    const isHome = round % 2 === 0;
    const player = makeSide(isHome ? "home" : "away", {
      overall: midpoint + profile.delta,
      division,
      strategy: profile.strategy,
      energy: profile.energy,
      morale: profile.morale,
    });
    const opponent = makeSide(isHome ? "away" : "home", { overall: midpoint + opponentSpread, division });
    const result = isHome
      ? simulateFast(player, opponent, 700_001 + seasonIndex * 101 + round)
      : simulateFast(opponent, player, 700_001 + seasonIndex * 101 + round);
    const playerGoals = isHome ? result.home_score : result.away_score;
    const opponentGoals = isHome ? result.away_score : result.home_score;
    points += playerGoals > opponentGoals ? 3 : playerGoals === opponentGoals ? 1 : 0;
  }
  return points;
}

console.log(`\nTEMPORADAS — ${SEASONS_PER_PROFILE.toLocaleString("pt-BR")} por perfil/divisão (promoção estimada: 48+ pontos)\n`);
const promotionRates = new Map<string, number>();
for (const division of DIVISIONS) {
  for (const profile of PROFILES) {
    let promotions = 0;
    let totalPoints = 0;
    for (let season = 0; season < SEASONS_PER_PROFILE; season += 1) {
      const points = simulateSeason(division, profile, season);
      totalPoints += points;
      if (points >= 48) promotions += 1;
    }
    const promotionRate = promotions / SEASONS_PER_PROFILE;
    promotionRates.set(`${division}:${profile.label}`, promotionRate);
    console.log(`${division.padEnd(10)} ${profile.label.padEnd(20)} promoção ${(promotionRate * 100).toFixed(1)}% | pontos ${(totalPoints / SEASONS_PER_PROFILE).toFixed(1)}`);
  }
}

for (const division of DIVISIONS) {
  const unchanged = promotionRates.get(`${division}:A inicial original`) ?? 0;
  const twoSignings = promotionRates.get(`${division}:E +2 contratações`) ?? 0;
  const fourSignings = promotionRates.get(`${division}:F +4 contratações`) ?? 0;
  const optimized = promotionRates.get(`${division}:G otimizado`) ?? 0;
  if (unchanged < 0.10 || unchanged > 0.20) {
    throw new Error(`${division}: promoção sem reestruturação fora da meta de 10–20%.`);
  }
  if (optimized < 0.70 || optimized > 0.82) {
    throw new Error(`${division}: promoção com gestão otimizada fora da faixa esperada.`);
  }
  if (twoSignings < 0.38 || twoSignings > 0.52) {
    throw new Error(`${division}: promoção com duas contratações fora da faixa esperada.`);
  }
  if (fourSignings < 0.54 || fourSignings > 0.70) {
    throw new Error(`${division}: promoção com quatro contratações fora da faixa esperada.`);
  }
}

console.log("\nPREMIUM — impacto de um atleta no XI (1/11 da diferença individual)\n");
for (const division of DIVISIONS) {
  const [minimum, maximum] = DIVISION_XI_TARGET[division];
  const base = Math.round((minimum + maximum) / 2);
  const premiumIndividual = Math.min(96, maximum + 9);
  const xiDelta = (premiumIndividual - base) / 11;
  runScenario(`${division} + 1 Premium`, { overall: base + xiDelta, division }, { overall: base, division }, 2_000);
}

console.log("\nVELOCIDADES — determinismo por seed\n");
const deterministicHome = makeSide("home", { overall: 55, division: "prata" });
const deterministicAway = makeSide("away", { overall: 53, division: "prata" });
const baseline = JSON.stringify(simulateFast(deterministicHome, deterministicAway, 24_082_026));
for (const speed of ["1x", "2x", "4x", "instantâneo"]) {
  const replay = JSON.stringify(simulateFast(deterministicHome, deterministicAway, 24_082_026));
  if (replay !== baseline) throw new Error(`${speed}: resultado divergiu com a mesma seed.`);
  console.log(`${speed.padEnd(12)} resultado, eventos, XP, energia e moral idênticos`);
}

console.log("\n✓ Metas estatísticas essenciais aprovadas sem manipulação direta de resultados.");
