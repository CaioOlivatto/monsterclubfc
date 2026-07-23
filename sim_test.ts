import { simulateFast, generateCpuSideFor, type EngineBestiary } from "@/lib/match-engine.server";

const bestiary: EngineBestiary = {
  species: Array.from({ length: 40 }, (_, i) => ({
    species: `S${i}`,
    element: (["fogo","gelo","ar","terra","agua"] as const)[i % 5],
    is_goalkeeper: i < 6,
  })),
  epithets: [],
};

const divisions = ["bronze","prata","ouro","diamante","lendaria"] as const;
const ovrs = { bronze: 33, prata: 44, ouro: 55, diamante: 64, lendaria: 72 };

function run(n: number, div: keyof typeof ovrs) {
  let total = 0, hw=0, aw=0, dr=0;
  for (let i = 0; i < n; i++) {
    const home = generateCpuSideFor(i*7+1, `h${i}`, "Home", ovrs[div] + (i%7-3), bestiary);
    const away = generateCpuSideFor(i*11+2, `a${i}`, "Away", ovrs[div] + (i%5-2), bestiary);
    home.division = div; away.division = div;
    const r = simulateFast(home, away, i*13+3);
    total += r.home_score + r.away_score;
    if (r.home_score > r.away_score) hw++; else if (r.away_score > r.home_score) aw++; else dr++;
  }
  console.log(div, "avg goals/match:", (total/n).toFixed(2), "H/D/A", hw, dr, aw);
}

for (const d of divisions) run(200, d);
