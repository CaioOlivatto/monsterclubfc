import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Trophy, TrendingUp, TrendingDown, Minus, Shield, Crown, UsersRound } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getWorldRanking, type SortKey } from "@/lib/ranking.functions";
import { GamePageShell } from "@/components/GamePageShell";

const DIV_LABEL: Record<string, string> = { lendaria: "Lendária", diamante: "Diamante", ouro: "Ouro", prata: "Prata", bronze: "Bronze", amador: "Amador" };
const DIV_TONE: Record<string, string> = {
  lendaria: "bg-amber-500/15 text-amber-300 border-amber-500/40", diamante: "bg-cyan-500/15 text-cyan-300 border-cyan-500/40",
  ouro: "bg-yellow-500/15 text-yellow-300 border-yellow-500/40", prata: "bg-slate-400/15 text-slate-200 border-slate-400/40",
  bronze: "bg-orange-700/20 text-orange-200 border-orange-600/40", amador: "bg-slate-700/40 text-slate-300 border-slate-500/40",
};

export const Route = createFileRoute("/_authenticated/ranking")({
  head: () => ({ meta: [
    { title: "Ranking Mundial — Monster Club Manager" },
    { name: "description", content: "Ranking mundial das 300 academias do jogo. Suba de posição vencendo partidas e evoluindo sua academia." },
    { property: "og:title", content: "Ranking Mundial — Monster Club Manager" },
    { property: "og:description", content: "300 academias disputam pela glória. Onde a sua está?" },
  ] }),
  component: RankingPage,
});

function fmtMoney(v: number) {
  if (v >= 1_000_000) return "$ " + (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return "$ " + Math.round(v / 1_000) + "k";
  return "$ " + v.toLocaleString("pt-BR");
}

function RankingPage() {
  const [sort, setSort] = useState<SortKey>("level");
  const fetchRanking = useServerFn(getWorldRanking);
  const { data, isLoading } = useQuery({ queryKey: ["world-ranking", sort], queryFn: () => fetchRanking({ data: { sort } }) });

  return <GamePageShell title="Ranking Mundial" subtitle="A elite dos treinadores de criaturas" academyName={data?.player?.academy_name} trainerName={data?.player?.trainer_name} level={data?.player?.level} maxWidth="4xl">
    <section className="overflow-hidden rounded-2xl border border-violet-400/35 bg-slate-950/80 shadow-[0_14px_36px_rgba(2,6,23,0.5)] backdrop-blur-md">
      <div className="flex flex-col gap-3 border-b border-white/10 bg-gradient-to-r from-violet-950/55 via-slate-950/50 to-cyan-950/30 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl border border-amber-300/35 bg-amber-400/10"><Crown className="h-5 w-5 text-amber-300" /></div>
          <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-300">Hall da fama</p><h2 className="text-lg font-black text-white">Top 50 treinadores</h2><p className="text-xs text-slate-400">300 academias evoluindo a cada temporada</p></div>
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-full border-violet-400/30 bg-slate-900/90 text-slate-100 sm:w-[190px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="level">Por nível</SelectItem><SelectItem value="wins">Por vitórias</SelectItem><SelectItem value="patrimony">Por patrimônio</SelectItem></SelectContent>
        </Select>
      </div>
      <CardContent className="p-2.5 sm:p-3">
        {isLoading || !data ? <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[76px] w-full bg-slate-800/80" />)}</div> : <ul className="space-y-2">{data.top.map((row: any) => <RankRow key={row.id} row={row} sort={sort} />)}</ul>}
      </CardContent>
    </section>

    {data?.player && <section className="overflow-hidden rounded-2xl border border-cyan-400/35 bg-gradient-to-br from-cyan-950/35 via-slate-950/90 to-violet-950/55 shadow-[0_14px_36px_rgba(2,6,23,0.5)]">
      <div className="flex items-start gap-3 border-b border-white/10 p-4 sm:items-center sm:p-5"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-300/35 bg-cyan-400/10"><Trophy className="h-5 w-5 text-cyan-200" /></div><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">Sua posição</p><p className="mt-0.5 text-sm text-slate-300">Você está em <strong className="text-lg font-black text-white">{data.player.current_position}º</strong> de {data.total.toLocaleString("pt-BR")} academias</p>{data.player.last_position && data.player.last_position !== data.player.current_position && <div className="mt-1 text-xs"><Variation from={data.player.last_position} to={data.player.current_position} /></div>}</div></div>
      <div className="p-2.5 sm:p-3"><ul className="space-y-2">{data.context5.map((row: any) => <RankRow key={row.id} row={row} sort={sort} highlight={row.is_player} />)}</ul></div>
    </section>}
    <p className="flex items-center justify-center gap-2 px-2 pt-1 text-center text-xs text-slate-400"><UsersRound className="h-4 w-4 text-violet-300" />Academias da CPU também evoluem entre temporadas.</p>
  </GamePageShell>;
}

function Variation({ from, to }: { from: number; to: number }) {
  const diff = from - to;
  if (diff === 0) return <span className="inline-flex items-center gap-1 text-slate-400"><Minus className="h-3 w-3" /> sem mudança</span>;
  if (diff > 0) return <span className="inline-flex items-center gap-1 text-emerald-300"><TrendingUp className="h-3 w-3" /> subiu {diff} posições</span>;
  return <span className="inline-flex items-center gap-1 text-red-300"><TrendingDown className="h-3 w-3" /> caiu {Math.abs(diff)} posições</span>;
}

function RankRow({ row, sort, highlight }: { row: any; sort: SortKey; highlight?: boolean }) {
  const value = sort === "level" ? `Nível ${row.level}` : sort === "wins" ? `${row.wins.toLocaleString("pt-BR")} V` : fmtMoney(row.patrimony);
  return <li className={`grid grid-cols-[2.25rem_2.25rem_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border px-2.5 py-2.5 sm:grid-cols-[2.5rem_2.5rem_minmax(0,1fr)_auto_auto] sm:gap-3 sm:px-3 ${highlight || row.is_player ? "border-cyan-300/55 bg-cyan-400/10 shadow-[0_0_22px_rgba(34,211,238,0.08)]" : "border-white/10 bg-slate-900/65"}`}>
    <span className="text-center text-sm font-mono font-bold text-violet-200">{row.current_position}º</span>
    <Shield20 primary={row.primary_color} secondary={row.secondary_color} />
    <div className="min-w-0"><p className="truncate text-sm font-bold text-white">{row.academy_name}{row.is_player && <Badge variant="outline" className="ml-2 border-cyan-300/50 bg-cyan-400/10 text-[10px] text-cyan-100">Você</Badge>}</p><p className="mt-0.5 truncate text-xs font-semibold text-cyan-200"><span className="mr-1 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">Treinador</span>{row.trainer_name}</p></div>
    <Badge variant="outline" className={`hidden shrink-0 sm:inline-flex ${DIV_TONE[row.division] ?? ""}`}>{DIV_LABEL[row.division] ?? row.division}</Badge>
    <div className="min-w-[3.75rem] text-right"><span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:hidden">{DIV_LABEL[row.division] ?? row.division}</span><span className="block text-sm font-black tabular-nums text-amber-200">{value}</span>{sort !== "level" && <span className="text-[10px] text-slate-400">Nv. {row.level}</span>}</div>
  </li>;
}

function Shield20({ primary, secondary }: { primary: string; secondary: string }) {
  return <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/20 shadow-inner" style={{ background: `linear-gradient(135deg, ${primary} 50%, ${secondary} 50%)` }}><Shield className="h-3.5 w-3.5 text-white drop-shadow" /></div>;
}
