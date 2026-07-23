import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Trophy, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getCup, startCup } from "@/lib/cup.functions";

export const Route = createFileRoute("/_authenticated/cup")({
  head: () => ({
    meta: [
      { title: "Copa — Monster Club Manager" },
      { name: "description", content: "Torneio eliminatório com 8 times e chaveamento em quartas, semi e final." },
    ],
  }),
  component: CupPage,
});

const ROUND_NAMES: Record<number, string> = { 1: "Quartas de Final", 2: "Semifinal", 3: "Final" };

function CupPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const fetchCup = useServerFn(getCup);
  const start = useServerFn(startCup);

  const { data, isLoading } = useQuery({ queryKey: ["cup"], queryFn: () => fetchCup() });

  const startMut = useMutation({
    mutationFn: () => start(),
    onSuccess: () => {
      toast.success("Copa criada! Boa sorte.");
      qc.invalidateQueries({ queryKey: ["cup"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao iniciar a copa."),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-4">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  const cup = data?.cup;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-2 p-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/dashboard"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <h1 className="text-lg font-bold">Copa</h1>
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-4 p-4">
        {!cup && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
              <Trophy className="h-10 w-10 text-primary" />
              <p className="text-lg font-bold">Nenhuma copa em andamento</p>
              <p className="text-sm text-muted-foreground">
                Torneio eliminatório de 8 times: quartas → semi → final. Adversários mais fortes que na liga.
              </p>
              <Button onClick={() => startMut.mutate()} disabled={startMut.isPending}>
                {startMut.isPending ? "Sorteando..." : "Inscrever na copa"}
              </Button>
            </CardContent>
          </Card>
        )}
        {cup && data && <CupBody data={data} onPlay={() => nav({ to: "/lineup", search: { competition: "cup" } })} />}
      </main>
    </div>
  );
}

function CupBody({ data, onPlay }: any) {
  const teamsById = new Map<string, any>((data.teams ?? []).map((t: any) => [t.id, t]));
  const playerTeam = (data.teams ?? []).find((t: any) => t.is_player);
  const byRound = new Map<number, any[]>();
  for (const m of data.matches ?? []) {
    if (!byRound.has(m.round)) byRound.set(m.round, []);
    byRound.get(m.round)!.push(m);
  }
  const rounds = [...byRound.keys()].sort((a, b) => a - b);
  const nextPlayerMatch = (data.matches ?? []).find(
    (m: any) => m.status === "scheduled" && (m.home_team_id === playerTeam?.id || m.away_team_id === playerTeam?.id),
  );

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 py-4">
          <div>
            <CardTitle className="text-base">Próxima partida na copa</CardTitle>
            <p className="text-xs text-muted-foreground">
              {nextPlayerMatch ? ROUND_NAMES[nextPlayerMatch.round] : "Você não tem mais partidas"}
            </p>
          </div>
          <Button onClick={onPlay} disabled={!nextPlayerMatch}>
            <Play className="mr-2 h-4 w-4" />
            Jogar
          </Button>
        </CardHeader>
      </Card>

      {rounds.map((r) => (
        <Card key={r}>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">{ROUND_NAMES[r] ?? `Rodada ${r}`}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-4">
            {byRound.get(r)!.map((m) => {
              const h = teamsById.get(m.home_team_id);
              const a = teamsById.get(m.away_team_id);
              const isPlayerMatch = h?.is_player || a?.is_player;
              return (
                <Link
                  key={m.id}
                  to={m.status === "finished" ? "/match/$id" : "/cup"}
                  params={m.status === "finished" ? { id: m.id } : undefined as any}
                  className={`flex items-center justify-between rounded border p-2 text-sm ${
                    isPlayerMatch ? "border-primary/40 bg-primary/5" : ""
                  }`}
                >
                  <span className={h?.is_player ? "font-semibold" : ""}>{h?.name ?? "—"}</span>
                  <span className="text-muted-foreground">
                    {m.status === "finished" ? `${m.home_score} × ${m.away_score}` : "vs"}
                  </span>
                  <span className={a?.is_player ? "font-semibold" : ""}>{a?.name ?? "—"}</span>
                  {isPlayerMatch && <Badge variant="secondary" className="ml-2 text-[10px]">Você</Badge>}
                </Link>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </>
  );
}
