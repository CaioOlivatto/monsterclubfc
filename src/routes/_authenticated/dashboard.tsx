import * as React from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { GameRecovery } from "@/components/GameRecovery";
import { getDashboardWithSession } from "@/lib/creatures.functions";
import { createFriendlyMatch } from "@/lib/match.functions";
import { type ConfidenceInfo } from "@/lib/career.functions";
import {
  finishSeasonAndAdvanceWithSession,
  getLeague,
  getSeasonAdvanceStatusWithSession,
  startLeague,
} from "@/lib/league.functions";
import { getMyLineup } from "@/lib/lineup.functions";
import { getMarket } from "@/lib/market.functions";
import { ageStatus } from "@/lib/age";
import { RetirementDialog } from "@/components/RetirementDialog";
import { TeamCrest } from "@/components/TeamCrest";
import { GameLogo } from "@/components/GameLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Coins,
  Gem,
  Hammer,
  Users,
  BatteryCharging,
  Trophy,
  LogOut,
  Swords,
  Store,
  Building2,
  ShoppingBag,
  Inbox,
  Wallet,
  Hourglass,
  Award,
  HeartPulse,
  BatteryLow,
  Bell,
  Shield,
  ChevronRight,
  Star,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Painel — Monster Club Manager" },
      { name: "description", content: "Sua próxima partida, o resumo do time e o acesso a todas as áreas do clube." },
      { property: "og:title", content: "Painel — Monster Club Manager" },
      { property: "og:description", content: "Gerencie sua academia de criaturas." },
    ],
  }),
  component: Dashboard,
});

function fmtMoney(v: number) {
  return "$ " + v.toLocaleString("pt-BR");
}

type Alert = {
  key: string;
  tone: "orange" | "red" | "amber" | "purple";
  icon: React.ReactNode;
  title: string;
  detail: string;
  to: string;
};

