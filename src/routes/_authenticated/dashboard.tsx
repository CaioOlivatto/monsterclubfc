import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getDashboard } from "@/lib/creatures.functions";
import { createFriendlyMatch } from "@/lib/match.functions";
import { claimWeeklyGems } from "@/lib/progression.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Coins,
  Gem,
  Hammer,
  Users,
  BatteryCharging,
  Star,
  Trophy,
  CalendarClock,
  LogOut,
  Swords,
  Store,
  Building2,
  ShoppingBag,
  Inbox,
  Wallet,
} from "lucide-react";


export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Futebol de Criaturas" },
      {
        name: "description",
        content: "Painel da sua academia de criaturas: recursos, elenco, liga e próxima partida.",
      },
      { property: "og:title", content: "Dashboard — Futebol de Criaturas" },
      {
        property: "og:description",
        content: "Gerencie sua academia de criaturas.",
      },
    ],
  }),
  component: Dashboard,
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

function fmtMoney(v: number) {
  return "$ " + v.toLocaleString("pt-BR");
}

function Dashboard() {
  const nav = useNavigate();
  const fetchDashboard = useServerFn(getDashboard);
  const startFriendly = useServerFn(createFriendlyMatch);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchDashboard(),
  });

  const friendlyMut = useMutation({
    mutationFn: () => startFriendly(),
    onSuccess: (res) => nav({ to: "/match/$id", params: { id: res.match_id } }),
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível iniciar a partida."),
  });

  const claimWeekly = useServerFn(claimWeeklyGems);
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
      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-4 sm:flex sm:flex-wrap sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Academia
            </p>
            <h1 className="truncate text-xl font-bold sm:text-2xl">
              {academy ? trainer.academy_name : trainer.trainer_name}
            </h1>
            <p className="truncate text-sm text-muted-foreground">
              Treinador: {trainer.trainer_name} · Nível {trainer.level}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut} className="shrink-0">
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </Button>
        </div>

        {academy && (
          <div className="mx-auto grid max-w-6xl grid-cols-3 gap-2 px-4 pb-4 sm:gap-4">
            <ResourceChip
              icon={<Coins className="h-4 w-4" />}
              label="Moedas"
              value={fmtMoney(academy.money)}
            />
            <ResourceChip
              icon={<Gem className="h-4 w-4" />}
              label="Gemas"
              value={String(academy.gems)}
            />
            <ResourceChip
              icon={<Hammer className="h-4 w-4" />}
              label="Construtores"
              value={String(academy.builders)}
            />
          </div>
        )}
      </header>

      <main className="mx-auto max-w-6xl space-y-4 p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Próxima partida
              </CardTitle>
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {nextMatch ? (
                <div>
                  <p className="text-xs text-muted-foreground">
                    Rodada {nextMatch.round}
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {nextMatch.home_team}{" "}
                    <span className="text-muted-foreground">vs</span>{" "}
                    {nextMatch.away_team}
                  </p>
                  <Badge variant="secondary" className="mt-2">
                    {nextMatch.is_home ? "Em casa" : "Fora"}
                  </Badge>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-muted-foreground">
                    {hasLeague
                      ? "Sem partidas agendadas no momento."
                      : "Liga ainda não iniciada. Ela começará em breve."}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Classificação
              </CardTitle>
              <Trophy className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {standing ? (
                <div>
                  <p className="text-2xl font-bold">
                    {standing.position}º
                    <span className="ml-1 text-sm font-normal text-muted-foreground">
                      / {standing.total}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {standing.points} pts · {standing.wins}V {standing.draws}E{" "}
                    {standing.losses}D · {standing.goals_for}-
                    {standing.goals_against}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Sem classificação ainda.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Elenco
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {roster.count}
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  / {academy?.roster_slots ?? "?"}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">criaturas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Energia média
              </CardTitle>
              <BatteryCharging className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{roster.avgEnergy}%</p>
              <Progress value={roster.avgEnergy} className="mt-2 h-2" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Overall médio
              </CardTitle>
              <Star className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{roster.avgOverall}</p>
              <p className="text-xs text-muted-foreground">escala 0-100</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Destaques do elenco</CardTitle>
          </CardHeader>
          <CardContent>
            {roster.top.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sem criaturas ainda.
              </p>
            ) : (
              <ul className="space-y-2">
                {roster.top.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between rounded-md border border-border/50 bg-card/30 px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Badge
                        variant="outline"
                        className={ELEMENT_COLORS[c.element] ?? ""}
                      >
                        {ELEMENT_LABEL[c.element] ?? c.element}
                      </Badge>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{c.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.suggested_position}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-lg font-bold">{c.overall}</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        overall
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Shortcut icon={<Users className="h-5 w-5" />} label="Elenco" to="/roster" />
          <Shortcut icon={<Swords className="h-5 w-5" />} label="Escalação" to="/lineup" />
          <Shortcut icon={<Store className="h-5 w-5" />} label="Mercado" to="/market" />
          <Shortcut icon={<Building2 className="h-5 w-5" />} label="Construções" to="/buildings" />
          <Shortcut icon={<Trophy className="h-5 w-5" />} label="Liga" to="/league" />
          <Shortcut icon={<Trophy className="h-5 w-5" />} label="Copa" to="/cup" />
          <Shortcut icon={<ShoppingBag className="h-5 w-5" />} label="Loja" to="/shop" />
          <Shortcut icon={<Wallet className="h-5 w-5" />} label="Finanças" to="/finances" />
          <Shortcut icon={<Inbox className="h-5 w-5" />} label="Mensagens" to="/messages" />
        </div>


        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-5 sm:flex-row sm:justify-between">
            <div className="text-center sm:text-left">
              <p className="text-sm font-semibold">Pronto para jogar?</p>
              <p className="text-xs text-muted-foreground">
                Dispute uma partida amistosa contra um adversário aleatório usando sua escalação atual.
              </p>
            </div>
            <Button
              onClick={() => friendlyMut.mutate()}
              disabled={friendlyMut.isPending}
            >
              <Swords className="mr-2 h-4 w-4" />
              {friendlyMut.isPending ? "Iniciando..." : "Jogar amistoso"}
            </Button>
          </CardContent>
        </Card>

        <p className="pt-2 text-center text-xs text-muted-foreground">
          Mercado, liga e construções chegam nas próximas etapas.
        </p>
      </main>
    </div>
  );
}

function ResourceChip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/50 px-3 py-2">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}

function Shortcut({
  icon,
  label,
  to,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  to?: string;
  disabled?: boolean;
}) {
  const inner = (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-border/60 bg-card/40 p-4 text-sm transition-colors ${
        disabled
          ? "cursor-not-allowed opacity-50"
          : "hover:bg-card/70 hover:text-primary"
      }`}
    >
      {icon}
      <span>{label}</span>
      {disabled && (
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          em breve
        </span>
      )}
    </div>
  );
  if (disabled || !to) return inner;
  return <Link to={to}>{inner}</Link>;
}
