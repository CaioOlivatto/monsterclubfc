import * as React from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getDashboard, listMyCreatures } from "@/lib/creatures.functions";
import { createFriendlyMatch } from "@/lib/match.functions";
import { claimWeeklyGems } from "@/lib/progression.functions";
import { getMyLineup } from "@/lib/lineup.functions";
import { getConfidence, type ConfidenceInfo } from "@/lib/career.functions";
import { startLeague } from "@/lib/league.functions";
import { ageStatus } from "@/lib/age";
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
  const fetchDashboard = useServerFn(getDashboard);
  const startFriendly = useServerFn(createFriendlyMatch);
  const fetchRoster = useServerFn(listMyCreatures);
  const fetchLineup = useServerFn(getMyLineup);
  const fetchConfidence = useServerFn(getConfidence);
  const claimWeekly = useServerFn(claimWeeklyGems);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchDashboard() });
  const { data: rosterList } = useQuery({ queryKey: ["my-creatures"], queryFn: () => fetchRoster() });
  const { data: lineupData } = useQuery({ queryKey: ["my-lineup"], queryFn: () => fetchLineup() });
  const { data: confidence } = useQuery<ConfidenceInfo>({ queryKey: ["confidence"], queryFn: () => fetchConfidence() });

  const retiredCount = (rosterList ?? []).filter((c: any) => ageStatus(c.age) === "retired").length;
  const lastSeasonCount = (rosterList ?? []).filter((c: any) => ageStatus(c.age) === "last_season").length;
  const injuredCount = (rosterList ?? []).filter((c: any) => (c.injury_matches_remaining ?? 0) > 0).length;
  const lowMoraleCount = (rosterList ?? []).filter((c: any) => (c.morale ?? 50) < 40).length;
  const tiredStarters = React.useMemo(() => {
    const starters: any[] = (lineupData as any)?.lineup?.starters ?? [];
    const creatures: any[] = (lineupData as any)?.creatures ?? [];
    const byId = new Map(creatures.map((c) => [c.id, c]));
    return starters
      .map((s: any) => byId.get(s.creature_id))
      .filter((c: any) => c && (c.energy ?? 100) < 50).length;
  }, [lineupData]);

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

  const notifiedRef = React.useRef(false);
  React.useEffect(() => {
    const pending = (data as any)?.trainer?.pendingLevelUps ?? 0;
    if (pending > 0 && !notifiedRef.current) {
      notifiedRef.current = true;
      const level = (data as any).trainer.level;
      toast.success(pending === 1 ? `⭐ Nível ${level} alcançado!` : `⭐ ${pending} níveis! Agora é nível ${level}.`);
    }
  }, [data]);

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
  const weeklyMut = useMutation({
    mutationFn: () => claimWeekly(),
    onSuccess: (res: any) => {
      if (res.claimed) toast.success("+30 💎 recompensa semanal!");
      else toast.info("Próxima recompensa em " + new Date(res.nextAt).toLocaleDateString("pt-BR"));
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao resgatar."),
  });

  async function signOut() {
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  }

  if (isLoading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Carregando painel...
      </div>
    );
  }

  const { trainer, academy, roster, standing, nextMatch, hasLeague } = data;

  return (
    <div className="min-h-screen bg-background">
      <RetirementDialog creatures={rosterList as any} />
      {/* Header slim: identidade + ações no canto */}
      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-3 sm:px-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Academia</p>
            <h1 className="truncate text-base font-bold sm:text-lg">
              {academy ? trainer.academy_name : trainer.trainer_name}
            </h1>
            <p className="truncate text-[11px] text-muted-foreground">
              {trainer.trainer_name} · Nível {trainer.level}
            </p>
          </div>

          <AlertsBell alerts={alerts} />

          <Link
            to="/messages"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border/60 text-muted-foreground hover:text-foreground"
            aria-label="Mensagens"
          >
            <Inbox className="h-4 w-4" />
          </Link>

          <Button
            variant="outline"
            size="sm"
            className="h-9 shrink-0 px-2"
            onClick={() => weeklyMut.mutate()}
            disabled={weeklyMut.isPending}
            aria-label="Recompensa semanal"
          >
            <Gem className="h-4 w-4" />
          </Button>

          <Button variant="ghost" size="sm" className="h-9 shrink-0 px-2" onClick={signOut} aria-label="Sair">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-4 px-3 py-4 sm:px-4">
        {/* BLOCO 1 — Ação principal */}
        <NextMatchHero
          nextMatch={nextMatch}
          hasLeague={hasLeague}
          onPlay={() => nav({ to: "/lineup" })}
          onStartSeason={() => startSeasonMut.mutate()}
          startSeasonPending={startSeasonMut.isPending}
          onFriendly={() => friendlyMut.mutate()}
          friendlyPending={friendlyMut.isPending}
        />

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
        <NavigationHubs />
      </main>
    </div>
  );
}

/* ---------------- BLOCO 1: Hero ---------------- */

