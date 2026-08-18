import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Trophy, TrendingUp, TrendingDown, Minus, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getWorldRanking, type SortKey } from "@/lib/ranking.functions";

const DIV_LABEL: Record<string, string> = {
  lendaria: "Lendária",
  diamante: "Diamante",
  ouro: "Ouro",
  prata: "Prata",
  bronze: "Bronze",
  amador: "Amador",
};
const DIV_TONE: Record<string, string> = {
  lendaria: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  diamante: "bg-cyan-500/15 text-cyan-300 border-cyan-500/40",
  ouro: "bg-yellow-500/15 text-yellow-300 border-yellow-500/40",
  prata: "bg-slate-400/15 text-slate-200 border-slate-400/40",
  bronze: "bg-orange-700/20 text-orange-200 border-orange-600/40",
  amador: "bg-muted text-muted-foreground border-border",
};

export const Route = createFileRoute("/_authenticated/ranking")({
  head: () => ({
    meta: [
      { title: "Ranking Mundial — Monster Club Manager" },
      { name: "description", content: "Ranking mundial das 300 academias do jogo. Suba de posição vencendo partidas e evoluindo sua academia." },
      { property: "og:title", content: "Ranking Mundial — Monster Club Manager" },
      { property: "og:description", content: "300 academias disputam pela glória. Onde a sua está?" },
    ],
  }),
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
  const { data, isLoading } = useQuery({
    queryKey: ["world-ranking", sort],
    queryFn: () => fetchRanking({ data: { sort } }),
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4">
          <Link to="/dashboard">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Mundo</p>
            <h1 className="text-lg font-bold sm:text-2xl">Ranking Mundial de Treinadores</h1>
            <p className="text-xs text-muted-foreground">
              300 academias — jogadores reais substituem gradualmente as academias simuladas
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 p-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">Top 50</CardTitle>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="level">Por Nível</SelectItem>
                <SelectItem value="wins">Por Vitórias</SelectItem>
                <SelectItem value="patrimony">Por Patrimônio</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {isLoading || !data ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <ul className="space-y-1">
                {data.top.map((row: any) => (
                  <RankRow key={row.id} row={row} sort={sort} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {data?.player && (
          <Card className="border-primary/50 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Trophy className="h-4 w-4 text-primary" />
                Sua posição
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Você está em <strong className="text-foreground">{data.player.current_position}º</strong> de{" "}
                {data.total.toLocaleString("pt-BR")} academias
                {data.player.last_position && data.player.last_position !== data.player.current_position && (
                  <> · <Variation from={data.player.last_position} to={data.player.current_position} /></>
                )}
              </p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1">
                {data.context5.map((row: any) => (
                  <RankRow key={row.id} row={row} sort={sort} highlight={row.is_player} />
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <p className="pt-2 text-center text-xs text-muted-foreground">
          As academias controladas pela CPU também evoluem entre temporadas.
        </p>
      </main>
    </div>
  );
}

function Variation({ from, to }: { from: number; to: number }) {
  const diff = from - to; // positivo = subiu
  if (diff === 0) return <span className="inline-flex items-center gap-1 text-muted-foreground"><Minus className="h-3 w-3" /> sem mudança</span>;
  if (diff > 0) return <span className="inline-flex items-center gap-1 text-emerald-400"><TrendingUp className="h-3 w-3" /> subiu {diff} posições</span>;
  return <span className="inline-flex items-center gap-1 text-red-400"><TrendingDown className="h-3 w-3" /> caiu {Math.abs(diff)} posições</span>;
}

function RankRow({ row, sort, highlight }: { row: any; sort: SortKey; highlight?: boolean }) {
  const value =
    sort === "level" ? `Nível ${row.level}` :
    sort === "wins" ? `${row.wins.toLocaleString("pt-BR")} V` :
    fmtMoney(row.patrimony);
  return (
    <li
      className={`flex items-center gap-3 rounded-md border px-3 py-2 ${
        highlight || row.is_player
          ? "border-primary/50 bg-primary/10"
          : "border-border/40 bg-card/30"
      }`}
    >
      <span className="w-10 shrink-0 text-right text-sm font-mono font-semibold text-muted-foreground">
        {row.current_position}º
      </span>
      <Shield20 primary={row.primary_color} secondary={row.secondary_color} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {row.academy_name}
          {row.is_player && <Badge variant="outline" className="ml-2 border-primary/50 text-primary">Você</Badge>}
        </p>
        <p className="truncate text-xs text-muted-foreground">{row.trainer_name}</p>
      </div>
      <Badge variant="outline" className={`shrink-0 ${DIV_TONE[row.division] ?? ""}`}>
        {DIV_LABEL[row.division] ?? row.division}
      </Badge>
      {sort !== "level" && (
        <Badge variant="secondary" className="shrink-0">Nv. {row.level}</Badge>
      )}
      <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums">{value}</span>
    </li>
  );
}

function Shield20({ primary, secondary }: { primary: string; secondary: string }) {
  return (
    <div
      className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border/40"
      style={{ background: `linear-gradient(135deg, ${primary} 50%, ${secondary} 50%)` }}
    >
      <Shield className="h-3.5 w-3.5 text-white drop-shadow" />
    </div>
  );
}
