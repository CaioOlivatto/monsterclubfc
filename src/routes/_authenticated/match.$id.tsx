import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { getMatchWithSession } from "@/lib/match.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Play, Pause, FastForward, SkipForward, Lock } from "lucide-react";
import { PlayBanner } from "@/components/match/PlayBanner";
import { EventsPanel, type RevealedEvent } from "@/components/match/EventsPanel";
import { NarrationSession, type Outcome, type PlayMeta } from "@/lib/narration/session";
import { TacticsSheet } from "@/components/match/TacticsSheet";
import { GameLogo } from "@/components/GameLogo";
import { TeamCrest } from "@/components/TeamCrest";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";



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
  outcome: Outcome | "red_card";
  meta: PlayMeta;
  teamColor: string;
  raw: any;
}


function MatchPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const fetchMatch = useServerFn(getMatchWithSession);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["match", id],
    queryFn: async () => {
      const { data: current, error } = await supabase.auth.getSession();
      if (error || !current.session?.access_token) throw error ?? new Error("Sessão não encontrada.");
      return fetchMatch({ data: { id, access_token: current.session.access_token } });
    },
  });

  // Invalida caches dependentes de energia/moral/lesão assim que o jogo termina.
  // Sem isso, /roster e /dashboard exibiam o snapshot pré-partida em cache.
  const invalidatedRef = useRef(false);
  useEffect(() => {
    if (invalidatedRef.current) return;
    if (!data || data.match?.status !== "finished") return;
    invalidatedRef.current = true;
    qc.invalidateQueries({ queryKey: ["my-creatures"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["lineup"] });
  }, [data, qc]);


  const [minute, setMinute] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<Speed>(2);
  const [revealed, setRevealed] = useState<RevealedEvent[]>([]);
  const [pending, setPending] = useState<PendingPlay | null>(null);
  const [unlockMode, setUnlockMode] = useState<"4x" | "instant" | null>(null);

  const timerRef = useRef<number | null>(null);
  const narrRef = useRef<NarrationSession>(new NarrationSession());
  const processedRef = useRef<Set<number>>(new Set());
  const cinematicSubsRef = useRef<Map<string, { id: string; outName: string; inName: string }>>(new Map());

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
    cinematicSubsRef.current = new Map();
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
    const stepMs = 500 / speed;
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

    for (const originalEvent of events) {
      const ev = applyCinematicReplacements(originalEvent, cinematicSubsRef.current);
      processedRef.current.add(indexKey(ev));
      const meta = ev.meta as PlayMeta | null | undefined;

      // Só GOL pausa com revelação completa em 3 tempos.
      // CARTÃO VERMELHO recebe pausa breve (só o desfecho).
      if (ev.event_type === "goal") {
        setPending({
          minute: ev.minute,
          outcome: "goal",
          meta: meta ?? {},
          teamColor: teamColor(ev.actor_team_id),
          raw: ev,
        });
        return;
      }
      if (ev.event_type === "red_card") {
        setPending({
          minute: ev.minute,
          outcome: "red_card" as any,
          meta: meta ?? {},
          teamColor: teamColor(ev.actor_team_id),
          raw: ev,
        });
        return;
      }

      // Lances secundários (chance perdida, defesa, corte, amarelo, sub, lesão):
      // aparecem como uma única linha no painel, sem pausar o relógio.
      const isDanger =
        (ev.event_type === "shot_saved" || ev.event_type === "shot_missed" ||
          ev.event_type === "shot_blocked") && !!meta?.is_danger;
      let narration: string | undefined;
      if (isDanger && meta) {
        const outcome = (meta.outcome ??
          (ev.event_type === "shot_saved"
            ? "save"
            : ev.event_type === "shot_missed"
              ? "miss"
              : "block")) as Outcome;
        narration = capFirst(narrRef.current.buildSingleOutcome(outcome, meta));
      }
      if (
        ev.event_type === "injury" &&
        ((meta as any)?.injury_severity === "grave" || Number((meta as any)?.injury_matches ?? 0) >= 4) &&
        ev.actor_team_id === ((data as any)?.player_team_id ?? homeId)
      ) {
        setPlaying(false);
      }
      setRevealed((r) => [
        ...r,
        { ...buildRevealed(ev, homeId), narration: narration ?? ev.description ?? undefined },
      ]);
    }

  }, [minute, data, pending, homeId]);

  function handleBannerFinished() {
    if (!pending) return;
    const p = pending;

    // Cartão vermelho: pausa breve, sem contar gols nem reação.
    if ((p.outcome as any) === "red_card") {
      const line = capFirst(
        p.meta?.attacker
          ? `${p.meta.attacker} está expulso! Vermelho direto!`
          : "Vermelho direto! Que expulsão!",
      );
      setRevealed((r) => [...r, { ...buildRevealed(p.raw, homeId), narration: line }]);
      setPending(null);
      return;
    }

    const parts = narrRef.current.buildPlay(p.outcome as Outcome, p.meta, p.minute);
    const playerTeamId = (data as any)?.player_team_id ?? homeId;
    const isPlayerHome = playerTeamId === homeId;
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
        narration: `${capFirst(parts.p1)} ${capFirst(parts.p2)} ${capFirst(parts.p3)}${
          parts.callbacks.length ? " — " + capFirst(parts.callbacks[0]) : ""
        }`,
      },
    ]);


    const reaction = narrRef.current.maybeReaction(p.minute, {
      homeGoals: newHome,
      awayGoals: newAway,
      isPlayerHome,
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
  const playerTeamIdForLive = (data as any)?.player_team_id ?? homeId;
  const substitutionsUsed = revealed.filter((event) => event.event_type === "substitution" && event.raw_team_id === playerTeamIdForLive).length;
  const severePlayerInjuryActive = !!revealed.find((event) => event.event_type === "injury" && event.raw_team_id === playerTeamIdForLive && (event.injury_severity === "grave" || (event.injury_matches ?? 0) >= 4));

  // Constrói NarrationParts sob demanda para o banner ativo (hook antes de qualquer return)
  const bannerParts = useMemo(() => {
    if (!pending) return null;
    if ((pending.outcome as any) === "red_card") {
      const line = capFirst(
        pending.meta?.attacker
          ? `${pending.meta.attacker} está expulso! Vermelho direto!`
          : "Vermelho direto! Que expulsão!",
      );
      return {
        p1: "",
        p2: "",
        p3: line,
        is_golaco: false,
        fast_beat: false,
        callbacks: [],
      };
    }
    return narrRef.current.buildPlay(pending.outcome as Outcome, pending.meta, pending.minute);
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
  const latestEvent = revealed.length ? revealed[revealed.length - 1] : null;
  const latestNarration = latestEvent
    ? latestEvent.narration ?? latestEvent.description
    : "Os times estão em campo. A bola vai rolar!";
  const latestIsSevereInjury = latestEvent?.event_type === "injury" && (latestEvent.injury_severity === "grave" || (latestEvent.injury_matches ?? 0) >= 4);
  const latestEventIcon = latestEvent?.event_type === "red_card"
    ? "🟥"
    : latestEvent?.event_type === "yellow_card"
      ? "🟨"
      : latestEvent?.event_type === "injury"
        ? (latestIsSevereInjury ? "🚑" : "🏥")
        : "🎙️";
  const latestNarrationColor = latestEvent?.event_type === "red_card"
    ? "text-red-400"
    : latestEvent?.event_type === "yellow_card"
      ? "text-yellow-300"
      : latestEvent?.event_type === "injury"
        ? (latestIsSevereInjury ? "text-red-300" : "text-rose-200")
        : "text-slate-100";

  const registerCinematicSubstitution = (change: { outId: string; outName: string; inId: string; inName: string }) => {
    cinematicSubsRef.current.set(change.outId, { id: change.inId, outName: change.outName, inName: change.inName });
    setRevealed((current) => [...current, {
      minute: displayedMinute,
      event_type: "substitution",
      description: `Substituição: entra ${change.inName}, sai ${change.outName}.`,
      narration: `Mudança confirmada! ${change.inName} entra no lugar de ${change.outName}.`,
      element: null,
      raw_team_id: playerTeamIdForLive,
    }]);
  };

  return (
    <div
      className="dark relative min-h-screen overflow-x-hidden bg-slate-950 bg-cover bg-[position:center_62%] pb-24 text-slate-100 sm:bg-center"
      style={{ backgroundImage: "url('/assets/monster-stadium.webp')" }}
    >
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 bg-gradient-to-b from-slate-950/58 via-slate-950/82 to-slate-950/96" />
      <header className="relative z-10 border-b border-violet-500/35 bg-slate-950/90 shadow-[0_4px_24px_rgba(76,29,149,.28)] backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-3 py-3 sm:px-4">
          <GameLogo size="xs" className="hidden shrink-0 sm:block" />
          <Button className="border-slate-700 bg-slate-900/75 text-slate-100" variant="outline" size="icon" onClick={() => navigate({ to: "/dashboard" })}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[.16em] text-violet-300">Dia de jogo</p>
            <h1 className="text-lg font-bold text-white">Partida ao vivo</h1>
          </div>
          {data.match.is_friendly && (
            <Badge variant="secondary" className="ml-2">
              Amistoso
            </Badge>
          )}
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-5xl space-y-3 p-2.5 text-slate-100 [&_.text-muted-foreground]:text-slate-400 sm:space-y-4 sm:p-4">
        {/* Placar */}
        <Card className="overflow-hidden border-violet-400/45 bg-gradient-to-br from-slate-950 via-indigo-950/95 to-violet-950/85 text-slate-100 shadow-[0_16px_40px_rgba(0,0,0,.38)]">
          <CardContent className="py-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 text-center">
                <TeamCrest teamName={data.home?.name} teamKey={data.home?.starter_key} teamElement={data.home?.dominant_element} size="lg" className="mx-auto" />
                <div className="mt-2 truncate text-sm font-bold text-slate-100">{data.home?.name}</div>
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
                <TeamCrest teamName={data.away?.name} teamKey={data.away?.starter_key} teamElement={data.away?.dominant_element} size="lg" className="mx-auto" />
                <div className="mt-2 truncate text-sm font-bold text-slate-100">{data.away?.name}</div>
                <div className="mt-1 text-4xl font-bold">{awayGoals}</div>
              </div>
            </div>

            <div className="mt-4 h-1.5 rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-400 transition-all"
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
                  if (data.speed?.paid_4x) setSpeed(4);
                  else setUnlockMode("4x");
                }}
              >
                {data.speed?.paid_4x ? (
                  <FastForward className="mr-1 h-3 w-3" />
                ) : (
                  <Lock className="mr-1 h-3 w-3" />
                )}{" "}
                4x
              </Button>
              <Button
                size="sm"
                variant={speed === 0 ? "default" : "outline"}
                onClick={() => {
                  if (data.speed?.paid_instant) {
                    setSpeed(0);
                    setPlaying(true);
                  } else {
                    setUnlockMode("instant");
                  }
                }}
              >
                {data.speed?.paid_instant ? (
                  <SkipForward className="mr-1 h-3 w-3" />
                ) : (
                  <Lock className="mr-1 h-3 w-3" />
                )}{" "}
                Instantâneo
              </Button>
              <TacticsSheet substitutionsUsed={substitutionsUsed} autoOpenSubstitutions={severePlayerInjuryActive} onSubstitute={registerCinematicSubstitution} />
            </div>

            <UnlockSpeedDialog
              mode={unlockMode}
              onOpenChange={(open) => !open && setUnlockMode(null)}
              price4x={data.speed?.price_4x ?? "R$ 14,90"}
              priceInstant={data.speed?.price_instant ?? "R$ 29,90"}
              onUnlocked={(mode) => {
                setUnlockMode(null);
                if (mode === "4x") setSpeed(4);
                else {
                  setSpeed(0);
                  setPlaying(true);
                }
              }}
            />


          </CardContent>
        </Card>

        {pending && bannerParts ? (
          <PlayBanner
            inline
            parts={bannerParts}
            teamColor={pending.teamColor}
            outcome={pending.outcome as any}
            elementalAdvantage={pending.meta.elemental_advantage}
            brief={(pending.outcome as any) === "red_card"}
            onFinished={handleBannerFinished}
          />
        ) : (
          <Card className="border-violet-500/40 bg-slate-950/90 text-slate-100 shadow-[0_12px_30px_rgba(0,0,0,.3)]">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-violet-400/40 bg-violet-500/15 text-xl">{latestEventIcon}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-bold uppercase tracking-[.16em] text-violet-300">Narração ao vivo</p>
                    <span className="text-xs font-bold text-cyan-300">{isFinal ? "Fim" : `${displayedMinute}'`}</span>
                  </div>
                  <p className={`mt-2 text-sm font-semibold leading-relaxed sm:text-base ${latestNarrationColor}`}>
                    {latestNarration}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {!isFinal && <EventsPanel events={revealed} />}

        {isFinal && (() => {
          const playerTeamId = (data as any)?.player_team_id ?? homeId;
          const playerIsHome = playerTeamId === homeId;
          const myGoals = playerIsHome ? homeGoals : awayGoals;
          const theirGoals = playerIsHome ? awayGoals : homeGoals;
          const label = myGoals > theirGoals ? "Vitória! 🏆" : myGoals < theirGoals ? "Derrota." : "Empate.";
          return (
            <Tabs defaultValue="resumo" className="space-y-4">
              <TabsList className="grid w-full grid-cols-2 border border-violet-500/30 bg-slate-950/90 p-1">
                <TabsTrigger value="resumo">Resumo</TabsTrigger>
                <TabsTrigger value="detalhes">Detalhes</TabsTrigger>
              </TabsList>

              <TabsContent value="resumo" className="space-y-4">
                <Card className="border-violet-500/40 bg-slate-950/90 text-slate-100">
                  <CardContent className="py-4 text-center">
                    <p className="text-sm text-muted-foreground">
                      {data.home?.name} {homeGoals} × {awayGoals} {data.away?.name}
                    </p>
                    <p className="mt-1 text-lg font-semibold">{label}</p>
                  </CardContent>
                </Card>

                {(data.match as any).finance_summary && (
                  <FinanceSummaryCard summary={(data.match as any).finance_summary} />
                )}

                <div className="text-center">
                  <Button onClick={() => navigate({ to: "/dashboard" })}>Voltar ao painel</Button>
                </div>
              </TabsContent>

              <TabsContent value="detalhes">
                <EventsPanel events={revealed} />
              </TabsContent>
            </Tabs>
          );
        })()}
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

// Ao concatenar as 3 partes do banco em uma linha só, subimos a inicial
// quando ela vem em minúscula (partes escritas para tarja em 3 tempos).
// Frases que já começam em maiúscula intencional (ex: "TÁ LIVRE!", "GOOOOL!")
// não são alteradas.
function capFirst(s: string): string {
  if (!s) return s;
  const first = s[0];
  const up = first.toLocaleUpperCase("pt-BR");
  if (first === up) return s; // já é maiúscula (ou não é letra)
  return up + s.slice(1);
}

function applyCinematicReplacements(event: any, replacements: Map<string, { id: string; outName: string; inName: string }>) {
  const replace = (value: unknown): unknown => {
    if (typeof value === "string") {
      let text = value;
      for (const replacement of replacements.values()) {
        text = text.split(replacement.outName).join(replacement.inName);
      }
      return text;
    }
    if (Array.isArray(value)) return value.map(replace);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item)]));
    return value;
  };
  const normalized = replace(event) as any;
  let actorId = event.actor_creature_id;
  const visited = new Set<string>();
  while (actorId && replacements.has(actorId) && !visited.has(actorId)) {
    visited.add(actorId);
    actorId = replacements.get(actorId)!.id;
  }
  if (actorId) normalized.actor_creature_id = actorId;
  return normalized;
}


function buildRevealed(e: any, playerTeamId: string | undefined): RevealedEvent & { raw_team_id?: string | null } {
  const meta = e.meta ?? {};
  return {
    minute: e.minute,
    event_type: e.event_type,
    description: e.description,
    element: meta.element ?? null,
    injury_severity: meta.injury_severity ?? null,
    injury_matches: meta.injury_matches ?? null,
    team_color: teamColor(e.actor_team_id),
    is_goal: e.event_type === "goal",
    raw_team_id: e.actor_team_id ?? null,
  } as any;
}

function money(n: number) {
  return "$ " + Math.round(n).toLocaleString("pt-BR");
}

function FinanceSummaryCard({ summary }: { summary: any }) {
  const inc = summary.income ?? {};
  const exp = summary.expense ?? {};
  const totals = summary.totals ?? { income: 0, expense: 0, net: 0 };
  const att = summary.attendance ?? null;
  const isHome = summary.is_home !== false;
  const rows: Array<{ label: string; value: number; kind: "in" | "out" }> = [
    { label: "Premiação da rodada", value: inc.match_prize ?? 0, kind: "in" },
    { label: "Direitos de TV", value: inc.tv ?? 0, kind: "in" },
    { label: "Patrocínio", value: inc.sponsor ?? 0, kind: "in" },
    { label: "Merchandising", value: inc.merch ?? 0, kind: "in" },
  ];
  if ((inc.gate ?? 0) > 0) rows.push({ label: "Bilheteria", value: inc.gate, kind: "in" });
  if ((inc.away_win_bonus ?? 0) > 0) rows.push({ label: "Prêmio de vitória fora", value: inc.away_win_bonus, kind: "in" });
  if ((exp.salaries ?? 0) > 0) rows.push({ label: "Salários", value: exp.salaries, kind: "out" });
  if ((exp.maintenance ?? 0) > 0) rows.push({ label: "Manutenção", value: exp.maintenance, kind: "out" });

  const netColor = totals.net >= 0 ? "text-emerald-400" : "text-red-400";
  return (
    <Card className="border-violet-500/40 bg-slate-950/90 text-slate-100 shadow-[0_12px_30px_rgba(0,0,0,.3)] [&_.text-muted-foreground]:text-slate-400">
      <CardContent className="space-y-3 py-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Finanças da partida</h3>
          <span className={`text-sm font-bold ${netColor}`}>
            {totals.net >= 0 ? "+" : "−"} {money(Math.abs(totals.net))}
          </span>
        </div>
        {/* Público (só em casa) */}
        {isHome && att && att.capacity > 0 ? (
          <div className="flex items-center justify-between rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1.5 text-[11px]">
            <span className="text-muted-foreground">Público</span>
            <span className="font-medium">
              {att.attendance.toLocaleString("pt-BR")} / {att.capacity.toLocaleString("pt-BR")} torcedores
              {" · "}{att.label?.label ?? "—"} {att.label?.icon ?? ""}
            </span>
          </div>
        ) : !isHome ? (
          <div className="flex items-center justify-between rounded-md border border-dashed px-2 py-1.5 text-[11px] text-muted-foreground">
            <span>Público</span>
            <span>Fora de casa — sem público pagante</span>
          </div>
        ) : null}
        <div className="space-y-1">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{r.label}</span>
              <span className={r.kind === "in" ? "text-emerald-300" : "text-red-300"}>
                {r.kind === "in" ? "+" : "−"} {money(r.value)}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t pt-2 text-xs">
          <span className="text-muted-foreground">Receitas / Despesas</span>
          <span>
            <span className="text-emerald-300">{money(totals.income)}</span>
            {"  "}
            <span className="text-red-300">−{money(totals.expense)}</span>
          </span>
        </div>
        <div className="flex items-center justify-between border-t pt-2 text-sm">
          <span className="font-bold uppercase tracking-wide">Total</span>
          <span className={`font-bold ${netColor}`}>
            {totals.net >= 0 ? "+" : "−"} {money(Math.abs(totals.net))}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function UnlockSpeedDialog({
  mode,
  onOpenChange,
  price4x,
  priceInstant,
  onUnlocked,
}: {
  mode: "4x" | "instant" | null;
  onOpenChange: (open: boolean) => void;
  price4x: string;
  priceInstant: string;
  onUnlocked: (mode: "4x" | "instant") => void;
}) {
  void onUnlocked;
  const price = mode === "4x" ? price4x : mode === "instant" ? priceInstant : "";
  const label = mode === "4x" ? "Velocidade 4x" : "Modo Instantâneo";

  return (
    <AlertDialog open={!!mode} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4" /> Desbloquear {label}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Desbloqueio permanente para todas as partidas futuras por{" "}
            <span className="font-semibold text-foreground">{price}</span>.
            Este recurso será vendido somente por pagamento em dinheiro real.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction disabled>Pagamentos em breve</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