function Dashboard() {
  const nav = useNavigate();
  const fetchDashboard = useServerFn(getDashboardWithSession);
  const startFriendly = useServerFn(createFriendlyMatch);
  const fetchLineup = useServerFn(getMyLineup);
  const fetchMarket = useServerFn(getMarket);
  const fetchLeague = useServerFn(getLeague);
  const fetchSeasonStatus = useServerFn(getSeasonAdvanceStatusWithSession);
  const finishSeason = useServerFn(finishSeasonAndAdvanceWithSession);
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const { data: current, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !current.session?.access_token) {
        throw sessionError ?? new Error("Sessão não encontrada.");
      }
      try {
        return await fetchDashboard({
          data: { access_token: current.session.access_token },
        });
      } catch (firstError) {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshed.session?.access_token) throw firstError;
        return fetchDashboard({
          data: { access_token: refreshed.session.access_token },
        });
      }
    },
    staleTime: 20_000,
    retry: 1,
  });
  const rosterList = data?.rosterList ?? [];
  const lineupData = data?.lineupData;
  const confidence = data?.confidence ?? null;
  const financialHealth = (data as any)?.financialHealth;

  const retiredCount = (rosterList ?? []).filter((c: any) => ageStatus(c.age) === "retired").length;
  const lastSeasonCount = (rosterList ?? []).filter((c: any) => ageStatus(c.age) === "last_season").length;
  const injuredCount = (rosterList ?? []).filter((c: any) => (c.injury_matches_remaining ?? 0) > 0).length;
  const lowMoraleCount = (rosterList ?? []).filter((c: any) => (c.morale ?? 50) < 40).length;
  const tiredStarters = React.useMemo(() => {
    const starters: any[] = (lineupData as any)?.lineup?.starters ?? [];
    const byId = new Map((rosterList as any[]).map((c) => [c.id, c]));
    return starters
      .map((s: any) => byId.get(s.creature_id))
      .filter((c: any) => c && (c.energy ?? 100) < 50).length;
  }, [lineupData, rosterList]);

  const alerts: Alert[] = [];
  if (retiredCount > 0)
    alerts.push({
      key: "retired", tone: "red", to: "/roster",
      icon: <Hourglass className="h-4 w-4" />,
      title: `${retiredCount} ${retiredCount === 1 ? "criatura chegou aos 33" : "criaturas chegaram aos 33"} — ação necessária`,
      detail: "Abra a ficha para vender (75%) ou renascer.",
    });
  if (lastSeasonCount > 0)
    alerts.push({
      key: "retire", tone: "orange", to: "/roster",
      icon: <Hourglass className="h-4 w-4" />,
      title: `${lastSeasonCount} ${lastSeasonCount === 1 ? "criatura se aposenta" : "criaturas se aposentam"} nesta temporada`,
      detail: "Decida: vender agora ou renascer.",
    });
  if (injuredCount > 0)
    alerts.push({
      key: "injured", tone: "red", to: "/roster",
      icon: <HeartPulse className="h-4 w-4" />,
      title: `${injuredCount} ${injuredCount === 1 ? "criatura lesionada" : "criaturas lesionadas"}`,
      detail: "Não podem ser escaladas. Acelere com gemas.",
    });
  if (tiredStarters > 0)
    alerts.push({
      key: "tired", tone: "amber", to: "/lineup",
      icon: <BatteryLow className="h-4 w-4" />,
      title: `${tiredStarters} ${tiredStarters === 1 ? "titular cansado" : "titulares cansados"}`,
      detail: "Considere revezar antes da próxima partida.",
    });
  if (lowMoraleCount > 0)
    alerts.push({
      key: "morale", tone: "purple", to: "/roster",
      icon: <span className="text-base leading-none">😞</span>,
      title: `${lowMoraleCount} ${lowMoraleCount === 1 ? "criatura desanimada" : "criaturas desanimadas"}`,
      detail: "Moral baixa reduz o rating.",
    });
  if (financialHealth?.status === "risk")
    alerts.push({
      key: "cash-risk", tone: "red", to: "/finances",
      icon: <Wallet className="h-4 w-4" />,
      title: "Caixa em risco",
      detail: `O saldo cobre aproximadamente ${financialHealth.coveredMatches} partidas. Evite novas compras até formar uma reserva.`,
    });
  else if (financialHealth?.status === "attention")
    alerts.push({
      key: "cash-attention", tone: "amber", to: "/finances",
      icon: <Wallet className="h-4 w-4" />,
      title: "Atenção ao caixa",
      detail: `Reserva recomendada: ${fmtMoney(financialHealth.minimumOperatingReserve)} para cinco partidas.`,
    });

  const notifiedRef = React.useRef(false);
  React.useEffect(() => {
    const pending = (data as any)?.trainer?.pendingLevelUps ?? 0;
    if (pending > 0 && !notifiedRef.current) {
      notifiedRef.current = true;
      const level = (data as any).trainer.level;
      toast.success(pending === 1 ? `⭐ Nível ${level} alcançado!` : `⭐ ${pending} níveis! Agora é nível ${level}.`);
    }
  }, [data]);

  // O painel precisa ficar disponível antes de qualquer trabalho opcional.
  // Antes, ele disparava três consultas remotas pesadas logo após abrir
  // (escalação, mercado e liga), mesmo sem intenção de navegar. Em conexões
  // móveis isso competia com o próprio painel e dava a sensação de travamento.
  // Agora antecipamos somente a tela que o treinador demonstrar interesse em abrir.
  const prefetchDestination = React.useCallback((destination: string) => {
    if (!data) return;
    if (destination === "/lineup") {
      void qc.prefetchQuery({ queryKey: ["lineup"], queryFn: () => fetchLineup(), staleTime: 2 * 60_000 });
    } else if (destination === "/market") {
      void qc.prefetchQuery({ queryKey: ["market"], queryFn: () => fetchMarket(), staleTime: 5 * 60_000 });
    } else if (destination === "/league") {
      void qc.prefetchQuery({ queryKey: ["league", "auto"], queryFn: () => fetchLeague({ data: {} } as any), staleTime: 30_000 });
    }
  }, [data, fetchLeague, fetchLineup, fetchMarket, qc]);

  const friendlyMut = useMutation({
    mutationFn: () => startFriendly(),
    onSuccess: (res) => nav({ to: "/match/$id", params: { id: res.match_id } }),
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível iniciar a partida."),
  });
  const startLeagueFn = useServerFn(startLeague);
  const startSeasonMut = useMutation({
    mutationFn: () => startLeagueFn(),
    onSuccess: () => {
      toast.success("Temporada iniciada! Boa sorte.");
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["league"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível iniciar a temporada."),
  });
  const { data: seasonStatus } = useQuery({
    queryKey: ["season-advance-status"],
    queryFn: async () => {
      const { data: current, error } = await supabase.auth.getSession();
      if (error || !current.session?.access_token) throw error ?? new Error("Sessão não encontrada.");
      return fetchSeasonStatus({ data: { access_token: current.session.access_token } });
    },
    enabled: Boolean(data?.hasLeague),
    staleTime: 10_000,
  });
  const finishSeasonMut = useMutation({
    mutationFn: async () => {
      const { data: current, error } = await supabase.auth.getSession();
      if (error || !current.session?.access_token) throw error ?? new Error("Sessão não encontrada.");
      return finishSeason({ data: { access_token: current.session.access_token } });
    },
    onSuccess: () => {
      toast.success("Nova temporada preparada com sucesso.");
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["league"] });
      qc.invalidateQueries({ queryKey: ["season-advance-status"] });
    },
    onError: (error: any) => toast.error(error?.message ?? "Não foi possível iniciar a nova temporada."),
  });

  async function signOut() {
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Carregando painel...
      </div>
    );
  }

  if (isError || !data) {
    return <GameRecovery area="o painel" />;
  }

  const { trainer, academy, roster, standing, nextMatch, hasLeague } = data;

  return (
    <div
      className="relative min-h-screen overflow-x-hidden bg-slate-950 bg-cover bg-[position:center_62%] sm:bg-center"
      style={{ backgroundImage: "url('/assets/monster-stadium.webp')" }}
    >
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 bg-gradient-to-b from-slate-950/30 via-background/58 to-background/78" />
      <RetirementDialog creatures={rosterList as any} />
      {/* Header slim: identidade + ações no canto */}
      <header className="relative z-10 border-b border-violet-500/35 bg-slate-950/90 text-white shadow-[0_4px_24px_rgba(76,29,149,0.28)] backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-3 sm:px-4">
          <GameLogo size="xs" className="shrink-0" />
          <TeamCrest teamName={academy ? trainer.academy_name : null} size="md" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Academia</p>
            <h1 className="truncate text-base font-bold sm:text-lg">
              {academy ? trainer.academy_name : trainer.trainer_name}
            </h1>
            <p className="truncate text-[11px] text-muted-foreground">
              {trainer.trainer_name} · Nível {trainer.level}
            </p>
            <TrainerLevelProgress
              level={trainer.level}
              xpIntoLevel={trainer.xpIntoLevel}
              xpForNextLevel={trainer.xpForNextLevel}
              isMaxLevel={trainer.isMaxLevel}
            />
          </div>

          <AlertsBell alerts={alerts} />

          <Link
            to="/messages"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border/60 text-muted-foreground hover:text-foreground"
            aria-label="Mensagens"
          >
            <Inbox className="h-4 w-4" />
          </Link>

          <Link
            to="/club"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/80 bg-white text-violet-700 shadow-[0_0_12px_rgba(139,92,246,0.22)] hover:bg-violet-50"
            aria-label="Missões e Clube Mensal"
          >
            <Gem className="h-4 w-4 fill-violet-200 text-violet-700" strokeWidth={2.2} />
          </Link>

          <Button variant="ghost" size="sm" className="h-9 shrink-0 px-2" onClick={signOut} aria-label="Sair">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-3xl space-y-4 px-3 py-4 sm:px-4">
        {/* BLOCO 1 — Ação principal */}
        <NextMatchHero
          nextMatch={nextMatch}
          hasLeague={hasLeague}
          seasonStatus={seasonStatus}
          onPlay={() => nav({
            to: "/lineup",
            search: (nextMatch?.competition
              ? { competition: nextMatch.competition }
              : {}) as any,
          })}
          onStartSeason={() => startSeasonMut.mutate()}
          startSeasonPending={startSeasonMut.isPending}
          onAdvanceSeason={() => finishSeasonMut.mutate()}
          advanceSeasonPending={finishSeasonMut.isPending}
          onFriendly={() => friendlyMut.mutate()}
          friendlyPending={friendlyMut.isPending}
        />

        {financialHealth?.division && (
          <DivisionJourney
            division={financialHealth.division}
            standing={standing}
            cash={academy?.money ?? 0}
            reserve={financialHealth.minimumOperatingReserve ?? 0}
          />
        )}

        {/* BLOCO 2 — Faixa de resumo do time */}
        <TeamSummaryStrip
          money={academy?.money ?? 0}
          gems={academy?.gems ?? 0}
          avgEnergy={roster.avgEnergy}
          confidence={confidence ?? null}
          rosterCount={roster.count}
          rosterSlots={academy?.roster_slots ?? 0}
          avgOverall={roster.avgOverall}
          builders={academy?.builders ?? 0}
          standing={standing}
        />

        {/* BLOCO 4 — Navegação em 4 destinos */}
        <ArenaPvpBanner level={trainer.level ?? 0} />

        <FacilitiesBanner />

        <NavigationHubs onDestinationIntent={prefetchDestination} />
      </main>
    </div>
  );
}