function NextMatchHero({
  nextMatch,
  hasLeague,
  onPlay,
  onStartSeason,
  startSeasonPending,
  onFriendly,
  friendlyPending,
}: {
  nextMatch: any;
  hasLeague: boolean;
  onPlay: () => void;
  onStartSeason: () => void;
  startSeasonPending: boolean;
  onFriendly: () => void;
  friendlyPending: boolean;
}) {
  const hasMatch = !!nextMatch;
  const seasonNotStarted = !hasMatch && !hasLeague;
  const seasonIdle = !hasMatch && hasLeague; // temporada ativa, sem partida pendente

  return (
    <Card className="border-primary/40 bg-gradient-to-br from-primary/10 via-card to-card">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary sm:h-14 sm:w-14">
            <Shield className="h-6 w-6 sm:h-7 sm:w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-primary">
              {hasMatch
                ? `Rodada ${nextMatch.round} · ${nextMatch.competitionLabel ?? "Campeonato"}${nextMatch.phaseLabel ? ` · ${nextMatch.phaseLabel}` : ""}`
                : "Campeonato"}
            </p>
            {hasMatch ? (
              <>
                <h2 className="mt-0.5 truncate text-lg font-bold sm:text-xl">
                  {nextMatch.home_team} <span className="text-muted-foreground">vs</span> {nextMatch.away_team}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
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
                <h2 className="mt-0.5 text-base font-semibold">Rodada concluída</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Nada pendente no momento — próxima rodada em breve.
                </p>
              </>
            )}
          </div>
        </div>

        {hasMatch ? (
          <Button
            size="lg"
            className="h-12 w-full text-base font-semibold"
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
        ) : (
          <Button asChild size="lg" variant="secondary" className="h-12 w-full">
            <Link to="/league">
              <Trophy className="mr-2 h-5 w-5" />
              Ver classificação
            </Link>
          </Button>
        )}

        {(hasMatch || seasonIdle) && (
          <div className="text-center">
            <button
              type="button"
              onClick={onFriendly}
              disabled={friendlyPending}
              className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
            >
              {friendlyPending ? "iniciando amistoso..." : "ou jogar um amistoso de treino"}
            </button>
          </div>
        )}
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
          className="grid w-full grid-cols-4 items-center gap-2 rounded-xl border border-border/60 bg-card/40 px-3 py-3 text-left transition-colors hover:bg-card/70"
        >
          <StripCell icon={<Coins className="h-3.5 w-3.5" />} value={fmtMoney(money)} label="caixa" />
          <StripCell icon={<Gem className="h-3.5 w-3.5" />} value={String(gems)} label="gemas" />
          <StripCell icon={<BatteryCharging className="h-3.5 w-3.5" />} value={`${avgEnergy}%`} label="energia" />
          <StripCell
            icon={<Award className="h-3.5 w-3.5" />}
            value={confidence?.label ?? "—"}
            label="confiança"
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

function StripCell({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-muted-foreground">
        {icon}
        <span className="text-[9px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-0.5 truncate text-sm font-bold">{value}</p>
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

type HubLink = { to: string; label: string; icon: React.ReactNode; desc: string };

const HUBS: { key: string; label: string; icon: React.ReactNode; links: HubLink[] }[] = [
  {
    key: "team", label: "Meu time", icon: <Users className="h-6 w-6" />,
    links: [
      { to: "/roster", label: "Elenco", desc: "Suas criaturas", icon: <Users className="h-4 w-4" /> },
      { to: "/lineup", label: "Escalação", desc: "Formação e táticas", icon: <Swords className="h-4 w-4" /> },
      { to: "/buildings", label: "Construções", desc: "Estádio e centros", icon: <Building2 className="h-4 w-4" /> },
    ],
  },
  {
    key: "market", label: "Mercado", icon: <Store className="h-6 w-6" />,
    links: [
      { to: "/market", label: "Comprar / Vender", desc: "Mercado de criaturas", icon: <Store className="h-4 w-4" /> },
      { to: "/shop", label: "Loja de gemas", desc: "Pacotes e itens", icon: <ShoppingBag className="h-4 w-4" /> },
      { to: "/finances", label: "Finanças", desc: "Extrato e caixa", icon: <Wallet className="h-4 w-4" /> },
    ],
  },
  {
    key: "compet", label: "Competições", icon: <Trophy className="h-6 w-6" />,
    links: [
      { to: "/league", label: "Campeonato", desc: "Liga da sua divisão", icon: <Trophy className="h-4 w-4" /> },
      { to: "/cup", label: "Copa da divisão", desc: "Mata-mata regional", icon: <Trophy className="h-4 w-4" /> },
      { to: "/world-league", label: "Liga Mundial", desc: "Melhores do mundo", icon: <Trophy className="h-4 w-4" /> },
      { to: "/world-cup", label: "Copa Mundial", desc: "Campeões de cada divisão", icon: <Trophy className="h-4 w-4" /> },
      { to: "/ranking", label: "Ranking Mundial", desc: "Treinadores globais", icon: <Award className="h-4 w-4" /> },
    ],
  },
  {
    key: "career", label: "Carreira", icon: <Award className="h-6 w-6" />,
    links: [
      { to: "/career", label: "Carreira", desc: "Propostas e histórico", icon: <Award className="h-4 w-4" /> },
    ],
  },
];

function NavigationHubs() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {HUBS.map((hub) => (
        <Sheet key={hub.key}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-border/60 bg-card/40 p-3 text-sm font-medium transition-colors hover:bg-card/70 hover:text-primary"
            >
              <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
                {hub.icon}
              </div>
              <span>{hub.label}</span>
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
