import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { getMatch } from "@/lib/match.functions";
import { unlockSpeed } from "@/lib/shop.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Play, Pause, FastForward, SkipForward, Lock, Gem } from "lucide-react";
import { PlayBanner } from "@/components/match/PlayBanner";
import { EventsPanel, type RevealedEvent } from "@/components/match/EventsPanel";
import { NarrationSession, type Outcome, type PlayMeta } from "@/lib/narration/session";
import { TacticsSheet } from "@/components/match/TacticsSheet";
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
  const fetchMatch = useServerFn(getMatch);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["match", id],
    queryFn: () => fetchMatch({ data: { id } }),
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

    for (const ev of events) {
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

  return (
    <div className="min-h-screen bg-background pb-6">
      {pending && bannerParts && (
        <PlayBanner
          parts={bannerParts}
          teamColor={pending.teamColor}
          outcome={pending.outcome as any}
          elementalAdvantage={pending.meta.elemental_advantage}
          brief={(pending.outcome as any) === "red_card"}
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
              <TacticsSheet />
            </div>

            <UnlockSpeedDialog
              mode={unlockMode}
              onOpenChange={(open) => !open && setUnlockMode(null)}
              gems={data.speed?.gems ?? 0}
              cost4x={data.speed?.cost_4x ?? 300}
              costInstant={data.speed?.cost_instant ?? 800}
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

        <EventsPanel events={revealed} />

        {isFinal && (data.match as any).finance_summary && (
          <FinanceSummaryCard summary={(data.match as any).finance_summary} />
        )}

        {isFinal && (() => {
          const playerTeamId = (data as any)?.player_team_id ?? homeId;
          const playerIsHome = playerTeamId === homeId;
          const myGoals = playerIsHome ? homeGoals : awayGoals;
          const theirGoals = playerIsHome ? awayGoals : homeGoals;
          const label = myGoals > theirGoals ? "Vitória! 🏆" : myGoals < theirGoals ? "Derrota." : "Empate.";
          return (
            <Card>
              <CardContent className="py-4 text-center">
                <p className="mb-3 text-sm">{label}</p>
                <Button onClick={() => navigate({ to: "/dashboard" })}>Voltar ao painel</Button>
              </CardContent>
            </Card>
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
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Finanças da partida</h3>
          <span className={`text-sm font-bold ${netColor}`}>
            {totals.net >= 0 ? "+" : "−"} {money(Math.abs(totals.net))}
          </span>
        </div>
        {/* Público (só em casa) */}
        {isHome && att && att.capacity > 0 ? (
          <div className="flex items-center justify-between rounded-md border bg-muted/30 px-2 py-1.5 text-[11px]">
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
  gems,
  cost4x,
  costInstant,
  onUnlocked,
}: {
  mode: "4x" | "instant" | null;
  onOpenChange: (open: boolean) => void;
  gems: number;
  cost4x: number;
  costInstant: number;
  onUnlocked: (mode: "4x" | "instant") => void;
}) {
  const qc = useQueryClient();
  const unlock = useServerFn(unlockSpeed);
  const mutation = useMutation({
    mutationFn: (m: "4x" | "instant") => unlock({ data: { mode: m } }),
    onSuccess: async (_res, m) => {
      toast.success(`Velocidade ${m === "4x" ? "4x" : "Instantânea"} desbloqueada!`);
      await qc.invalidateQueries({ queryKey: ["match"] });
      await qc.invalidateQueries({ queryKey: ["shop"] });
      onUnlocked(m);
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao desbloquear."),
  });

  const cost = mode === "4x" ? cost4x : mode === "instant" ? costInstant : 0;
  const insufficient = gems < cost;
  const label = mode === "4x" ? "Velocidade 4x" : "Modo Instantâneo";

  return (
    <AlertDialog open={!!mode} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4" /> Desbloquear {label}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Desbloqueio permanente para todas as partidas futuras. Custa{" "}
            <span className="inline-flex items-center gap-1 font-semibold text-foreground">
              <Gem className="h-3 w-3" /> {cost}
            </span>
            . Você tem{" "}
            <span className="inline-flex items-center gap-1 font-semibold text-foreground">
              <Gem className="h-3 w-3" /> {gems}
            </span>
            .
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!mode || insufficient || mutation.isPending}
            onClick={(e) => {
              e.preventDefault();
              if (mode) mutation.mutate(mode);
            }}
          >
            {insufficient ? "Gemas insuficientes" : mutation.isPending ? "Desbloqueando…" : `Comprar por ${cost} 💎`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