function TrainerLevelProgress({
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
      <div className="mb-0.5 flex items-center justify-between gap-2 text-[8px] font-semibold uppercase tracking-[0.08em] text-slate-400 sm:text-[9px]">
        <span>{isMaxLevel ? "Nível máximo" : `Nível ${level + 1}`}</span>
        <span className="tabular-nums text-violet-300">
          {isMaxLevel ? "100%" : `${xpIntoLevel.toLocaleString("pt-BR")}/${xpForNextLevel.toLocaleString("pt-BR")} XP`}
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full border border-violet-400/25 bg-slate-800/90 shadow-inner"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentage}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-600 via-fuchsia-500 to-cyan-400 shadow-[0_0_8px_rgba(217,70,239,0.8)] transition-[width] duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function ArenaPvpBanner({ level }: { level: number }) {
  const unlocked = level >= 10;
  const content = (
    <div className={`group relative overflow-hidden rounded-xl border px-4 py-3 transition-all sm:px-5 ${
      unlocked
        ? "border-fuchsia-400/55 bg-gradient-to-r from-slate-950/95 via-purple-950/95 to-slate-950/95 shadow-[0_0_22px_rgba(168,85,247,0.22)] hover:border-fuchsia-300 hover:shadow-[0_0_28px_rgba(168,85,247,0.34)]"
        : "border-violet-400/35 bg-gradient-to-r from-slate-950/95 via-indigo-950/90 to-slate-950/95 shadow-[0_0_18px_rgba(99,102,241,0.16)]"
    }`}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_50%,rgba(168,85,247,0.2),transparent_38%)]" />
      <div className="relative flex items-center gap-3 sm:gap-4">
        <div className="relative grid h-14 w-14 shrink-0 place-items-center sm:h-16 sm:w-16">
          <Shield className="absolute h-14 w-14 fill-violet-950/80 text-violet-300 drop-shadow-[0_0_12px_rgba(168,85,247,0.75)] sm:h-16 sm:w-16" strokeWidth={1.5} />
          <Swords className="relative h-7 w-7 text-fuchsia-100 drop-shadow-[0_0_8px_rgba(232,121,249,0.9)] sm:h-8 sm:w-8" strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-black uppercase italic leading-tight tracking-[0.08em] text-white sm:text-lg">Arena PVP</h2>
          <p className="mt-0.5 text-xs font-semibold uppercase leading-tight tracking-[0.1em] text-fuchsia-300 sm:text-sm">
            Desafio online
          </p>
          <p className="mt-1 text-[9px] font-medium uppercase leading-none tracking-[0.12em] text-slate-400 sm:text-[10px]">
            {unlocked ? "Arena liberada · Enfrente outros treinadores" : "Liberado no nível 10"}
          </p>
        </div>
        <ChevronRight className={`h-5 w-5 shrink-0 ${unlocked ? "text-fuchsia-200 transition-transform group-hover:translate-x-1" : "text-slate-600"}`} />
      </div>
    </div>
  );

  return unlocked ? <Link to="/arena" aria-label="Entrar na Arena PVP">{content}</Link> : content;
}

