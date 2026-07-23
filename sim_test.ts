import { simulate, simulateFast, generateCpuSideFor, type EngineBestiary } from "@/lib/match-engine.server";
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

function run(n: number, div: keyof typeof ovrs, fn: (h:any,a:any,s:number)=>{home_score:number;away_score:number}) {
  let total = 0;
  for (let i = 0; i < n; i++) {
    const home = generateCpuSideFor(i*7+1, `h${i}`, "Home", ovrs[div] + (i%7-3), bestiary);
    const away = generateCpuSideFor(i*11+2, `a${i}`, "Away", ovrs[div] + (i%5-2), bestiary);
    home.division = div; away.division = div;
    const r = fn(home, away, i*13+3);
    total += r.home_score + r.away_score;
  }
  return (total/n);
}
console.log("Division | simulateFast | simulate");
for (const d of divisions) {
  const fast = run(200, d, simulateFast);
  const full = run(100, d, simulate);
  console.log(d, fast.toFixed(2), full.toFixed(2));
}
