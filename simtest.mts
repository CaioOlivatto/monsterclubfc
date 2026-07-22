import { simulate, generateCpuSideFor } from './src/lib/match-engine.server';
let totalGoals=0, totalInjuries=0;
const results:any[]=[];
for (let i=0;i<3;i++){
  const h=generateCpuSideFor(1000+i,'h','Home',70);
  const a=generateCpuSideFor(2000+i,'a','Away',70);
  const r=simulate(h,a,3000+i);
  totalGoals+=r.home_score+r.away_score;
  totalInjuries+=r.injuries.length;
  results.push({score:`${r.home_score}-${r.away_score}`,injuries:r.injuries.length});
}
console.log(JSON.stringify({totalGoals,totalInjuries,results}));