/* ---------------- BLOCO 1: Hero ---------------- */

const MATCH_EMBLEMS = {
  league: {
    label: "Campeonato",
    image: "/assets/tournament-campeonato.webp",
    frame: "border-cyan-300/45 bg-cyan-400/10 text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.18)]",
  },
  cup: {
    label: "Copa da Divisão",
    image: "/assets/tournament-copa-divisao.webp",
    frame: "border-amber-300/50 bg-amber-400/10 text-amber-200 shadow-[0_0_18px_rgba(251,191,36,0.2)]",
  },
  world_league: {
    label: "Liga Mundial",
    image: "/assets/tournament-liga-mundial.webp",
    frame: "border-blue-300/50 bg-blue-500/10 text-blue-200 shadow-[0_0_18px_rgba(59,130,246,0.22)]",
  },
  world_cup: {
    label: "Copa Mundial",
    image: "/assets/tournament-copa-mundial.webp",
    frame: "border-fuchsia-300/50 bg-fuchsia-500/10 text-fuchsia-200 shadow-[0_0_18px_rgba(217,70,239,0.22)]",
  },
  friendly: {
    label: "Amistoso",
    image: "/assets/tournament-amistoso.webp",
    frame: "border-emerald-300/45 bg-emerald-500/10 text-emerald-200 shadow-[0_0_18px_rgba(16,185,129,0.18)]",
  },
} as const;

function CompetitionEmblem({ competition }: { competition?: string | null }) {
  const config = MATCH_EMBLEMS[competition as keyof typeof MATCH_EMBLEMS] ?? MATCH_EMBLEMS.league;

  return (
    <div
      className="flex w-[76px] flex-col items-center gap-1 sm:w-[92px]"
      title={config.label}
      aria-label={`Emblema: ${config.label}`}
    >
      <div className={`grid h-16 w-16 place-items-center rounded-xl border p-0.5 sm:h-[72px] sm:w-[72px] ${config.frame}`}>
        <img
          src={config.image}
          alt=""
          className="h-full w-full object-contain drop-shadow-[0_0_8px_currentColor]"
        />
      </div>
      <span className="max-w-full text-center text-[8px] font-black uppercase leading-none tracking-[0.08em] text-slate-200 sm:text-[9px]">
        {config.label}
      </span>
    </div>
  );
}

