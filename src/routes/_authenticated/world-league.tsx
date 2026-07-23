import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Globe2, Lock, Play, Trophy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getWorldLeague, simulateWorldLeagueRound } from "@/lib/world-competitions.functions";

export const Route = createFileRoute("/_authenticated/world-league")({
  head: () => ({
    meta: [
      { title: "Liga Mundial — Monster Club Manager" },
      { name: "description", content: "Liga Mundial: 20 times, 4 grupos de 5 + mata-mata em 8 rodadas." },
    ],
  }),
  component: WorldLeaguePage,
});

const PHASE_NAMES: Record<number, string> = {
  1: "Grupos R1", 2: "Grupos R2", 3: "Grupos R3", 4: "Grupos R4", 5: "Grupos R5",
  6: "Quartas", 7: "Semifinal", 8: "Final",
};
const TOTAL_ROUNDS = 8;

function WorldLeaguePage() {
  const navigate = useNavigate();
  const fetchWL = useServerFn(getWorldLeague);
  const simulateFn = useServerFn(simulateWorldLeagueRound);
  const qc = useQueryClient();
  const [simulating, setSimulating] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["world-league"],
    queryFn: () => fetchWL(),
  });

  const handleSimulate = async () => {
    setSimulating(true);
    try {
      const res = await simulateFn();
      if (res.playerMatchId) {
        toast.success(`${res.phase}: sua partida está pronta — abrindo narração…`);
        navigate({ to: "/match/$id", params: { id: res.playerMatchId } });
        return;
      }
      toast.success(`${res.phase}: ${res.matchesPlayed} jogos simulados`);
      await qc.invalidateQueries({ queryKey: ["world-league"] });
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
          <Globe2 className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold">Liga Mundial</h1>
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
            <GroupsSection data={data} />
            <KnockoutSection data={data} />
          </>
        )}
      </main>
    </div>
  );
}

function NotQualifiedCard({ reason }: { reason?: string }) {
  const messages: Record<string, string> = {
    no_season: "Sem temporada ativa.",
    not_qualified: "Você não está classificado à Liga Mundial nesta temporada. Termine entre os 4 melhores da sua divisão para se classificar à próxima.",
    init_failed: "Não foi possível inicializar a Liga Mundial (pool insuficiente).",
  };
  return (
    <Card className="border-dashed">
      <CardContent className="flex items-center gap-3 py-6">
        <Lock className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{messages[reason ?? ""] ?? "Sem Liga Mundial ativa."}</p>
      </CardContent>
    </Card>
  );
}

function StatusHeader({ data, onSimulate, simulating }: any) {
  const totalRounds = 7;
  const finishedRounds = new Set<number>();
  for (const m of data.matches) if (m.status === "finished") finishedRounds.add(m.round);
  // próxima rodada = menor round com scheduled
  const nextScheduled = data.matches.find((m: any) => m.status === "scheduled");
  const nextRound = nextScheduled?.round ?? null;
  const isFinished = data.competition.status === "finished";
  const champion = isFinished ? data.teams.find((t: any) => t.id === data.competition.champion_team_id) : null;
  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Temporada {data.seasonNumber}</CardTitle>
          <Badge variant="outline">{finishedRounds.size}/{totalRounds} rodadas</Badge>
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

function GroupsSection({ data }: any) {
  const groups: Record<string, any[]> = {};
  for (const s of data.standings) {
    if (!s.group_key) continue;
    (groups[s.group_key] ??= []).push(s);
  }
  const groupKeys = Object.keys(groups).sort();
  if (!groupKeys.length) return null;
  const teamsById = new Map<string, any>(data.teams.map((t: any) => [t.id, t]));
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm">Fase de grupos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {groupKeys.map((g) => {
          const rows = groups[g].slice().sort(
            (a: any, b: any) => (b.points - a.points) || ((b.goals_for - b.goals_against) - (a.goals_for - a.goals_against)),
          );
          return (
            <div key={g}>
              <div className="mb-1 text-xs font-semibold text-muted-foreground">Grupo {g}</div>
              <div className="overflow-hidden rounded-md border text-xs">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-1 text-left">Time</th>
                      <th className="p-1 text-center">P</th>
                      <th className="p-1 text-center">V</th>
                      <th className="p-1 text-center">E</th>
                      <th className="p-1 text-center">D</th>
                      <th className="p-1 text-center">SG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r: any, i: number) => {
                      const t = teamsById.get(r.team_id);
                      const isPlayer = t?.is_player;
                      return (
                        <tr key={r.team_id} className={isPlayer ? "bg-primary/10 font-semibold" : i < 2 ? "bg-emerald-500/5" : ""}>
                          <td className="p-1">{t?.name ?? "?"} <span className="text-muted-foreground uppercase text-[10px]">{t?.division?.slice(0,3)}</span></td>
                          <td className="p-1 text-center">{r.points}</td>
                          <td className="p-1 text-center">{r.wins}</td>
                          <td className="p-1 text-center">{r.draws}</td>
                          <td className="p-1 text-center">{r.losses}</td>
                          <td className="p-1 text-center">{r.goals_for - r.goals_against}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function KnockoutSection({ data }: any) {
  const koMatches = data.matches.filter((m: any) => m.round >= 4);
  if (!koMatches.length) return null;
  const teamsById = new Map<string, any>(data.teams.map((t: any) => [t.id, t]));
  const byRound: Record<number, any[]> = {};
  for (const m of koMatches) (byRound[m.round] ??= []).push(m);
  return (
    <Card>
      <CardHeader className="py-3"><CardTitle className="text-sm">Mata-mata</CardTitle></CardHeader>
      <CardContent className="space-y-3 pt-0">
        {Object.keys(byRound).sort((a, b) => +a - +b).map((r) => (
          <div key={r}>
            <div className="mb-1 text-xs font-semibold text-muted-foreground">{PHASE_NAMES[+r]}</div>
            <div className="space-y-1">
              {byRound[+r].map((m: any) => {
                const h = teamsById.get(m.home_team_id);
                const a = teamsById.get(m.away_team_id);
                const finished = m.status === "finished";
                return (
                  <div key={m.id} className="flex items-center justify-between rounded-md border p-2 text-xs">
                    <span className={h?.is_player ? "font-bold text-primary" : ""}>{h?.name ?? "?"}</span>
                    <span className="mx-2 font-mono">{finished ? `${m.home_score} × ${m.away_score}` : "vs"}</span>
                    <span className={a?.is_player ? "font-bold text-primary" : ""}>{a?.name ?? "?"}</span>
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
