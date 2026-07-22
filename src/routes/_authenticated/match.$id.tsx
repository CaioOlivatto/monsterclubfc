import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { getMatch, payMatchSpeed } from "@/lib/match.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Play, Pause, FastForward, SkipForward, Gem } from "lucide-react";
import { PlayBanner } from "@/components/match/PlayBanner";
import { EventsPanel, type RevealedEvent } from "@/components/match/EventsPanel";
import { NarrationSession, type Outcome, type PlayMeta } from "@/lib/narration/session";

export const Route = createFileRoute("/_authenticated/match/$id")({
  head: () => ({
    meta: [
      { title: "Partida ao Vivo — Monster Club Manager" },
      { name: "description", content: "Assista à sua partida minuto a minuto com narração cômica." },
      { property: "og:title", content: "Partida — Monster Club Manager" },
      { property: "og:description", content: "Assista à sua partida minuto a minuto com narração cômica." },
    ],
  }),
  component: MatchPage,
});

type Speed = 1 | 2 | 4 | 0;

// hash simples id -> hue
function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}
function teamColor(id: string | undefined | null): string {
  if (!id) return "hsl(var(--primary))";
  return `hsl(${hueFromId(id)} 75% 55%)`;
}

interface PendingPlay {
  minute: number;
  outcome: Outcome;
  meta: PlayMeta;
  teamColor: string;
  raw: any;
}

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

  const paid4x = !!(data as any)?.speed?.paid_4x;
  const paidInstant = !!(data as any)?.speed?.paid_instant;
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
  const [revealed, setRevealed] = useState<RevealedEvent[]>([]);
  const [pending, setPending] = useState<PendingPlay | null>(null);
  const timerRef = useRef<number | null>(null);
  const narrRef = useRef<NarrationSession>(new NarrationSession());
  const processedRef = useRef<Set<number>>(new Set());

  const homeId = data?.match?.home_team_id;
  const awayId = data?.match?.away_team_id;

  // reset ao trocar de partida
  useEffect(() => {
    setMinute(0);
    setPlaying(true);
    setRevealed([]);
    setPending(null);
    narrRef.current = new NarrationSession();
    processedRef.current = new Set();
  }, [id]);

  // Playback: pausa quando há banner pendente ou terminou
  useEffect(() => {
    if (!playing || pending) return;
    if (!data) return;
    if (speed === 0) {
      // instantâneo: mostrar tudo direto sem tarja
      const all = (data.events ?? []).map((e: any) => buildRevealed(e, homeId));
      setRevealed(all);
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
  }, [playing, speed, pending, data, homeId]);

  // A cada minuto, processa eventos daquele minuto
  useEffect(() => {
    if (!data || pending) return;
    const events = (data.events ?? []).filter(
      (e: any) => e.minute === minute && !processedRef.current.has(indexKey(e)),
    );
    if (!events.length) return;

    for (const ev of events) {
      processedRef.current.add(indexKey(ev));
      const meta = ev.meta as PlayMeta | null | undefined;
      const isDanger =
        (ev.event_type === "goal" || ev.event_type === "shot_saved") && !!meta?.is_danger;

      if (isDanger) {
        const outcome = (meta?.outcome ?? (ev.event_type === "goal" ? "goal" : "save")) as Outcome;
        setPending({
          minute: ev.minute,
          outcome,
          meta: meta ?? {},
          teamColor: teamColor(ev.actor_team_id),
          raw: ev,
        });
        return; // pausa aqui — o restante do minuto processa após o banner
      }
      // Eventos secundários vão direto para o painel
      setRevealed((r) => [...r, buildRevealed(ev, homeId)]);
    }
  }, [minute, data, pending, homeId]);

  function handleBannerFinished() {
    if (!pending) return;
    const p = pending;
    const parts = narrRef.current.buildPlay(p.outcome, p.meta, p.minute);
    const isPlayerHome = data?.home?.id === homeId; // sempre true; home = jogador
    const currentHome = revealed.filter(
      (e) => e.event_type === "goal" && e.raw_team_id === homeId,
    ).length;
    const currentAway = revealed.filter(
      (e) => e.event_type === "goal" && e.raw_team_id === awayId,
    ).length;
    const newHome = currentHome + (p.outcome === "goal" && p.raw.actor_team_id === homeId ? 1 : 0);
    const newAway = currentAway + (p.outcome === "goal" && p.raw.actor_team_id === awayId ? 1 : 0);

    setRevealed((r) => [
      ...r,
      {
        ...buildRevealed(p.raw, homeId),
        narration: `${parts.p1} ${parts.p2} ${parts.p3}${
          parts.callbacks.length ? " — " + parts.callbacks[0] : ""
        }`,
      },
    ]);

    const reaction = narrRef.current.maybeReaction(p.minute, {
      homeGoals: newHome,
      awayGoals: newAway,
      isPlayerHome: true,
    });
    if (reaction) {
      setRevealed((r) => [
        ...r,
        {
          minute: p.minute,
          event_type: "reaction",
          description: reaction,
          narration: reaction,
          element: null,
        },
      ]);
    }
    setPending(null);
  }

  const homeGoals = revealed.filter(
    (e) => e.event_type === "goal" && e.raw_team_id === homeId,
  ).length;
  const awayGoals = revealed.filter(
    (e) => e.event_type === "goal" && e.raw_team_id === awayId,
  ).length;

  // Constrói NarrationParts sob demanda para o banner ativo (hook antes de qualquer return)
  const bannerParts = useMemo(() => {
    if (!pending) return null;
    return narrRef.current.buildPlay(pending.outcome, pending.meta, pending.minute);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.minute, pending?.raw?.actor_creature_id]);

  if (isLoading) return <div className="p-6 text-center text-muted-foreground">Carregando…</div>;
  if (error || !data)
    return (
      <div className="p-6 text-center text-destructive">
        {(error as Error)?.message ?? "Erro ao carregar partida."}
      </div>
    );

  const isFinal = minute >= 90 && !pending;
  const displayedMinute = pending ? pending.minute : minute;

  return (
    <div className="min-h-screen bg-background pb-6">
      {pending && bannerParts && (
        <PlayBanner
          parts={bannerParts}
          teamColor={pending.teamColor}
          outcome={pending.outcome}
          elementalAdvantage={pending.meta.elemental_advantage}
          onFinished={handleBannerFinished}
        />
      )}

      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/dashboard" })}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">Partida ao vivo</h1>
          {data.match.is_friendly && (
            <Badge variant="secondary" className="ml-2">
              Amistoso
            </Badge>
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
                  {isFinal
                    ? "FIM"
                    : displayedMinute >= 45 && displayedMinute < 46
                      ? "INTERVALO"
                      : `${displayedMinute}'`}
                </div>
                <div className="mt-1 text-lg font-semibold text-muted-foreground">x</div>
              </div>
              <div className="flex-1 text-center">
                <div className="truncate text-sm text-muted-foreground">{data.away?.name}</div>
                <div className="mt-1 text-4xl font-bold">{awayGoals}</div>
              </div>
            </div>

            <div className="mt-4 h-1.5 rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(displayedMinute / 90) * 100}%` }}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPlaying((p) => !p)}
                disabled={isFinal || !!pending}
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

        <EventsPanel events={revealed} />

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

function indexKey(e: any): number {
  // Chave estável dentro da lista de eventos (minute + descrição + tipo)
  let h = e.minute * 1000;
  const s = `${e.event_type}|${e.description}|${e.actor_creature_id ?? ""}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function buildRevealed(e: any, playerTeamId: string | undefined): RevealedEvent & { raw_team_id?: string | null } {
  const meta = e.meta ?? {};
  return {
    minute: e.minute,
    event_type: e.event_type,
    description: e.description,
    element: meta.element ?? null,
    team_color: teamColor(e.actor_team_id),
    is_goal: e.event_type === "goal",
    raw_team_id: e.actor_team_id ?? null,
  } as any;
}
