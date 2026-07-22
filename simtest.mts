import { simulate, generateCpuSideFor } from './src/lib/match-engine.server';
let g=0,inj=0;const N=30;
for (let i=0;i<N;i++){
  const h=generateCpuSideFor(1000+i,'h','H',70);
  const a=generateCpuSideFor(2000+i,'a','A',70);
  const r=simulate(h,a,3000+i);
  g+=r.home_score+r.away_score; inj+=r.injuries.length;
}
console.log(`avg goals/match: ${(g/N).toFixed(2)}, avg injuries/match: ${(inj/N).toFixed(2)}, total inj in ${N}: ${inj}`);
