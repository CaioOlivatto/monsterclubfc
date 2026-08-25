import { NEUTRAL_TACTICS, simulateFast, type EngineSide, type SlotRole } from "../src/lib/match-engine.server.ts";

const SEASONS = Number(process.env.SEASONS ?? 1_000);
const ROLES: SlotRole[] = ["GOL","DEF","DEF","DEF","DEF","MEI","MEI","MEI","MEI","ATA","ATA"];
const CPU = [39,40,41,42,43,44,44,44,44,44,45,46,47];
const profiles = [
  { key: "sem_mudancas", label: "Sem mudanças", ovr: 46, morale: 50 },
  { key: "boa_escalacao", label: "Boa escalação", ovr: 46, morale: 53 },
  { key: "mais_2", label: "+2 contratações", ovr: 47, morale: 51 },
  { key: "mais_4", label: "+4 contratações", ovr: 48, morale: 52 },
  { key: "otimizado", label: "Gestão otimizada", ovr: 49, morale: 53 },
];

function rng(seed: number) { let a=seed>>>0; return () => { a=(a+0x6d2b79f5)>>>0; let t=a; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; }; }
function side(id: string, overall: number, morale: number): EngineSide {
  return { team_id:id, team_name:id, strategy:"equilibrada", tactics:NEUTRAL_TACTICS, medical_level:1, division:"bronze",
    starters:ROLES.map((role,i)=>({role,creature:{id:`${id}-${i}`,name:`${id}-${i}`,element:"terra",overall,physical:overall,energy:92,morale,affinity_fogo:0,affinity_agua:0,affinity_terra:0,affinity_ar:0,affinity_gelo:0}})), bench:[] };
}
const blockFor = (round:number) => round <= 5 ? "1-5" : round <= 13 ? "6-13" : "14-26";

for (const profile of profiles) {
  const blocks: Record<string,{w:number;d:number;l:number;n:number}> = {"1-5":{w:0,d:0,l:0,n:0},"6-13":{w:0,d:0,l:0,n:0},"14-26":{w:0,d:0,l:0,n:0}};
  let promotions=0, pointsSum=0;
  for (let season=0; season<SEASONS; season++) {
    const random=rng(910_001+season*7919);
    const first=[...CPU].sort(()=>random()-.5);
    const opponents=[...first,...first].slice(0,26);
    let points=0;
    for (let i=0;i<26;i++) {
      const round=i+1, home=i%2===0;
      const player=side("player",profile.ovr,profile.morale), cpu=side("cpu",opponents[i],50);
      const result=home?simulateFast(player,cpu,season*10_000+round):simulateFast(cpu,player,season*10_000+round);
      const gf=home?result.home_score:result.away_score, ga=home?result.away_score:result.home_score;
      const b=blocks[blockFor(round)]; b.n++;
      if(gf>ga){b.w++;points+=3;} else if(gf===ga){b.d++;points++;} else b.l++;
    }
    pointsSum+=points; if(points>=48) promotions++;
  }
  const pct=(v:number,n:number)=>(100*v/n).toFixed(1)+"%";
  console.log(JSON.stringify({perfil:profile.label,xi_ovr:profile.ovr,blocos:Object.fromEntries(Object.entries(blocks).map(([k,b])=>[k,{V:pct(b.w,b.n),E:pct(b.d,b.n),D:pct(b.l,b.n)}])),pontos:(pointsSum/SEASONS).toFixed(1),promocao_aprox:pct(promotions,SEASONS)}));
}
