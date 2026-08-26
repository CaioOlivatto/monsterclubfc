import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { getRosterPageWithSession } from "@/lib/creatures.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  getMoraleSessionsState,
  startMoraleMeeting,
  rushMoraleMeeting,
  cancelMoraleMeeting,
  startMoraleGeneral,
  MORALE_MEETING_COLLECTIVE_MS,
  MORALE_MEETING_COLLECTIVE_BOOST,
  MORALE_GENERAL_BOOST,
} from "@/lib/morale-training.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, BatteryCharging, Clock, Hourglass, HeartPulse, Gem, Users, ChevronDown, ChevronUp, Coins, SlidersHorizontal } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { ageStatus, seasonsRemaining, type AgeStatus } from "@/lib/age";
import { fatigueState, FATIGUE_LABEL, FATIGUE_CLASS, effectiveOverall, energyMultiplier } from "@/lib/fatigue";
import { moraleState, MORALE_EMOJI, MORALE_LABEL, MORALE_CLASS, moraleMultiplier, moraleReason } from "@/lib/morale";
import { StarRating, halfStarsToStars } from "@/components/StarRating";
import { RetirementDialog } from "@/components/RetirementDialog";
import { RushTimer } from "@/components/RushTimer";
import { GameLogo } from "@/components/GameLogo";
import { TeamCrest } from "@/components/TeamCrest";

export const Route = createFileRoute("/_authenticated/roster")({
  head: () => ({
    meta: [
      { title: "Elenco — Monster Club Manager" },
      { name: "description", content: "Todas as criaturas da sua academia." },
      { property: "og:title", content: "Elenco — Monster Club Manager" },
      { property: "og:description", content: "Todas as criaturas da sua academia." },
    ],
  }),
  component: RosterPage,
});

const ELEMENT_COLORS: Record<string, string> = {
  fogo: "bg-red-500/15 text-red-300 border-red-500/30",
  agua: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  terra: "bg-amber-700/20 text-amber-300 border-amber-700/40",
  ar: "bg-sky-400/15 text-sky-200 border-sky-400/30",
  gelo: "bg-cyan-300/15 text-cyan-200 border-cyan-300/30",
};

const ELEMENT_LABEL: Record<string, string> = {
  fogo: "Fogo",
  agua: "Água",
  terra: "Terra",
  ar: "Ar",
  gelo: "Gelo",
};

const ELEMENTS = ["fogo", "agua", "terra", "ar", "gelo"] as const;
const POSITIONS = ["Goleiro", "Zagueiro", "Meio-campo", "Atacante"] as const;

type SortKey = "position" | "overall" | "name" | "energy" | "market_value" | "age";

const POSITION_ORDER: Record<string, number> = {
  Goleiro: 0,
  Zagueiro: 1,
  "Meio-campo": 2,
  Atacante: 3,
};
const POSITION_LABEL: Record<string, string> = {
  Goleiro: "GOLEIROS",
  Zagueiro: "ZAGUEIROS",
  "Meio-campo": "MEIO-CAMPO",
  Atacante: "ATACANTES",
};
const POSITION_KEYS = ["Goleiro", "Zagueiro", "Meio-campo", "Atacante"] as const;
type AgeFilter = "all" | "veteran" | "last_season";

function xpForHalfStarsLocal(count: number) {
  let total = 0;
  for (let i = 0; i < Math.min(10, Math.max(0, count)); i += 1) {
    total += Math.round(800 * Math.pow(1.25, i));
  }
  return total;
}

