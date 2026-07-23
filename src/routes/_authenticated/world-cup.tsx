import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Lock, Play, Trophy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getWorldCup, simulateWorldCupRound } from "@/lib/world-competitions.functions";

export const Route = createFileRoute("/_authenticated/world-cup")({
  head: () => ({
    meta: [
      { title: "Copa Mundial — Monster Club Manager" },
      { name: "description", content: "Copa Mundial: 10 times em mata-mata direto, 4 rodadas até o título." },
    ],
  }),
  component: WorldCupPage,
});

const PHASE_NAMES: Record<number, string> = { 1: "Pré-oitavas", 2: "Quartas", 3: "Semifinal", 4: "Final" };

function WorldCupPage() {
  const fetchWC = useServerFn(getWorldCup);
  const simulateFn = useServerFn(simulateWorldCupRound);
  const qc = useQueryClient();
  const [simulating, setSimulating] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["world-cup"], queryFn: () => fetchWC() });

  const handleSimulate = async () => {
    setSimulating(true);
    try {
      const res = await simulateFn();
      toast.success(`${res.phase}: ${res.matchesPlayed} jogos simulados`);
      await qc.invalidateQueries({ queryKey: ["world-cup"] });
    } catch (e: any) {
      toast.error(e.message || "Erro ao simular");
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 p-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/dashboard"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <Trophy className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold">Copa Mundial</h1>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 p-4">
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !data?.competition ? (
          <NotQualifiedCard reason={data?.reason} />
        ) : (
          <>
            <StatusHeader data={data} onSimulate={handleSimulate} simulating={simulating} />
            <BracketSection data={data} />
          </>
        )}
      </main>
    </div>
  );
}

function NotQualifiedCard({ reason }: { reason?: string }) {
  const messages: Record<string, string> = {
    no_season: "Sem temporada ativa.",
    not_qualified: "Você não está classificado à Copa Mundial nesta temporada. Vença sua divisão para se classificar à próxima.",
    init_failed: "Não foi possível inicializar a Copa Mundial (pool insuficiente).",
  };
  return (
    <Card className="border-dashed">
      <CardContent className="flex items-center gap-3 py-6">
        <Lock className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{messages[reason ?? ""] ?? "Sem Copa Mundial ativa."}</p>
      </CardContent>
    </Card>
  );
}

function StatusHeader({ data, onSimulate, simulating }: any) {
  const finishedRounds = new Set<number>();
  for (const m of data.matches) if (m.status === "finished") finishedRounds.add(m.round);
  const nextScheduled = data.matches.find((m: any) => m.status === "scheduled");
  const nextRound = nextScheduled?.round ?? null;
  const isFinished = data.competition.status === "finished";
  const champion = isFinished ? data.teams.find((t: any) => t.id === data.competition.champion_team_id) : null;
  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Temporada {data.seasonNumber}</CardTitle>
          <Badge variant="outline">{finishedRounds.size}/4 rodadas</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {isFinished ? (
          <div className="flex items-center gap-2 rounded-md bg-yellow-500/10 p-3 text-sm">
            <Trophy className="h-5 w-5 text-yellow-500" />
            <div>Campeão: <b>{champion?.name ?? "—"}</b></div>
          </div>
        ) : nextRound ? (
          <Button className="w-full" onClick={onSimulate} disabled={simulating}>
            <Play className="mr-2 h-4 w-4" />
            {simulating ? "Simulando…" : `Simular ${PHASE_NAMES[nextRound] ?? `rodada ${nextRound}`}`}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function BracketSection({ data }: any) {
  const teamsById = new Map<string, any>(data.teams.map((t: any) => [t.id, t]));
  const byRound: Record<number, any[]> = {};
  for (const m of data.matches) (byRound[m.round] ??= []).push(m);
  return (
    <Card>
      <CardHeader className="py-3"><CardTitle className="text-sm">Chaveamento</CardTitle></CardHeader>
      <CardContent className="space-y-3 pt-0">
        {Object.keys(byRound).sort((a, b) => +a - +b).map((r) => (
          <div key={r}>
            <div className="mb-1 text-xs font-semibold text-muted-foreground">{PHASE_NAMES[+r] ?? `R${r}`}</div>
            <div className="space-y-1">
              {byRound[+r].map((m: any) => {
                const h = teamsById.get(m.home_team_id);
                const a = teamsById.get(m.away_team_id);
                const finished = m.status === "finished";
                return (
                  <div key={m.id} className="flex items-center justify-between rounded-md border p-2 text-xs">
                    <span className={h?.is_player ? "font-bold text-primary" : ""}>{h?.name ?? "?"} <span className="text-muted-foreground uppercase text-[10px]">{h?.division?.slice(0,3)}</span></span>
                    <span className="mx-2 font-mono">{finished ? `${m.home_score} × ${m.away_score}` : "vs"}</span>
                    <span className={a?.is_player ? "font-bold text-primary" : ""}>{a?.name ?? "?"} <span className="text-muted-foreground uppercase text-[10px]">{a?.division?.slice(0,3)}</span></span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
