import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Trophy, Play, Calendar, ArrowUp, ArrowDown, Crown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { getLeague, startLeague, finishSeasonAndAdvance } from "@/lib/league.functions";
import { recomputeWorldRanking } from "@/lib/ranking.functions";

const DIV_LABEL: Record<string, string> = {
  lendaria: "1ª — Lendária",
  diamante: "2ª — Diamante",
  ouro: "3ª — Ouro",
  prata: "4ª — Prata",
  bronze: "5ª — Bronze",
};
const DIVS = ["lendaria", "diamante", "ouro", "prata", "bronze"] as const;


export const Route = createFileRoute("/_authenticated/league")({
  head: () => ({
    meta: [
      { title: "Liga — Monster Club Manager" },
      { name: "description", content: "Classificação, calendário e resultados da liga da sua academia." },
    ],
  }),
  component: LeaguePage,
});

function LeaguePage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const fetchLeague = useServerFn(getLeague);
  const start = useServerFn(startLeague);

  const [division, setDivision] = useState<string | undefined>(undefined);

  const { data, isLoading } = useQuery({
    queryKey: ["league", division ?? "auto"],
    queryFn: () => fetchLeague({ data: division ? { division } : {} } as any),
    staleTime: 30_000,
  });


  const startMut = useMutation({
    mutationFn: () => start(),
    onSuccess: () => {
      toast.success("Liga criada! Boa sorte.");
      qc.invalidateQueries({ queryKey: ["league"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível iniciar a liga."),
  });

  const finishSeasonFn = useServerFn(finishSeasonAndAdvance);
  const recomputeRankingFn = useServerFn(recomputeWorldRanking);
  const [summary, setSummary] = useState<any | null>(null);
  const finishMut = useMutation({
    mutationFn: () => finishSeasonFn(),
    onSuccess: async (res: any) => {
      setSummary(res);
      try { await recomputeRankingFn(); } catch { /* ignora */ }
      qc.invalidateQueries({ queryKey: ["league"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["world-ranking"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível encerrar a temporada."),
  });


  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const comp = data?.competition;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-2 p-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/dashboard"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <h1 className="text-lg font-bold">Liga</h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 p-4">
        {!comp && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
              <Trophy className="h-10 w-10 text-primary" />
              <div>
                <p className="text-lg font-bold">Nenhuma liga em andamento</p>
                <p className="text-sm text-muted-foreground">
                  Inscreva sua academia numa liga de 14 times. Serão 26 rodadas em turno e returno.
                </p>
              </div>
              <Button onClick={() => startMut.mutate()} disabled={startMut.isPending}>
                {startMut.isPending ? "Criando..." : "Inscrever na liga"}
              </Button>
            </CardContent>
          </Card>
        )}

        {comp && data && (
          <LeagueBody
            data={data}
            division={division ?? (data as any).selectedDivision ?? "bronze"}
            setDivision={setDivision}
            onPlayNext={() => nav({ to: "/lineup", search: { competition: "league" } })}
            onFinishSeason={() => finishMut.mutate()}
            isFinishing={finishMut.isPending}
          />
        )}

      </main>

      <SeasonSummaryDialog summary={summary} onClose={() => setSummary(null)} />
    </div>
  );
}

function SeasonSummaryDialog({ summary, onClose }: { summary: any | null; onClose: () => void }) {
  if (!summary) return null;
  const {
    position, prize, salaries, championGems, playerIsChampion,
    previousDivision, newDivision, promoted, relegated,
    newSeasonNumber, worldSummary,
  } = summary;
  const headline = playerIsChampion
    ? "🏆 Campeão!"
    : promoted
      ? "🎉 Promovido!"
      : relegated
        ? "⚠️ Rebaixado"
        : "Temporada encerrada";
  return (
    <Dialog open={!!summary} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Resumo da Temporada {newSeasonNumber - 1}
          </DialogTitle>
        </DialogHeader>

        <div className={`rounded-lg p-4 ${playerIsChampion ? "bg-yellow-500/10 border border-yellow-500/40" : promoted ? "bg-emerald-500/10 border border-emerald-500/40" : relegated ? "bg-red-500/10 border border-red-500/40" : "bg-muted"}`}>
          <p className="text-lg font-bold">{headline}</p>
          <p className="text-sm text-muted-foreground">
            {position}º lugar em {DIV_LABEL[previousDivision] ?? previousDivision}
            {promoted || relegated ? ` → ${DIV_LABEL[newDivision] ?? newDivision}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary">Prêmio: ${prize.toLocaleString("pt-BR")}</Badge>
            <Badge variant="secondary">Salários: ${salaries.toLocaleString("pt-BR")}</Badge>
            {championGems > 0 && <Badge variant="secondary">+{championGems}💎</Badge>}
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold">Movimentação do mundo</p>
          {worldSummary?.map((d: any) => (
            <div key={d.division} className="rounded-md border p-2 text-xs">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold">{DIV_LABEL[d.division] ?? d.division}</span>
                {d.champion && (
                  <span className="flex items-center gap-1 text-yellow-500">
                    <Crown className="h-3 w-3" /> {d.champion.name}
                  </span>
                )}
              </div>
              {d.promoted?.length > 0 && (
                <div className="text-emerald-600 dark:text-emerald-400">
                  <ArrowUp className="mr-1 inline h-3 w-3" />
                  Sobem: {d.promoted.map((t: any) => t.name).join(", ")}
                </div>
              )}
              {d.relegated?.length > 0 && (
                <div className="text-red-600 dark:text-red-400">
                  <ArrowDown className="mr-1 inline h-3 w-3" />
                  Descem: {d.relegated.map((t: any) => t.name).join(", ")}
                </div>
              )}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button onClick={onClose} className="w-full">Começar nova temporada</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeagueBody({
  data,
  division,
  setDivision,
  onPlayNext,
  onFinishSeason,
  isFinishing,
}: {
  data: any;
  division: string;
  setDivision: (v: string) => void;
  onPlayNext: () => void;
  onFinishSeason: () => void;
  isFinishing: boolean;
}) {

  const teamsById = new Map<string, any>((data.teams ?? []).map((t: any) => [t.id, t]));
  const standings = [...(data.standings ?? [])].sort((a: any, b: any) => {
    if (b.points !== a.points) return b.points - a.points;
    const gdA = a.goals_for - a.goals_against;
    const gdB = b.goals_for - b.goals_against;
    if (gdB !== gdA) return gdB - gdA;
    return b.goals_for - a.goals_for;
  });

  const playerTeam = (data.teams ?? []).find((t: any) => t.is_player);
  const rounds = new Map<number, any[]>();
  for (const m of data.matches ?? []) {
    if (!rounds.has(m.round)) rounds.set(m.round, []);
    rounds.get(m.round)!.push(m);
  }
  const roundNumbers = [...rounds.keys()].sort((a, b) => a - b);
  const nextRound = roundNumbers.find((r) => rounds.get(r)!.some((m) => m.status === "scheduled"));

  const playerDivision = (data as any).playerDivision ?? "bronze";
  const isPlayerDivision = division === playerDivision;
  const leagueDone = !nextRound;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <Select value={division} onValueChange={setDivision}>
                <SelectTrigger className="h-8 w-[190px]">
                  <SelectValue placeholder="Divisão" />
                </SelectTrigger>
                <SelectContent>
                  {DIVS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {DIV_LABEL[d]}
                      {d === playerDivision ? " · sua" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isPlayerDivision && <Badge variant="secondary" className="text-[10px]">Sua divisão</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              {leagueDone
                ? isPlayerDivision
                  ? "Temporada concluída — encerre para promoção/rebaixamento."
                  : "Temporada concluída nesta divisão."
                : `Rodada ${nextRound} de ${roundNumbers.length}`}
            </p>
          </div>
          {isPlayerDivision && (
            leagueDone ? (
              <Button onClick={onFinishSeason} disabled={isFinishing} variant="default">
                <Trophy className="mr-2 h-4 w-4" />
                {isFinishing ? "Encerrando..." : "Encerrar temporada"}
              </Button>
            ) : (
              <Button onClick={onPlayNext}>
                <Play className="mr-2 h-4 w-4" />
                Jogar próxima
              </Button>
            )
          )}
        </CardHeader>
        {nextRound && (
          <CardContent className="space-y-2 pb-4">
            {rounds
              .get(nextRound)!
              .map((m) => (
                <MatchRow key={m.id} m={m} teamsById={teamsById} playerTeamId={playerTeam?.id} />
              ))}
          </CardContent>
        )}
      </Card>


      <Card>
        <CardHeader className="py-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-4 w-4" /> Classificação
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-2 py-2 text-left">Time</th>
                  <th className="px-2 py-2 text-right">P</th>
                  <th className="px-2 py-2 text-right">V</th>
                  <th className="px-2 py-2 text-right">E</th>
                  <th className="px-2 py-2 text-right">D</th>
                  <th className="px-2 py-2 text-right">GP</th>
                  <th className="px-2 py-2 text-right">GC</th>
                  <th className="px-2 py-2 text-right">SG</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s: any, i: number) => {
                  const team = teamsById.get(s.team_id);
                  const isPlayer = team?.is_player;
                  const pos = i + 1;
                  const total = standings.length;
                  const isPromo = pos <= 3 && division !== "lendaria";
                  const isReleg = pos >= total - 2 && division !== "bronze";
                  const rowCls = [
                    isPlayer ? "bg-primary/10 font-semibold" : "",
                    !isPlayer && isPromo ? "bg-emerald-500/5" : "",
                    !isPlayer && isReleg ? "bg-red-500/5" : "",
                  ].join(" ");
                  return (
                    <tr key={s.team_id} className={rowCls}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <span>{pos}</span>
                          {isPromo && <ArrowUp className="h-3 w-3 text-emerald-500" />}
                          {isReleg && <ArrowDown className="h-3 w-3 text-red-500" />}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{team?.name ?? "—"}</span>
                          {isPlayer && <Badge variant="secondary" className="text-[10px]">Você</Badge>}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right">{s.points}</td>
                      <td className="px-2 py-2 text-right">{s.wins}</td>
                      <td className="px-2 py-2 text-right">{s.draws}</td>
                      <td className="px-2 py-2 text-right">{s.losses}</td>
                      <td className="px-2 py-2 text-right">{s.goals_for}</td>
                      <td className="px-2 py-2 text-right">{s.goals_against}</td>
                      <td className="px-2 py-2 text-right">{s.goals_for - s.goals_against}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4" /> Calendário
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pb-4">
          {roundNumbers.map((r) => (
            <div key={r} className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Rodada {r}
              </p>
              {rounds.get(r)!.map((m) => (
                <MatchRow key={m.id} m={m} teamsById={teamsById} playerTeamId={playerTeam?.id} />
              ))}
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

function MatchRow({
  m,
  teamsById,
  playerTeamId,
}: {
  m: any;
  teamsById: Map<string, any>;
  playerTeamId?: string;
}) {
  const home = teamsById.get(m.home_team_id);
  const away = teamsById.get(m.away_team_id);
  const involvesPlayer = playerTeamId && (m.home_team_id === playerTeamId || m.away_team_id === playerTeamId);
  const finished = m.status === "finished";
  const content = (
    <div
      className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm ${
        involvesPlayer ? "border-primary/40 bg-primary/5" : "bg-card/60"
      }`}
    >
      <span className={`flex-1 truncate text-right ${home?.is_player ? "font-semibold" : ""}`}>
        {home?.name ?? "—"}
      </span>
      <span className="min-w-16 text-center font-mono">
        {finished ? `${m.home_score} × ${m.away_score}` : "vs"}
      </span>
      <span className={`flex-1 truncate ${away?.is_player ? "font-semibold" : ""}`}>
        {away?.name ?? "—"}
      </span>
    </div>
  );
  if (finished && involvesPlayer) {
    return (
      <Link to="/match/$id" params={{ id: m.id }} preload="intent" className="block hover:opacity-90">
        {content}
      </Link>
    );
  }
  return content;
}
