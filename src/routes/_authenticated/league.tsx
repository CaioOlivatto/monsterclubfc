import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Trophy, Play, Calendar, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getLeague, startLeague, playNextLeagueMatch, finishSeasonAndAdvance } from "@/lib/league.functions";

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
  const playNext = useServerFn(playNextLeagueMatch);

  const [division, setDivision] = useState<string | undefined>(undefined);

  const { data, isLoading } = useQuery({
    queryKey: ["league", division ?? "auto"],
    queryFn: () => fetchLeague({ data: division ? { division } : {} } as any),
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

  const playMut = useMutation({
    mutationFn: () => playNext(),
    onSuccess: (res: any) => nav({ to: "/match/$id", params: { id: res.match_id } }),
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível jogar a próxima partida."),
  });

  const finishSeasonFn = useServerFn(finishSeasonAndAdvance);
  const finishMut = useMutation({
    mutationFn: () => finishSeasonFn(),
    onSuccess: (res: any) => {
      const parts = [
        `${res.position}º lugar`,
        res.promoted ? `Promoção → ${res.newDivision}` : res.relegated ? `Rebaixamento → ${res.newDivision}` : `Continua em ${res.newDivision}`,
        `+$${res.prize.toLocaleString()}`,
      ];
      toast.success(`Temporada ${res.newSeasonNumber - 1} encerrada: ${parts.join(" • ")}`);
      qc.invalidateQueries({ queryKey: ["league"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
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
                  Inscreva sua academia numa liga de 8 times. Serão 14 rodadas em turno e returno.
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
            onPlayNext={() => playMut.mutate()}
            isPlaying={playMut.isPending}
            onFinishSeason={() => finishMut.mutate()}
            isFinishing={finishMut.isPending}
          />
        )}

      </main>
    </div>
  );
}

function LeagueBody({
  data,
  onPlayNext,
  isPlaying,
  onFinishSeason,
  isFinishing,
}: {
  data: any;
  onPlayNext: () => void;
  isPlaying: boolean;
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

  const division = data.competition?.division ?? "bronze";
  const leagueDone = !nextRound;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 py-4">
          <div>
            <CardTitle className="text-base capitalize">Divisão {division}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {leagueDone ? "Temporada concluída — encerre para promoção/rebaixamento." : `Rodada ${nextRound} de ${roundNumbers.length}`}
            </p>
          </div>
          {leagueDone ? (
            <Button onClick={onFinishSeason} disabled={isFinishing} variant="default">
              <Trophy className="mr-2 h-4 w-4" />
              {isFinishing ? "Encerrando..." : "Encerrar temporada"}
            </Button>
          ) : (
            <Button onClick={onPlayNext} disabled={isPlaying}>
              <Play className="mr-2 h-4 w-4" />
              {isPlaying ? "Jogando..." : "Jogar próxima"}
            </Button>
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
                  return (
                    <tr key={s.team_id} className={isPlayer ? "bg-primary/5 font-semibold" : ""}>
                      <td className="px-3 py-2">{i + 1}</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <span>{team?.name ?? "—"}</span>
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
      <Link to="/match/$id" params={{ id: m.id }} className="block hover:opacity-90">
        {content}
      </Link>
    );
  }
  return content;
}