function NextMatchHero({
  nextMatch,
  hasLeague,
  seasonStatus,
  onPlay,
  onStartSeason,
  startSeasonPending,
  onAdvanceSeason,
  advanceSeasonPending,
  onFriendly,
  friendlyPending,
}: {
  nextMatch: any;
  hasLeague: boolean;
  seasonStatus?: { playerLeagueFinished?: boolean; leagueFinished?: boolean; eligible?: boolean; reason?: string | null };
  onPlay: () => void;
  onStartSeason: () => void;
  startSeasonPending: boolean;
  onAdvanceSeason: () => void;
  advanceSeasonPending: boolean;
  onFriendly: () => void;
  friendlyPending: boolean;
}) {
  const hasMatch = !!nextMatch;
  const seasonNotStarted = !hasMatch && !hasLeague;
  const seasonIdle = !hasMatch && hasLeague;
  const seasonFinished = seasonIdle && Boolean(seasonStatus?.playerLeagueFinished ?? seasonStatus?.leagueFinished);
  const competition = hasMatch ? nextMatch.competition : "league";

  return (
    <Card className="overflow-hidden border-cyan-300/35 bg-gradient-to-br from-slate-950/95 via-slate-900/92 to-indigo-950/95 text-white shadow-xl shadow-blue-950/35 backdrop-blur-md">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="shrink-0">
            <CompetitionEmblem competition={competition} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-violet-300">
              {hasMatch
                ? `Rodada ${nextMatch.round} · ${nextMatch.competitionLabel ?? "Campeonato"}${nextMatch.phaseLabel ? ` · ${nextMatch.phaseLabel}` : ""}`
                : "Campeonato"}
            </p>
            {hasMatch ? (
              <>
                <h2 className="mt-0.5 truncate text-lg font-bold text-white sm:text-xl">
                  {nextMatch.home_team} <span className="text-violet-300">vs</span> {nextMatch.away_team}
                </h2>
                <p className="mt-0.5 text-xs text-slate-300">
                  {nextMatch.is_home ? "Em casa" : "Fora"} · próxima partida oficial
                </p>
              </>
            ) : seasonNotStarted ? (
              <>
                <h2 className="mt-0.5 text-base font-semibold">Aguardando início da temporada</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Toque abaixo para começar.</p>
              </>
            ) : (
              <>
                <h2 className="mt-0.5 text-base font-semibold">{seasonFinished ? "Temporada concluída" : "Rodada concluída"}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {seasonFinished ? (seasonStatus?.reason ?? "Confira os resultados e prepare a próxima temporada.") : "Nada pendente no momento — próxima rodada em breve."}
                </p>
              </>
            )}
          </div>
          {hasMatch && (
            <div className="flex shrink-0 items-center gap-1 sm:gap-2" aria-hidden="true">
              <TeamCrest
                teamKey={nextMatch.home_starter_key}
                teamName={nextMatch.home_team}
                teamElement={nextMatch.home_element}
                size="md"
              />
              <span className="font-black italic text-violet-300">VS</span>
              <TeamCrest
                teamKey={nextMatch.away_starter_key}
                teamName={nextMatch.away_team}
                teamElement={nextMatch.away_element}
                size="md"
              />
            </div>
          )}
        </div>

        {hasMatch ? (
          <Button
            size="lg"
            className="h-12 w-full border border-violet-300/70 bg-gradient-to-r from-violet-700 via-purple-600 to-indigo-700 text-base font-bold text-white shadow-[0_0_22px_rgba(139,92,246,0.5)] hover:from-violet-600 hover:via-purple-500 hover:to-indigo-600"
            onClick={onPlay}
          >
            <Swords className="mr-2 h-5 w-5" />
            Jogar partida
          </Button>
        ) : seasonNotStarted ? (
          <Button
            size="lg"
            className="h-12 w-full text-base font-semibold"
            onClick={onStartSeason}
            disabled={startSeasonPending}
          >
            <Trophy className="mr-2 h-5 w-5" />
            {startSeasonPending ? "Iniciando..." : "Iniciar temporada"}
          </Button>
        ) : seasonFinished ? (
          <div className="grid gap-2">
            <Button asChild size="lg" variant="secondary" className="h-12 w-full">
              <Link to="/league"><Trophy className="mr-2 h-5 w-5" />Ver resultados</Link>
            </Button>
            <Button size="lg" className="h-12 w-full" onClick={onAdvanceSeason} disabled={!seasonStatus?.eligible || advanceSeasonPending}>
              <Sparkles className="mr-2 h-5 w-5" />
              {advanceSeasonPending ? "Preparando..." : "Iniciar nova temporada"}
            </Button>
          </div>
        ) : (
          <Button asChild size="lg" variant="secondary" className="h-12 w-full">
            <Link to="/league"><Trophy className="mr-2 h-5 w-5" />Ver classificação</Link>
          </Button>
        )}

        {(hasMatch || seasonIdle) && (
          <div className="text-center">
            <button
              type="button"
              onClick={onFriendly}
              disabled={friendlyPending}
              className="text-xs text-violet-300 underline underline-offset-4 hover:text-white disabled:opacity-50"
            >
              {friendlyPending ? "iniciando amistoso..." : "ou jogar um amistoso de treino"}
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const JOURNEY_DIVISIONS = {
  bronze: {
    label: "Bronze", points: 8, badge: "/assets/division-bronze.webp",
    card: "border-amber-400/55 from-stone-950/95 via-amber-950/85 to-stone-950/95 shadow-amber-950/30",
    accent: "text-amber-300", progress: "shadow-[0_0_10px_rgba(245,158,11,0.7)]",
  },
  prata: {
    label: "Prata", points: 12, badge: "/assets/division-prata.webp",
    card: "border-slate-300/60 from-slate-950/95 via-slate-800/90 to-slate-950/95 shadow-slate-950/35",
    accent: "text-slate-200", progress: "shadow-[0_0_10px_rgba(203,213,225,0.65)]",
  },
  ouro: {
    label: "Ouro", points: 16, badge: "/assets/division-ouro.webp",
    card: "border-yellow-400/60 from-stone-950/95 via-yellow-950/85 to-stone-950/95 shadow-yellow-950/35",
    accent: "text-yellow-300", progress: "shadow-[0_0_10px_rgba(250,204,21,0.7)]",
  },
  diamante: {
    label: "Diamante", points: 20, badge: "/assets/division-diamante.webp",
    card: "border-cyan-300/65 from-slate-950/95 via-cyan-950/85 to-blue-950/95 shadow-cyan-950/35",
    accent: "text-cyan-200", progress: "shadow-[0_0_12px_rgba(34,211,238,0.75)]",
  },
  lendaria: {
    label: "Lendária", points: 24, badge: "/assets/division-lendaria.webp",
    card: "border-fuchsia-400/65 from-slate-950/95 via-purple-950/90 to-slate-950/95 shadow-purple-950/40",
    accent: "text-fuchsia-300", progress: "shadow-[0_0_12px_rgba(217,70,239,0.75)]",
  },
} as const;

function DivisionJourney({
  division,
  standing,
  cash,
  reserve,
}: {
  division: string;
  standing: any;
  cash: number;
  reserve: number;
}) {
  const config = JOURNEY_DIVISIONS[division as keyof typeof JOURNEY_DIVISIONS] ?? JOURNEY_DIVISIONS.bronze;
  const matches = (standing?.wins ?? 0) + (standing?.draws ?? 0) + (standing?.losses ?? 0);
  const points = standing?.points ?? 0;
  const goals = [
    { label: "Jogue sua primeira partida oficial", current: Math.min(matches, 1), target: 1 },
    { label: `Conquiste ${config.points} pontos na Liga ${config.label}`, current: Math.min(points, config.points), target: config.points },
    {
      label: "Após 3 jogos, mantenha caixa para mais 5 partidas",
      current: matches >= 3 && cash >= reserve ? 1 : 0,
      target: 1,
    },
  ];
  const completed = goals.filter((goal) => goal.current >= goal.target).length;

  return (
    <Card className={`relative overflow-hidden bg-gradient-to-r text-white shadow-lg backdrop-blur-md ${config.card}`}>
      <img src={config.badge} alt={`Escudo da Liga ${config.label}`} className="absolute -right-1 top-1/2 h-20 w-20 -translate-y-1/2 object-contain drop-shadow-[0_0_22px_rgba(255,255,255,0.18)] sm:-right-2 sm:h-32 sm:w-32" />
      <CardContent className="relative space-y-3 p-4 pr-20 sm:pr-32">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={`text-[10px] font-semibold uppercase tracking-wider ${config.accent}`}>
              Jornada {config.label}
            </p>
            <h2 className="text-sm font-semibold text-white">Primeiros passos do seu clube</h2>
            <p className="mt-0.5 text-xs text-amber-50/65">
              Evolua sem pressa: jogue, pontue e proteja o caixa antes de grandes compras.
            </p>
          </div>
          <Badge className="shrink-0 border border-amber-300/60 bg-amber-400 text-amber-950 hover:bg-amber-400">{completed}/3</Badge>
        </div>
        <Progress value={(completed / goals.length) * 100} className={`h-1.5 bg-white/15 ${config.progress}`} />
        <div className="grid gap-2 sm:grid-cols-2">
          {goals.map((goal) => {
            const done = goal.current >= goal.target;
            return (
              <div key={goal.label} className="flex items-center gap-2 text-xs">
                <span
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                    done ? "border-emerald-400 bg-emerald-500 text-white" : "border-white/25 bg-white/5 text-white/60"
                  }`}
                  aria-hidden="true"
                >
                  {done ? "✓" : "·"}
                </span>
                <span className={done ? "text-white/55 line-through" : "text-white/90"}>{goal.label}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}


/* ---------------- BLOCO 2: Faixa de resumo ---------------- */

function TeamSummaryStrip(props: {
  money: number;
  gems: number;
  avgEnergy: number;
  confidence: ConfidenceInfo | null;
  rosterCount: number;
  rosterSlots: number;
  avgOverall: number;
  builders: number;
  standing: any;
}) {
  const { money, gems, avgEnergy, confidence } = props;
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          className="grid w-full grid-cols-4 items-stretch overflow-hidden rounded-xl border border-cyan-300/30 bg-gradient-to-r from-slate-950/95 via-blue-950/90 to-slate-950/95 px-1 py-1.5 text-left text-white shadow-[0_0_18px_rgba(59,130,246,0.18)] backdrop-blur-md transition hover:border-cyan-300/50 hover:shadow-[0_0_22px_rgba(59,130,246,0.25)] sm:px-2"
        >
          <StripCell icon={<Coins className="h-4 w-4" />} value={fmtMoney(money)} label="caixa" tone="amber" />
          <StripCell icon={<Gem className="h-4 w-4" />} value={String(gems)} label="gemas" tone="violet" divided />
          <StripCell icon={<BatteryCharging className="h-4 w-4" />} value={`${avgEnergy}%`} label="energia" tone="emerald" divided />
          <StripCell
            icon={<Award className="h-4 w-4" />}
            value={confidence?.label ?? "—"}
            label="confiança"
            tone="sky"
            divided
          />
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Resumo do time</SheetTitle>
          <SheetDescription>Todos os indicadores da sua academia.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4 pb-6">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <DetailStat icon={<Coins className="h-4 w-4" />} label="Caixa" value={fmtMoney(props.money)} />
            <DetailStat icon={<Gem className="h-4 w-4" />} label="Gemas" value={String(props.gems)} />
            <DetailStat icon={<Hammer className="h-4 w-4" />} label="Construtores" value={String(props.builders)} />
            <DetailStat icon={<Users className="h-4 w-4" />} label="Elenco" value={`${props.rosterCount}/${props.rosterSlots || "?"}`} />
            <DetailStat icon={<Star className="h-4 w-4" />} label="Overall médio" value={String(props.avgOverall)} />
            <DetailStat icon={<BatteryCharging className="h-4 w-4" />} label="Energia média" value={`${props.avgEnergy}%`} extra={<Progress value={props.avgEnergy} className="mt-2 h-1.5" />} />
          </div>

          {props.standing && (
            <div className="rounded-lg border border-border/60 bg-card/40 p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Classificação</p>
              <p className="mt-1 text-2xl font-bold">
                {props.standing.position}º
                <span className="ml-1 text-sm font-normal text-muted-foreground">/ {props.standing.total}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {props.standing.points} pts · {props.standing.wins}V {props.standing.draws}E {props.standing.losses}D · {props.standing.goals_for}-{props.standing.goals_against}
              </p>
            </div>
          )}

          {confidence && <ConfidenceInline c={confidence} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

const STRIP_TONES = {
  amber: "text-amber-400",
  violet: "text-violet-400",
  emerald: "text-lime-400",
  sky: "text-sky-400",
} as const;

function StripCell({
  icon,
  value,
  label,
  tone,
  divided = false,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  tone: keyof typeof STRIP_TONES;
  divided?: boolean;
}) {
  return (
    <div className={`flex min-w-0 items-center gap-1.5 px-1.5 py-1 sm:gap-2 sm:px-3 ${divided ? "border-l border-cyan-100/15" : ""}`}>
      <div className={`shrink-0 drop-shadow-[0_0_6px_currentColor] ${STRIP_TONES[tone]}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <span className={`block truncate text-[7px] font-medium uppercase tracking-wider sm:text-[9px] ${STRIP_TONES[tone]}`}>{label}</span>
        <p className={`truncate text-[10px] font-bold sm:text-sm ${tone === "amber" ? "text-amber-300" : "text-white"}`}>{value}</p>
      </div>
    </div>
  );
}

function DetailStat({ icon, label, value, extra }: { icon: React.ReactNode; label: string; value: string; extra?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-border/60 bg-card/40 p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="truncate text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-1 truncate text-lg font-bold">{value}</p>
      {extra}
    </div>
  );
}

/* ---------------- Alertas — Bell ---------------- */

const TONE_BADGE: Record<Alert["tone"], string> = {
  orange: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  red: "bg-red-500/20 text-red-300 border-red-500/40",
  amber: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  purple: "bg-purple-500/20 text-purple-200 border-purple-500/40",
};

function AlertsBell({ alerts }: { alerts: Alert[] }) {
  const count = alerts.length;
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          className="relative grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border/60 text-muted-foreground hover:text-foreground"
          aria-label={`${count} alertas`}
        >
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute -right-1 -top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {count}
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Alertas do clube</SheetTitle>
          <SheetDescription>
            {count === 0 ? "Nenhum alerta no momento." : `${count} ${count === 1 ? "item pedindo" : "itens pedindo"} atenção.`}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-2 pb-6">
          {alerts.map((a) => (
            <Link
              key={a.key}
              to={a.to}
              preload="intent"
              className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 p-3 transition-colors hover:bg-card/70"
            >
              <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-md border ${TONE_BADGE[a.tone]}`}>
                {a.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{a.title}</p>
                <p className="truncate text-xs text-muted-foreground">{a.detail}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ---------------- BLOCO 4: Hubs de navegação ---------------- */

function FacilitiesBanner() {
  return (
    <Link
      to="/buildings"
      preload="intent"
      className="group flex min-h-20 items-center gap-3 overflow-hidden rounded-xl border border-cyan-400/35 bg-gradient-to-r from-slate-950/95 via-cyan-950/80 to-violet-950/90 px-4 py-3 text-white shadow-lg backdrop-blur-md transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/70 hover:shadow-cyan-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 sm:gap-4 sm:px-5"
    >
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-cyan-300/45 bg-cyan-400/10 text-cyan-200 shadow-[0_0_22px_rgba(34,211,238,0.18)] sm:h-14 sm:w-14">
        <Building2 className="h-6 w-6 sm:h-7 sm:w-7" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black uppercase tracking-[0.08em] sm:text-base">Estádio e CT</span>
        <span className="mt-0.5 block text-[10px] leading-snug text-cyan-100/70 sm:text-xs">
          Estádio · Centro de treinamento · CT elemental · Centro médico
        </span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-cyan-200/65 transition-transform group-hover:translate-x-1 group-hover:text-cyan-100" />
    </Link>
  );
}

type HubLink = { to: string; label: string; icon: React.ReactNode; desc: string };

const HUBS: {
  key: string;
  label: string;
  description: string;
  artwork: string;
  icon: React.ReactNode;
  theme: string;
  iconTheme: string;
  links: HubLink[];
}[] = [
  {
    key: "team", label: "Meu time", description: "Gerencie jogadores e suas criaturas", artwork: "/assets/hub-team.webp", icon: <Users className="h-6 w-6" />,
    theme: "border-violet-400/45 from-violet-950/95 via-indigo-950/88 to-slate-950/95 hover:border-violet-300/80 hover:shadow-violet-500/30",
    iconTheme: "bg-violet-500/20 text-violet-200 ring-violet-400/35",
    links: [
      { to: "/roster", label: "Elenco", desc: "Suas criaturas", icon: <Users className="h-4 w-4" /> },
      { to: "/lineup", label: "Escalação", desc: "Formação e táticas", icon: <Swords className="h-4 w-4" /> },
      { to: "/buildings", label: "Construções", desc: "Estádio e centros", icon: <Building2 className="h-4 w-4" /> },
    ],
  },
  {
    key: "market", label: "Mercado", description: "Compre, venda e negocie jogadores", artwork: "/assets/hub-market.webp", icon: <Store className="h-6 w-6" />,
    theme: "border-sky-400/45 from-sky-950/95 via-blue-950/88 to-slate-950/95 hover:border-sky-300/80 hover:shadow-sky-500/30",
    iconTheme: "bg-sky-500/20 text-sky-200 ring-sky-400/35",
    links: [
      { to: "/market", label: "Comprar / Vender", desc: "Mercado de criaturas", icon: <Store className="h-4 w-4" /> },
      { to: "/shop", label: "Loja de gemas", desc: "Pacotes e itens", icon: <ShoppingBag className="h-4 w-4" /> },
      { to: "/club", label: "Clube Mensal", desc: "Tarefas e benefícios", icon: <Gem className="h-4 w-4" /> },
      { to: "/finances", label: "Finanças", desc: "Extrato e caixa", icon: <Wallet className="h-4 w-4" /> },
    ],
  },
  {
    key: "compet", label: "Competições", description: "Campeonato, Liga e Copa", artwork: "/assets/hub-competitions.webp", icon: <Trophy className="h-6 w-6" />,
    theme: "border-emerald-400/45 from-emerald-950/95 via-teal-950/88 to-slate-950/95 hover:border-emerald-300/80 hover:shadow-emerald-500/30",
    iconTheme: "bg-emerald-500/20 text-emerald-200 ring-emerald-400/35",
    links: [
      { to: "/league", label: "Campeonato", desc: "Liga da sua divisão", icon: <Trophy className="h-4 w-4" /> },
      { to: "/cup", label: "Copa da divisão", desc: "Mata-mata regional", icon: <Trophy className="h-4 w-4" /> },
      { to: "/world-league", label: "Liga Mundial", desc: "Melhores do mundo", icon: <Trophy className="h-4 w-4" /> },
      { to: "/world-cup", label: "Copa Mundial", desc: "Campeões de cada divisão", icon: <Trophy className="h-4 w-4" /> },
      { to: "/ranking", label: "Ranking Mundial", desc: "Treinadores globais", icon: <Award className="h-4 w-4" /> },
      { to: "/arena", label: "Arena dos Clubes", desc: "PvP assíncrono · nível 10", icon: <Swords className="h-4 w-4" /> },
    ],
  },
  {
    key: "career", label: "Carreira", description: "Acompanhe seu clube e suas conquistas", artwork: "/assets/hub-career.webp", icon: <Award className="h-6 w-6" />,
    theme: "border-amber-400/50 from-amber-950/95 via-yellow-950/88 to-slate-950/95 hover:border-amber-300/85 hover:shadow-amber-500/30",
    iconTheme: "bg-amber-500/20 text-amber-200 ring-amber-400/35",
    links: [
      { to: "/career", label: "Carreira", desc: "Propostas e histórico", icon: <Award className="h-4 w-4" /> },
    ],
  },
];

function NavigationHubs({ onDestinationIntent }: { onDestinationIntent: (destination: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4">
      {HUBS.map((hub) => (
        <Sheet key={hub.key}>
          <SheetTrigger asChild>
            <button
              type="button"
              className={`group relative min-h-48 overflow-hidden rounded-xl border bg-gradient-to-br p-3 text-left text-white shadow-lg backdrop-blur-md transition duration-200 hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 sm:min-h-52 sm:p-4 md:min-h-48 ${hub.theme}`}
            >
              <img src={hub.artwork} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-105" />
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-transparent" />
              <div className="absolute inset-x-3 bottom-3 pr-7 sm:inset-x-4 sm:bottom-4">
                <span className="block text-sm font-bold sm:text-base">{hub.label}</span>
                <span className="mt-1 block text-[10px] leading-snug text-white/70 sm:text-xs">{hub.description}</span>
              </div>
              <span className="absolute bottom-3 right-3 grid h-6 w-6 place-items-center rounded-full border border-white/25 bg-black/20 text-white/80 transition group-hover:translate-x-0.5 group-hover:border-white/50 group-hover:text-white" aria-hidden="true">
                <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{hub.label}</SheetTitle>
              <SheetDescription>Escolha uma área.</SheetDescription>
            </SheetHeader>
            <div className="mt-4 space-y-2 pb-6">
              {hub.links.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  preload="intent"
                  onPointerEnter={() => onDestinationIntent(l.to)}
                  onFocus={() => onDestinationIntent(l.to)}
                  className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 p-3 transition-colors hover:bg-card/70"
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                    {l.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{l.label}</p>
                    <p className="truncate text-xs text-muted-foreground">{l.desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      ))}
    </div>
  );
}

/* ---------------- Confiança inline (para o Sheet de resumo) ---------------- */

const TONE_STYLES: Record<ConfidenceInfo["tone"], { bar: string; badge: string }> = {
  danger: { bar: "bg-red-500", badge: "bg-red-500/20 text-red-200 border-red-500/40" },
  warn: { bar: "bg-amber-500", badge: "bg-amber-500/20 text-amber-200 border-amber-500/40" },
  neutral: { bar: "bg-muted-foreground", badge: "bg-muted/40 text-muted-foreground border-border" },
  good: { bar: "bg-emerald-500", badge: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40" },
  great: { bar: "bg-primary", badge: "bg-primary/20 text-primary border-primary/40" },
};

function ConfidenceInline({ c }: { c: ConfidenceInfo }) {
  const t = TONE_STYLES[c.tone];
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Confiança da diretoria</p>
        <Badge variant="outline" className={t.badge}>{c.label}</Badge>
      </div>
      <p className="mt-1 text-2xl font-bold">
        {c.score}<span className="text-sm font-normal text-muted-foreground">/100</span>
      </p>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${t.bar} transition-all`} style={{ width: `${c.score}%` }} />
      </div>
      {c.form.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Forma</span>
          <div className="flex gap-1">
            {c.form.map((r, i) => (
              <span
                key={i}
                className={`grid h-5 w-5 place-items-center rounded text-[10px] font-bold ${
                  r === "W" ? "bg-emerald-500/20 text-emerald-200"
                  : r === "L" ? "bg-red-500/20 text-red-200"
                  : "bg-muted/40 text-muted-foreground"
                }`}
              >
                {r === "W" ? "V" : r === "L" ? "D" : "E"}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
