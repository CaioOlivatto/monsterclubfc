import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { getMatch, payMatchSpeed } from "@/lib/match.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Play, Pause, FastForward, SkipForward, Gem } from "lucide-react";


export const Route = createFileRoute("/_authenticated/match/$id")({
  head: () => ({
    meta: [
      { title: "Partida ao Vivo — Monster Club Manager" },
      { name: "description", content: "Assista à sua partida minuto a minuto." },
      { property: "og:title", content: "Partida — Monster Club Manager" },
      { property: "og:description", content: "Assista à sua partida minuto a minuto." },
    ],
  }),
  component: MatchPage,
});

type Speed = 1 | 2 | 4 | 0; // 0 = instantâneo

function MatchPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const fetchMatch = useServerFn(getMatch);
  const payFn = useServerFn(payMatchSpeed);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["match", id],
    queryFn: () => fetchMatch({ data: { id } }),
  });

  const paid4x: boolean = !!(data as any)?.speed?.paid_4x;
  const paidInstant: boolean = !!(data as any)?.speed?.paid_instant;
  const cost4x: number = (data as any)?.speed?.cost_4x ?? 300;
  const costInstant: number = (data as any)?.speed?.cost_instant ?? 800;

  const payMut = useMutation({
    mutationFn: (mode: "4x" | "instant") => payFn({ data: { mode } }),
    onSuccess: (_res, mode) => {
      toast.success(
        mode === "4x"
          ? "Velocidade 4x desbloqueada para sempre!"
          : "Velocidade instantânea desbloqueada para sempre!",
      );
      qc.invalidateQueries({ queryKey: ["match", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha no pagamento"),
  });

  const [minute, setMinute] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<Speed>(1);
  const timerRef = useRef<number | null>(null);


  // Reset se troca de partida
  useEffect(() => {
    setMinute(0);
    setPlaying(true);
  }, [id]);

  // Playback: avança minutos com base na velocidade
  useEffect(() => {
    if (!playing) return;
    if (speed === 0) {
      setMinute(90);
      setPlaying(false);
      return;
    }
    const stepMs = 900 / speed;
    timerRef.current = window.setInterval(() => {
      setMinute((m) => {
        if (m >= 90) {
          setPlaying(false);
          return 90;
        }
        return m + 1;
      });
    }, stepMs);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [playing, speed]);

  const visibleEvents = useMemo(() => {
    return (data?.events ?? []).filter((e: any) => e.minute <= minute);
  }, [data, minute]);

  const homeGoals = visibleEvents.filter(
    (e: any) => e.event_type === "goal" && e.actor_team_id === data?.match.home_team_id,
  ).length;
  const awayGoals = visibleEvents.filter(
    (e: any) => e.event_type === "goal" && e.actor_team_id === data?.match.away_team_id,
  ).length;

  if (isLoading) return <div className="p-6 text-center text-muted-foreground">Carregando…</div>;
  if (error || !data)
    return (
      <div className="p-6 text-center text-destructive">
        {(error as Error)?.message ?? "Erro ao carregar partida."}
      </div>
    );

  const isFinal = minute >= 90;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/dashboard" })}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">Partida ao vivo</h1>
          {data.match.is_friendly && (
            <Badge variant="secondary" className="ml-2">Amistoso</Badge>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-4">
        {/* Placar */}
        <Card>
          <CardContent className="py-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 text-center">
                <div className="truncate text-sm text-muted-foreground">{data.home?.name}</div>
                <div className="mt-1 text-4xl font-bold">{homeGoals}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground">
                  {isFinal ? "FIM" : minute >= 45 && minute < 46 ? "INTERVALO" : `${minute}'`}
                </div>
                <div className="mt-1 text-lg font-semibold text-muted-foreground">x</div>
              </div>
              <div className="flex-1 text-center">
                <div className="truncate text-sm text-muted-foreground">{data.away?.name}</div>
                <div className="mt-1 text-4xl font-bold">{awayGoals}</div>
              </div>
            </div>

            {/* Timeline */}
            <div className="mt-4 h-1.5 rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(minute / 90) * 100}%` }}
              />
            </div>

            {/* Controles */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPlaying((p) => !p)}
                disabled={isFinal}
              >
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <Button
                size="sm"
                variant={speed === 1 ? "default" : "outline"}
                onClick={() => setSpeed(1)}
              >
                1x
              </Button>
              <Button
                size="sm"
                variant={speed === 2 ? "default" : "outline"}
                onClick={() => setSpeed(2)}
              >
                2x
              </Button>
              <Button
                size="sm"
                variant={speed === 4 ? "default" : "outline"}
                onClick={() => {
                  if (paid4x) setSpeed(4);
                  else payMut.mutate("4x", { onSuccess: () => setSpeed(4) });
                }}
                disabled={payMut.isPending}
                title="Desbloqueio permanente"
              >
                <FastForward className="mr-1 h-3 w-3" /> 4x
                {!paid4x && (
                  <span className="ml-1 flex items-center text-[10px] text-primary">
                    <Gem className="h-3 w-3" /> {cost4x}
                  </span>
                )}
              </Button>
              <Button
                size="sm"
                variant={speed === 0 ? "default" : "outline"}
                onClick={() => {
                  const go = () => {
                    setSpeed(0);
                    setPlaying(true);
                  };
                  if (paidInstant) go();
                  else payMut.mutate("instant", { onSuccess: go });
                }}
                disabled={payMut.isPending}
                title="Desbloqueio permanente"
              >
                <SkipForward className="mr-1 h-3 w-3" /> Instantâneo
                {!paidInstant && (
                  <span className="ml-1 flex items-center text-[10px] text-primary">
                    <Gem className="h-3 w-3" /> {costInstant}
                  </span>
                )}
              </Button>

            </div>
          </CardContent>
        </Card>

        {/* Eventos */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Narração</CardTitle>
          </CardHeader>
          <CardContent>
            {visibleEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Partida prestes a começar…</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {[...visibleEvents].reverse().map((e: any, i: number) => (
                  <li key={i} className="flex gap-2">
                    <span className="w-10 shrink-0 text-right font-mono text-xs text-muted-foreground">
                      {e.minute}'
                    </span>
                    <span
                      className={
                        e.event_type === "goal"
                          ? "font-semibold text-primary"
                          : e.event_type === "yellow_card"
                          ? "text-yellow-600 dark:text-yellow-500"
                          : e.event_type === "injury"
                          ? "text-destructive"
                          : ""
                      }
                    >
                      {e.description}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {isFinal && (
          <Card>
            <CardContent className="py-4 text-center">
              <p className="mb-3 text-sm">
                {homeGoals > awayGoals
                  ? "Vitória! 🏆"
                  : homeGoals < awayGoals
                  ? "Derrota."
                  : "Empate."}
              </p>
              <Button onClick={() => navigate({ to: "/dashboard" })}>Voltar ao painel</Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