function RosterPage() {
  const qc = useQueryClient();
  const fetchRosterPage = useServerFn(getRosterPageWithSession);
  const fetchMorale = useServerFn(getMoraleSessionsState);
  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ["roster-page"],
    queryFn: async () => {
      const { data: current, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !current.session?.access_token) {
        throw sessionError ?? new Error("Sessão não encontrada.");
      }
      return fetchRosterPage({ data: { access_token: current.session.access_token } });
    },
    // Ações do elenco já invalidam esta chave. Mantê-la fresca por alguns
    // segundos evita repetir a leitura completa das 26 criaturas ao alternar
    // rapidamente entre Elenco, Escalação e ficha do jogador.
    staleTime: 30_000,
  });
  const data = dashboardData?.rosterList ?? [];
  const { data: morale } = useQuery({
    queryKey: ["morale-sessions"],
    queryFn: () => fetchMorale(),
    refetchInterval: 60_000,
  });
  const startMeetFn = useServerFn(startMoraleMeeting);
  const rushMeetFn = useServerFn(rushMoraleMeeting);
  const cancelMeetFn = useServerFn(cancelMoraleMeeting);
  const startGeneralFn = useServerFn(startMoraleGeneral);
  const startMeetMut = useMutation({
    mutationFn: () => startMeetFn({ data: { idempotencyKey: crypto.randomUUID() } }),
    onSuccess: (r: any) => {
      toast.success(r?.currency === "gems"
        ? `Reunião iniciada (${Number(r?.cost ?? 0)} 💎).`
        : "Reunião gratuita iniciada.");
      qc.invalidateQueries({ queryKey: ["morale-sessions"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao iniciar reunião"),
  });
  const rushMeetMut = useMutation({
    mutationFn: () => rushMeetFn(),
    onSuccess: (r: any) => {
      toast.success(r?.spent ? `Reunião acelerada (${r.spent} 💎).` : "Reunião concluída.");
      qc.invalidateQueries({ queryKey: ["morale-sessions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["roster-page"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao acelerar"),
  });
  const cancelMeetMut = useMutation({
    mutationFn: () => cancelMeetFn(),
    onSuccess: () => {
      toast.success("Reunião cancelada.");
      qc.invalidateQueries({ queryKey: ["morale-sessions"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao cancelar"),
  });
  const startGeneralMut = useMutation({
    mutationFn: () => startGeneralFn({ data: { idempotencyKey: crypto.randomUUID() } }),
    onSuccess: (r: any) => {
      toast.success(
        `Incentivo aplicado em ${r?.applied ?? 0} jogadores (${Number(r?.cost ?? 0).toLocaleString("pt-BR")} ${r?.currency === "gems" ? "💎" : "$"}).`,
      );
      qc.invalidateQueries({ queryKey: ["morale-sessions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["roster-page"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao aplicar Incentivo Geral"),
  });

  const [q, setQ] = useState("");
  const [elem, setElem] = useState<string | null>(null);
  const [pos, setPos] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("position");
  const [ageFilter, setAgeFilter] = useState<AgeFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const lastSeasonCount = useMemo(
    () => (data ?? []).filter((c: any) => ageStatus((c as any).age) === "last_season").length,
    [data],
  );

  const filtered = useMemo(() => {
    let list = (data ?? []).slice();
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      list = list.filter((c: any) => c.name.toLowerCase().includes(t));
    }
    if (elem) list = list.filter((c: any) => c.element === elem);
    if (pos) list = list.filter((c: any) => c.suggested_position === pos);
    if (ageFilter !== "all") {
      list = list.filter((c: any) => ageStatus((c as any).age) === ageFilter);
    }
    list.sort((a: any, b: any) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "energy") return (b.energy ?? 0) - (a.energy ?? 0);
      if (sort === "age") return ((b as any).age ?? 0) - ((a as any).age ?? 0);
      if (sort === "market_value")
        return (b.market_value ?? 0) - (a.market_value ?? 0);
      if (sort === "position") {
        const pa = POSITION_ORDER[a.suggested_position ?? ""] ?? 99;
        const pb = POSITION_ORDER[b.suggested_position ?? ""] ?? 99;
        if (pa !== pb) return pa - pb;
        return (b.overall ?? 0) - (a.overall ?? 0);
      }
      return (b.overall ?? 0) - (a.overall ?? 0);
    });
    return list;
  }, [data, q, elem, pos, sort, ageFilter]);

  return (
    <div
      className="relative min-h-screen overflow-x-hidden bg-slate-950 bg-cover bg-[position:center_62%] pb-24 text-slate-100 sm:bg-center"
      style={{ backgroundImage: "url('/assets/monster-stadium.webp')" }}
    >
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 bg-gradient-to-b from-slate-950/45 via-slate-950/78 to-slate-950/95" />
      <RetirementDialog creatures={data as any} />
      <header className="relative z-10 border-b border-violet-500/35 bg-slate-950/90 text-white shadow-[0_4px_24px_rgba(76,29,149,0.28)] backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-3 sm:px-4">
          <GameLogo size="xs" className="shrink-0" />
          <TeamCrest teamName={dashboardData?.academy ? dashboardData.trainer.academy_name : null} size="md" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-slate-400">
              Academia
            </p>
            <h1 className="truncate text-base font-bold sm:text-lg">
              {dashboardData?.trainer?.academy_name ?? "Meu clube"}
            </h1>
            <p className="truncate text-[11px] text-slate-400">
              {dashboardData?.trainer?.trainer_name ?? "Treinador"} · Nível {dashboardData?.trainer?.level ?? 0}
            </p>
            <RosterLevelProgress
              level={dashboardData?.trainer?.level ?? 0}
              xpIntoLevel={dashboardData?.trainer?.xpIntoLevel ?? 0}
              xpForNextLevel={dashboardData?.trainer?.xpForNextLevel ?? 1}
              isMaxLevel={dashboardData?.trainer?.isMaxLevel ?? false}
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex h-10 items-center gap-2 rounded-lg border border-violet-400/25 bg-slate-900/80 px-3 text-sm font-bold">
              <Gem className="h-4 w-4 fill-violet-400/25 text-violet-300" />
              {(morale?.gems ?? 0).toLocaleString("pt-BR")}
            </div>
            <div className="hidden h-10 items-center gap-2 rounded-lg border border-amber-400/25 bg-slate-900/80 px-3 text-sm font-bold sm:flex">
              <Coins className="h-4 w-4 text-amber-400" />
              {(morale?.money ?? 0).toLocaleString("pt-BR")}
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-5xl space-y-3 p-2.5 sm:space-y-4 sm:p-4">
        <div className="flex items-end justify-between gap-3 rounded-xl border border-violet-500/25 bg-slate-950/72 px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.2)] backdrop-blur-sm">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-violet-300">Academia</p>
            <h2 className="text-xl font-black text-white sm:text-2xl">Elenco</h2>
            <p className="text-[11px] text-slate-400">{isLoading ? "Carregando..." : `${data?.length ?? 0} / 26 jogadores`}</p>
          </div>
          <Link to="/dashboard" className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs font-bold text-slate-200 hover:border-violet-500/60 hover:bg-violet-950/70">
            Voltar ao início
          </Link>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
        {(() => {
          const finishAt = morale?.meeting_completes_at ?? null;
          const remainingMs = finishAt ? new Date(finishAt).getTime() - Date.now() : 0;
          const totalMs = morale?.collective_ms ?? MORALE_MEETING_COLLECTIVE_MS;
          if (finishAt && remainingMs > 0) {
            return (
              <div className="rounded-xl border border-violet-500/45 bg-gradient-to-r from-violet-950/65 to-slate-950 p-4 shadow-[0_0_18px_rgba(139,92,246,0.12)]">
                <RushTimer
                  target={finishAt}
                  totalMs={totalMs}
                  label={
                    <span className="flex items-center gap-2">
                      <Users className="h-4 w-4" /> Reunião de equipe em andamento
                    </span>
                  }
                >
                  {({ cost }) => (
                    <div className="space-y-3 pt-1">
                      <div className="rounded-lg border border-violet-400/20 bg-violet-500/8 px-3 py-2 text-[11px] leading-relaxed text-slate-300">
                        <p><b className="text-violet-200">Para que serve:</b> ao terminar, aumenta em até +{MORALE_MEETING_COLLECTIVE_BOOST} a moral de todos os jogadores. Moral alta melhora o desempenho efetivo do time nas partidas.</p>
                        <p className="mt-1 text-slate-400">Jogadores que já possuem moral alta recebem um ganho menor. “Concluir agora” encerra a espera imediatamente usando gemas.</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" disabled={rushMeetMut.isPending} onClick={() => rushMeetMut.mutate()}>
                          <Gem className="mr-1 h-3 w-3" />Concluir agora ({cost} 💎)
                        </Button>
                        <Button size="sm" variant="ghost" disabled={cancelMeetMut.isPending} onClick={() => cancelMeetMut.mutate()}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                </RushTimer>
              </div>
            );
          }

          return (
            <div className="flex h-full flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-500/45 bg-gradient-to-r from-violet-950/65 to-slate-950 p-4 shadow-[0_0_18px_rgba(139,92,246,0.12)]">
              <div className="min-w-0 text-sm">
                <p className="flex items-center gap-2 font-bold uppercase text-violet-300">
                  <Users className="h-5 w-5" /> Reunião de equipe {Number((morale as any)?.meeting_cycle?.use_count ?? 0) === 0 ? "(gratuita)" : `(uso extra: ${Number((morale as any)?.meeting_cycle?.next_gem_cost ?? 0)} 💎)`}
                </p>
                <p className="text-xs text-muted-foreground">
                  Após 4h, aumenta em até +{MORALE_MEETING_COLLECTIVE_BOOST} a moral de todo o elenco. Moral alta melhora o desempenho efetivo nas partidas; jogadores já motivados recebem ganho menor.
                </p>
              </div>
              <Button
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => startMeetMut.mutate()}
                disabled={startMeetMut.isPending || (Number((morale as any)?.meeting_cycle?.use_count ?? 0) > 0 && Number(morale?.gems ?? 0) < Number((morale as any)?.meeting_cycle?.next_gem_cost ?? 0))}
              >
                Iniciar reunião
              </Button>
            </div>
          );
        })()}
        {(() => {
          const g = (morale as any)?.general;
          if (!g) return null;
          const money = (morale as any)?.money ?? 0;
          const isExtraUse = Number(g.cycle?.use_count ?? 0) > 0;
          const actionCost = isExtraUse ? Number(g.cycle?.next_gem_cost ?? 0) : Number(g.total_price ?? 0);
          const insufficient = isExtraUse
            ? Number((morale as any)?.gems ?? 0) < actionCost
            : money < actionCost;
          const noneEligible = g.appliable_count <= 0;
          const meetingActive = Boolean(
            morale?.meeting_completes_at &&
            new Date(morale.meeting_completes_at).getTime() > Date.now(),
          );
          const divLabel = {
            bronze: "Bronze",
            prata: "Prata",
            ouro: "Ouro",
            diamante: "Diamante",
            lendaria: "Lendária",
          }[g.division as string] ?? g.division;
          return (
            <div className="flex h-full flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/45 bg-gradient-to-r from-amber-950/45 to-slate-950 p-4 shadow-[0_0_18px_rgba(245,158,11,0.1)]">
              <div className="min-w-0 text-sm">
                <p className="flex items-center gap-2 font-bold uppercase text-amber-300">
                  <HeartPulse className="h-5 w-5 text-amber-400" /> Incentivo Geral (pago)
                </p>
                <p className="text-xs text-muted-foreground">
                  Aplica imediatamente +{MORALE_GENERAL_BOOST} moral nominal em todo o elenco (ganhos decrescentes).
                  {" "}Preço em {divLabel}: ${g.price_per_creature.toLocaleString("pt-BR")} por criatura.
                </p>
                {meetingActive && (
                  <p className="mt-1 text-xs font-medium text-amber-200">
                    Indisponível enquanto a Reunião de Equipe estiver em andamento.
                  </p>
                )}
                <p className="mt-1 text-xs">
                  Aplicar em <b>{g.appliable_count}</b> criaturas por{" "}
                  <b className={insufficient ? "text-red-400" : "text-amber-300"}>
                    {isExtraUse ? `${actionCost.toLocaleString("pt-BR")} 💎` : `$${actionCost.toLocaleString("pt-BR")}`}
                  </b>
                  {g.appliable_count < g.eligible_count && (
                    <span className="text-muted-foreground">
                      {" "}({g.eligible_count - g.appliable_count} já em sessão)
                    </span>
                  )}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="w-full sm:w-auto"
                disabled={startGeneralMut.isPending || insufficient || noneEligible || meetingActive}
                onClick={() => startGeneralMut.mutate()}
                title={meetingActive ? "Reunião de Equipe em andamento" : insufficient ? "Dinheiro insuficiente" : noneEligible ? "Todas em sessão" : ""}
              >
                Aplicar Incentivo Geral
              </Button>
            </div>
          );
        })()}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
          <div className="relative col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome..."
              className="pl-9"
            />
          </div>
          <select
            value={elem ?? ""}
            onChange={(e) => setElem(e.target.value || null)}
            className="min-w-0 rounded-md border border-border/60 bg-card/40 px-2 py-2 text-xs sm:px-3 sm:text-sm"
          >
            <option value="">Todos os elementos</option>
            {ELEMENTS.map((el) => (
              <option key={el} value={el}>
                {ELEMENT_LABEL[el]}
              </option>
            ))}
          </select>
          <select
            value={pos ?? ""}
            onChange={(e) => setPos(e.target.value || null)}
            className="min-w-0 rounded-md border border-border/60 bg-card/40 px-2 py-2 text-xs sm:px-3 sm:text-sm"
          >
            <option value="">Todas as posições</option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="col-span-2 min-w-0 rounded-md border border-border/60 bg-card/40 px-2 py-2 text-xs sm:px-3 sm:text-sm lg:col-span-1"
          >
            <option value="position">Ordenar: Posição (GOL→ATA)</option>
            <option value="overall">Ordenar: Overall</option>
            <option value="name">Ordenar: Nome</option>
            <option value="energy">Ordenar: Energia</option>
            <option value="market_value">Ordenar: Valor</option>
            <option value="age">Ordenar: Idade (+ velhas)</option>
          </select>
        </div>

        <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[
            { value: null, label: "Todos" },
            { value: "Goleiro", label: "Goleiros" },
            { value: "Zagueiro", label: "Zagueiros" },
            { value: "Meio-campo", label: "Meio-campo" },
            { value: "Atacante", label: "Atacantes" },
          ].map((tab) => (
            <button
              key={tab.label}
              type="button"
              onClick={() => setPos(tab.value)}
              className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors sm:px-4 sm:text-sm ${
                pos === tab.value
                  ? "border-violet-400 bg-violet-600/25 text-violet-200 shadow-[0_0_12px_rgba(139,92,246,0.22)]"
                  : "border-slate-700 bg-slate-900/70 text-slate-300 hover:border-violet-500/60"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { key: "all", label: "Todas" },
              { key: "veteran", label: "Veteranas" },
              { key: "last_season", label: "Última temporada" },
            ] as { key: AgeFilter; label: string }[]
          ).map((t) => (
            <Button
              key={t.key}
              size="sm"
              variant={ageFilter === t.key ? "default" : "outline"}
              className={ageFilter === t.key
                ? "border-violet-500 bg-violet-600 text-white hover:bg-violet-500"
                : "border-slate-700 bg-slate-900/75 text-slate-300 hover:border-violet-500/60 hover:bg-violet-950/50 hover:text-white"}
              onClick={() => setAgeFilter(t.key)}
            >
              {t.label}
            </Button>
          ))}
          {lastSeasonCount > 0 && ageFilter !== "last_season" && (
            <button
              type="button"
              onClick={() => setAgeFilter("last_season")}
              className="w-full rounded-md border border-orange-500/40 bg-orange-500/10 px-3 py-1.5 text-center text-xs text-orange-300 hover:bg-orange-500/20 sm:ml-auto sm:w-auto"
            >
              <Hourglass className="mr-1 inline h-3 w-3" />
              {lastSeasonCount} na última temporada — ver
            </button>
          )}
        </div>

        {isLoading ? (
          <p className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 text-sm text-slate-400">Carregando elenco...</p>
        ) : filtered.length === 0 ? (
          <p className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 text-sm text-slate-400">
            Nenhuma criatura encontrada.
          </p>
        ) : (
          <RosterList creatures={filtered} expandedId={expandedId} onToggle={(id) => setExpandedId(expandedId === id ? null : id)} />
        )}
      </main>
    </div>
  );
}

function RosterLevelProgress({
  level,
  xpIntoLevel,
  xpForNextLevel,
  isMaxLevel,
}: {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  isMaxLevel: boolean;
}) {
  const percentage = isMaxLevel
    ? 100
    : Math.max(0, Math.min(100, Math.round((xpIntoLevel / Math.max(1, xpForNextLevel)) * 100)));
  return (
    <div className="mt-1 max-w-48" aria-label={isMaxLevel ? "Nível máximo" : `Progresso para o nível ${level + 1}`}>
      <div className="mb-0.5 flex items-center justify-between text-[8px] font-semibold uppercase tracking-wide text-slate-400">
        <span>{isMaxLevel ? "Nível máximo" : `Nível ${level + 1}`}</span>
        <span>{isMaxLevel ? "100%" : `${xpIntoLevel.toLocaleString("pt-BR")}/${xpForNextLevel.toLocaleString("pt-BR")} XP`}</span>
      </div>
      <Progress value={percentage} className="h-1 bg-slate-800 [&>div]:bg-gradient-to-r [&>div]:from-violet-600 [&>div]:to-cyan-400" />
    </div>
  );
}

function RosterList({ creatures, expandedId, onToggle }: { creatures: any[]; expandedId: string | null; onToggle: (id: string) => void }) {
  return (
    <div className="rounded-xl bg-transparent shadow-[0_18px_50px_rgba(0,0,0,0.28)] lg:overflow-hidden lg:border lg:border-slate-700/80 lg:bg-slate-950/70">
      <div className="hidden grid-cols-[minmax(185px,2fr)_70px_80px_74px_82px_90px_76px_100px_32px] gap-2 border-b border-slate-700/80 bg-slate-900/85 px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 lg:grid">
        <span>Jogador</span><span>Posição</span><span>Elemento</span><span>Overall</span><span>Energia</span><span>Moral</span><span>Temporada</span><span className="text-right">Valor</span><SlidersHorizontal className="h-4 w-4 justify-self-center" />
      </div>
      <div className="space-y-3 lg:divide-y lg:divide-slate-800 lg:space-y-0">
        {creatures.map((c) => (
          <RosterRow key={c.id} creature={c} expanded={expandedId === c.id} onToggle={() => onToggle(c.id)} />
        ))}
      </div>
    </div>
  );
}

function RosterRow({ creature: c, expanded, onToggle }: { creature: any; expanded: boolean; onToggle: () => void }) {
  const status = ageStatus(c.age);
  const ms = moraleState(c.morale);
  const shortPosition = c.suggested_position === "Goleiro" ? "GOL" : c.suggested_position === "Zagueiro" ? "ZAG" : c.suggested_position === "Meio-campo" ? "MEI" : "ATA";
  const initials = String(c.name ?? "?").split(/\s+/).slice(0, 2).map((part: string) => part[0]).join("").toUpperCase();
  const seasonLabel = status === "last_season" ? "Última" : status === "veteran" ? `${seasonsRemaining(c.age)} rest.` : "Pleno";
  const appliedHalfStars = Math.max(0, Math.min(10, c.half_stars_earned ?? 0));
  const curveXp = (c.career_baseline_xp ?? 0) + (c.xp_spent_training ?? 0) + (c.xp ?? 0);
  const starBaseXp = xpForHalfStarsLocal(appliedHalfStars);
  const starTargetXp = xpForHalfStarsLocal(Math.min(10, appliedHalfStars + 1));
  const starNeed = Math.max(1, starTargetXp - starBaseXp);
  const starInto = appliedHalfStars >= 10 ? starNeed : Math.max(0, Math.min(starNeed, curveXp - starBaseXp));
  const starProgress = appliedHalfStars >= 10 ? 100 : Math.round((starInto / starNeed) * 100);
  const nextStars = (Math.min(10, appliedHalfStars + 1) / 2).toFixed(1);
  const attributes = c.is_goalkeeper
    ? [["Defesa", c.attr_defender], ["Mãos", c.attr_maos], ["Elasticidade", c.attr_elasticidade], ["Concentração", c.attr_concentracao], ["Força", c.attr_forca], ["Técnica", c.attr_tecnica]]
    : [["Ataque", c.attr_atacar], ["Defesa", c.attr_defender], ["Força", c.attr_forca], ["Velocidade", c.attr_pique], ["Técnica", c.attr_tecnica], ["Passe", c.attr_passar]];

  return (
    <div className={`overflow-hidden rounded-xl border transition-colors lg:rounded-none lg:border-0 ${expanded ? "border-violet-500/60 bg-violet-950/25" : "border-slate-700/80 bg-slate-950/65 hover:bg-slate-900/65"}`}>
      <button type="button" onClick={onToggle} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 text-left transition-colors sm:px-4 lg:grid-cols-[minmax(185px,2fr)_70px_80px_74px_82px_90px_76px_100px_32px] lg:gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg border text-sm font-black shadow-inner ${ELEMENT_COLORS[c.element] ?? "border-slate-600 bg-slate-800 text-slate-200"}`}>{initials}</div>
          <div className="min-w-0">
            <p className="truncate font-bold text-white">{c.name}</p>
            <p className="text-[11px] text-slate-400">{c.age ?? 18} anos · {c.species}</p>
          </div>
        </div>
        <Badge className="hidden justify-self-start border-violet-500/25 bg-violet-500/15 text-violet-300 lg:inline-flex">{shortPosition}</Badge>
        <Badge variant="outline" className={`hidden justify-self-start ${ELEMENT_COLORS[c.element] ?? ""} lg:inline-flex`}>{ELEMENT_LABEL[c.element] ?? c.element}</Badge>
        <div className="hidden min-h-14 flex-col items-start justify-center gap-1 lg:flex">
          <p className="text-xl font-black leading-none text-white">{c.overall}</p>
          <div className="flex h-3.5 w-[68px] items-center overflow-visible">
            <StarRating className="w-full justify-start" value={halfStarsToStars(c.half_stars_earned ?? 0)} size={0.62} />
          </div>
          <div className="w-[68px]" title={appliedHalfStars >= 10 ? "Estrelas máximas" : `${starInto}/${starNeed} XP para ${nextStars} estrelas`}>
            <div className="h-1 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-300" style={{ width: `${starProgress}%` }} /></div>
            <p className="mt-0.5 truncate text-[7px] font-semibold text-violet-300">{appliedHalfStars >= 10 ? "MÁXIMO" : `${starInto}/${starNeed} XP`}</p>
          </div>
        </div>
        <div className="hidden min-w-0 items-center gap-2 lg:flex">
          <BatteryCharging className={`h-4 w-4 shrink-0 ${(c.energy ?? 100) >= 70 ? "text-cyan-300" : (c.energy ?? 100) >= 40 ? "text-amber-300" : "text-red-400"}`} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-cyan-200">{c.energy ?? 100}%</p>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-300" style={{ width: `${Math.max(0, Math.min(100, c.energy ?? 100))}%` }} />
            </div>
          </div>
        </div>
        <div className="hidden items-center gap-2 lg:flex">
          <span className="text-base">{MORALE_EMOJI[ms]}</span>
          <div><p className="font-bold text-emerald-400">{c.morale ?? 50}%</p><p className="text-[10px] text-slate-400">{MORALE_LABEL[ms]}</p></div>
        </div>
        <Badge className={`hidden justify-self-start lg:inline-flex ${status === "last_season" ? "bg-orange-500/20 text-orange-300" : status === "veteran" ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/15 text-emerald-300"}`}>{seasonLabel}</Badge>
        <div className="hidden text-right font-bold text-slate-100 lg:block">$ {(c.market_value ?? 0).toLocaleString("pt-BR")}</div>
        <div className="flex items-center gap-3 lg:contents">
          <div className="text-right lg:hidden">
            <p className="text-lg font-black text-white">{c.overall}</p>
            <p className="text-[10px] font-semibold text-cyan-300">⚡ {c.energy ?? 100}%</p>
            <p className="text-[8px] font-semibold text-violet-300">XP ★ {starInto}/{starNeed}</p>
            <p className="text-[9px] text-slate-400">{shortPosition} · {ELEMENT_LABEL[c.element]}</p>
          </div>
          <span className="grid h-8 w-8 place-items-center rounded-md border border-slate-700 bg-slate-900 text-slate-300">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </div>
        <div className="col-span-2 grid grid-cols-3 gap-2 border-t border-slate-800/90 pt-3 lg:hidden">
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Moral</p>
            <p className="mt-0.5 truncate text-xs font-bold text-emerald-300">{MORALE_EMOJI[ms]} {c.morale ?? 50}% · {MORALE_LABEL[ms]}</p>
          </div>
          <div className="min-w-0 text-center">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Estrelas</p>
            <div className="mt-0.5 flex justify-center"><StarRating value={halfStarsToStars(c.half_stars_earned ?? 0)} size={0.58} /></div>
          </div>
          <div className="min-w-0 text-right">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Valor</p>
            <p className="mt-0.5 truncate text-xs font-bold text-amber-200">$ {(c.market_value ?? 0).toLocaleString("pt-BR")}</p>
          </div>
          <div className="col-span-3 grid grid-cols-[auto_1fr_auto] items-center gap-2">
            <span className="text-[9px] font-semibold text-violet-300">XP</span>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-300" style={{ width: `${starProgress}%` }} /></div>
            <span className="text-[9px] font-semibold text-violet-200">{appliedHalfStars >= 10 ? "MÁX." : `${starInto}/${starNeed}`}</span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="mx-2 mb-2 grid gap-5 rounded-xl border border-violet-500/55 bg-gradient-to-br from-slate-950 via-violet-950/25 to-slate-950 p-3 shadow-[0_0_24px_rgba(139,92,246,0.12)] sm:mx-4 sm:mb-3 sm:p-4 md:grid-cols-3">
          <div>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-violet-300">Atributos</p>
            <div className="space-y-2">
              {attributes.map(([label, raw]) => {
                const value = Number(raw ?? c.overall ?? 0);
                return <div key={String(label)} className="grid grid-cols-[82px_1fr_28px] items-center gap-2 text-xs"><span className="text-slate-300">{label}</span><div className="h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-400" style={{ width: `${Math.min(100, Math.max(4, value))}%` }} /></div><span className="text-right font-bold text-slate-200">{value}</span></div>;
              })}
            </div>
          </div>
          <div className="border-slate-800 md:border-x md:px-5">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-violet-300">Informações</p>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between"><dt className="text-slate-400">Experiência</dt><dd className="font-semibold">{(c.xp ?? 0).toLocaleString("pt-BR")} XP</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Energia</dt><dd className="font-semibold text-cyan-300">{c.energy ?? 100}%</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Moral</dt><dd className="font-semibold text-emerald-300">{c.morale ?? 50}%</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Valor de mercado</dt><dd className="font-semibold">$ {(c.market_value ?? 0).toLocaleString("pt-BR")}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Momento da carreira</dt><dd className="font-semibold">{seasonLabel}</dd></div>
            </dl>
          </div>
          <div>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-violet-300">Condição</p>
            <div className="space-y-2 text-xs">
              <div className="rounded-lg border border-cyan-500/25 bg-cyan-500/8 p-3"><BatteryCharging className="mb-1 h-4 w-4 text-cyan-300" /><b>{FATIGUE_LABEL[fatigueState(c.energy ?? 100)]}</b><p className="mt-1 text-slate-400">Energia atual: {c.energy ?? 100}%</p></div>
              <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/8 p-3"><b>{MORALE_EMOJI[ms]} Moral {MORALE_LABEL[ms]}</b><p className="mt-1 text-slate-400">{moraleReason(c)}</p></div>
              <Link to="/creatures/$id" params={{ id: c.id }} className="inline-flex text-xs font-bold text-violet-300 hover:text-violet-200">Ver ficha completa →</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function renderCard(c: any) {
  const status = ageStatus(c.age);
  const seasons = seasonsRemaining(c.age);
  const cardBorder =
    status === "last_season"
      ? "border-orange-500/60 bg-orange-500/5 hover:border-orange-400/80"
      : status === "veteran"
      ? "border-amber-500/40 hover:border-amber-400/60"
      : "hover:border-primary/40 hover:bg-card/70";
  return (
    <Link key={c.id} to="/creatures/$id" params={{ id: c.id }} preload="intent" className="block">
      <Card className={"transition-colors " + cardBorder}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold">{c.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {c.suggested_position} · {c.age ?? 18} anos
              </p>
            </div>
            <Badge variant="outline" className={ELEMENT_COLORS[c.element] ?? ""}>
              {ELEMENT_LABEL[c.element] ?? c.element}
            </Badge>
          </div>

          {status === "veteran" && (
            <div className="mt-2 flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">
              <Clock className="h-3 w-3" />
              <span className="font-medium">Veterano</span>
              <span className="text-amber-300/80">· {seasons} temporadas restantes</span>
            </div>
          )}
          {status === "last_season" && (
            <div className="mt-2 flex items-center gap-1.5 rounded-md border border-orange-400 bg-orange-500 px-2 py-1 text-[11px] font-bold text-white shadow-sm">
              <Hourglass className="h-3 w-3" />
              <span>Última temporada</span>
            </div>
          )}

          {(c.injury_matches_remaining ?? 0) > 0 && (
            <div className="mt-2 flex items-center gap-1.5 rounded-md border border-red-500/60 bg-red-500/10 px-2 py-1 text-[11px] font-semibold text-red-300">
              <HeartPulse className="h-3 w-3" />
              <span>Lesão {c.injury_severity === "grave" ? "GRAVE" : c.injury_severity === "moderada" ? "moderada" : "leve"}</span>
              <span className="opacity-80">· {c.injury_matches_remaining} {c.injury_matches_remaining === 1 ? "partida" : "partidas"}</span>
            </div>
          )}

          {(() => {
            const fs = fatigueState(c.energy ?? 100);
            const eMul = energyMultiplier(c.energy ?? 100);
            const mMul = moraleMultiplier(c.morale);
            const eff = effectiveOverall(c.overall ?? 0, c.energy ?? 100, c.morale);
            const ePen = Math.round((1 - eMul) * 100);
            const mPen = Math.round((mMul - 1) * 100);
            const ms = moraleState(c.morale);
            return (
              <>
                <div className={"mt-2 flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] " + FATIGUE_CLASS[fs]}>
                  <BatteryCharging className="h-3 w-3" />
                  <span className="font-medium">{FATIGUE_LABEL[fs]}</span>
                  <span className="opacity-80">· {c.energy}%</span>
                  {ePen > 0 && (
                    <span className="ml-auto font-semibold">Ovr {c.overall}→{eff} (fadiga -{ePen}%{mPen !== 0 ? `, moral ${mPen > 0 ? "+" : ""}${mPen}%` : ""})</span>
                  )}
                </div>
                <div
                  className={"mt-1 flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] " + MORALE_CLASS[ms]}
                  title={moraleReason(c)}
                >
                  <span className="text-sm leading-none">{MORALE_EMOJI[ms]}</span>
                  <span className="font-medium">Moral: {MORALE_LABEL[ms]}</span>
                  <span className="opacity-80">· {c.morale ?? 50}</span>
                  {mPen !== 0 && ePen === 0 && (
                    <span className="ml-auto font-semibold">Ovr {c.overall}→{eff} ({mPen > 0 ? "+" : ""}{mPen}%)</span>
                  )}
                </div>
              </>
            );
          })()}

          <div className="mt-3 flex items-end justify-between">
            <div>
              <p className="text-3xl font-bold leading-none">{c.overall}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">overall</p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <div className="flex items-center justify-end">
                <StarRating value={halfStarsToStars(c.half_stars_earned ?? 0)} size={0.8} />
              </div>
              <p className="mt-1">$ {c.market_value.toLocaleString("pt-BR")}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
