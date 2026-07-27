import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  getBuildings,
  startUpgrade,
  finishNowWithGems,
  getFinancials,
} from "@/lib/buildings.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft,
  Coins,
  Gem,
  Hammer,
  Building2,
  Dumbbell,
  Sparkles,
  Trophy,
  HeartPulse,
  TrendingUp,
  TrendingDown,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/buildings")({
  head: () => ({
    meta: [
      { title: "Construções — Monster Club Manager" },
      {
        name: "description",
        content: "Construa e evolua a infraestrutura da sua academia.",
      },
      { property: "og:title", content: "Construções — Monster Club Manager" },
      {
        property: "og:description",
        content: "Estádio, centro de treinamento, CT elemental e centro médico.",
      },
    ],
  }),
  component: BuildingsPage,
});

const ICONS: Record<string, ReactNode> = {
  ct_treino: <Dumbbell className="h-5 w-5" />,
  ct_elemental: <Sparkles className="h-5 w-5" />,
  estadio: <Trophy className="h-5 w-5" />,
  centro_medico: <HeartPulse className="h-5 w-5" />,
};

function formatMoney(n: number) {
  return `$${n.toLocaleString("pt-BR")}`;
}

function formatDuration(sec: number) {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}min`;
  return `${Math.round(sec / 360) / 10}h`;
}

function Countdown({ target, totalSec }: { target: string; totalSec?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const remaining = Math.max(0, new Date(target).getTime() - now);
  const s = Math.floor(remaining / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pct = totalSec ? Math.max(0, Math.min(100, 100 - (s / totalSec) * 100)) : 0;
  return (
    <div className="space-y-1">
      <p className="font-mono text-xs">
        {h > 0 ? `${h}h ` : ""}
        {m.toString().padStart(2, "0")}m {ss.toString().padStart(2, "0")}s
      </p>
      {totalSec ? <Progress value={pct} className="h-1.5" /> : null}
    </div>
  );
}

function BuildingsPage() {
  const qc = useQueryClient();
  const fetchBuildings = useServerFn(getBuildings);
  const fetchFinancials = useServerFn(getFinancials);
  const startFn = useServerFn(startUpgrade);
  const finishFn = useServerFn(finishNowWithGems);

  const { data, isLoading } = useQuery({
    queryKey: ["buildings"],
    queryFn: () => fetchBuildings(),
    refetchInterval: 15_000,
  });
  const { data: fin } = useQuery({
    queryKey: ["financials"],
    queryFn: () => fetchFinancials(),
  });

  const startMut = useMutation({
    mutationFn: (type: string) => startFn({ data: { type: type as any } }),
    onSuccess: () => {
      toast.success("Obra iniciada");
      qc.invalidateQueries({ queryKey: ["buildings"] });
      qc.invalidateQueries({ queryKey: ["financials"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const finishMut = useMutation({
    mutationFn: (type: string) => finishFn({ data: { type: type as any } }),
    onSuccess: (res) => {
      toast.success(res.spent > 0 ? `Obra concluída (-${res.spent} 💎)` : "Obra concluída");
      qc.invalidateQueries({ queryKey: ["buildings"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-background pb-8">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Button asChild size="icon" variant="ghost">
              <Link to="/dashboard">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-lg font-bold leading-tight">Construções</h1>
              <p className="text-xs text-muted-foreground">Infraestrutura da academia</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-md border bg-card px-2 py-1">
              <Coins className="h-4 w-4 text-amber-400" />
              <span className="text-xs font-semibold">
                {isLoading ? "…" : formatMoney(data?.money ?? 0)}
              </span>
            </div>
            <div className="flex items-center gap-1 rounded-md border bg-card px-2 py-1">
              <Gem className="h-4 w-4 text-fuchsia-400" />
              <span className="text-xs font-semibold">{data?.gems ?? 0}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-4">
        <Card>
          <CardContent className="flex items-center gap-3 py-3 text-sm">
            <Hammer className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Construtores:</span>
            <span className="font-semibold">
              {(data?.builders ?? 1) - (data?.builders_busy ?? 0)}/{data?.builders ?? 1}
            </span>
            {data?.builders_busy ? (
              <Badge variant="outline" className="ml-auto">obra em andamento</Badge>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-3">
          {data?.buildings?.map((b) => {
            const insufficientMoney = (b.nextCost ?? 0) > (data?.money ?? 0);
            const otherBusy = (data?.builders_busy ?? 0) > 0 && !b.upgrading;
            const maxed = b.level >= b.maxLevel;
            const disabled =
              maxed || b.upgrading || otherBusy || insufficientMoney || startMut.isPending;
            return (
              <Card key={b.type}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div className="rounded-md bg-muted p-2">{ICONS[b.type]}</div>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base">{b.name}</CardTitle>
                      <p className="mt-0.5 text-xs text-muted-foreground">{b.description}</p>
                    </div>
                    <Badge variant="secondary">Nv. {b.level}/{b.maxLevel}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <div className="grid grid-cols-5 gap-1">
                    {Array.from({ length: b.maxLevel }).map((_, i) => (
                      <div
                        key={i}
                        className={`h-1.5 rounded-full ${i < b.level ? "bg-primary" : "bg-muted"}`}
                      />
                    ))}
                  </div>

                  <div className="text-xs">
                    <p>
                      <span className="text-muted-foreground">Agora: </span>
                      <span className="font-medium">{b.currentEffect}</span>
                    </p>
                    {b.nextEffect && (
                      <p>
                        <span className="text-muted-foreground">Após obra: </span>
                        <span className="font-medium text-primary">{b.nextEffect}</span>
                      </p>
                    )}
                  </div>

                  {b.upgrading && b.completes_at ? (
                    <div className="rounded-md border bg-muted/40 p-3">
                      <p className="mb-1 text-xs font-semibold">Obra em andamento</p>
                      <RushTimer
                        target={b.completes_at}
                        totalMs={(b.nextDurationSec ?? 0) * 1000}
                      >
                        {({ cost, done }) => (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="mt-1 h-8 w-full"
                            disabled={finishMut.isPending}
                            onClick={() => finishMut.mutate(b.type)}
                          >
                            <Zap className="mr-1 h-3 w-3" />
                            {done ? "Finalizar" : `Concluir agora (${cost} 💎)`}
                          </Button>
                        )}
                      </RushTimer>
                    </div>
                  ) : maxed ? (
                    <p className="text-xs font-medium text-emerald-400">Nível máximo atingido</p>
                  ) : (
                    <div className="flex items-center justify-between gap-2 rounded-md border bg-card p-3">
                      <div className="text-xs">
                        <p className="text-muted-foreground">Próximo nível</p>
                        <p className="font-semibold">
                          {formatMoney(b.nextCost ?? 0)} • {formatDuration(b.nextDurationSec ?? 0)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        disabled={disabled}
                        onClick={() => startMut.mutate(b.type)}
                      >
                        {otherBusy
                          ? "Construtor ocupado"
                          : insufficientMoney
                          ? "Sem $"
                          : "Construir"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Movimentação financeira</CardTitle>
          </CardHeader>
          <CardContent>
            {(!fin?.transactions || fin.transactions.length === 0) ? (
              <p className="py-3 text-center text-xs text-muted-foreground">
                Sem lançamentos ainda. Jogue partidas de liga para receber premiações.
              </p>
            ) : (
              <ul className="space-y-2">
                {fin.transactions.map((t) => {
                  const isIncome = t.transaction_type === "income";
                  return (
                    <li key={t.id} className="flex items-start gap-2 text-xs">
                      {isIncome ? (
                        <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      ) : (
                        <TrendingDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{t.description}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(t.created_at).toLocaleString("pt-BR")}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 font-mono font-semibold ${
                          isIncome ? "text-emerald-300" : "text-red-300"
                        }`}
                      >
                        {isIncome ? "+" : "-"}
                        {formatMoney(t.amount)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
