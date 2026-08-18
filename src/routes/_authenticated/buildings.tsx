import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { toast } from "sonner";
import {
  getBuildings,
  startUpgrade,
  finishNowWithGems,
} from "@/lib/buildings.functions";
import { GameLogo } from "@/components/GameLogo";
import { TeamCrest } from "@/components/TeamCrest";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RushTimer } from "@/components/RushTimer";
import {
  Coins,
  Gem,
  Hammer,
  Dumbbell,
  Trophy,
  HeartPulse,
  Zap,
  ChevronRight,
  Wallet,
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
  estadio: <Trophy className="h-5 w-5" />,
  centro_medico: <HeartPulse className="h-5 w-5" />,
};

const BUILDING_IMAGE_PREFIX: Record<string, string> = {
  ct_treino: "training",
  estadio: "stadium",
  centro_medico: "medical",
};

function buildingImage(type: string, level: number, maxLevel: number) {
  const prefix = BUILDING_IMAGE_PREFIX[type] ?? "training";
  const safeLevel = Math.max(1, Math.min(maxLevel, level || 1));
  return `/assets/buildings/${prefix}-${safeLevel}.webp`;
}

function formatMoney(n: number) {
  return `$${n.toLocaleString("pt-BR")}`;
}

function formatDuration(sec: number) {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}min`;
  return `${Math.round(sec / 360) / 10}h`;
}


function BuildingsPage() {
  const qc = useQueryClient();
  const fetchBuildings = useServerFn(getBuildings);
  const startFn = useServerFn(startUpgrade);
  const finishFn = useServerFn(finishNowWithGems);

  const { data, isLoading } = useQuery({
    queryKey: ["buildings"],
    queryFn: () => fetchBuildings(),
    refetchInterval: 15_000,
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
    <div className="min-h-screen bg-[#020617] pb-24 text-white">
      <div className="fixed inset-0 -z-0 bg-[url('/assets/monster-stadium.webp')] bg-cover bg-center bg-fixed opacity-25" />
      <div className="fixed inset-0 -z-0 bg-gradient-to-b from-[#020617] via-[#020617]/90 to-[#020617]/75" />
      <header className="sticky top-0 z-20 border-b border-violet-500/35 bg-slate-950/90 text-white shadow-[0_4px_24px_rgba(76,29,149,0.28)] backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-3 sm:px-4">
          <GameLogo size="xs" className="shrink-0" />
          <TeamCrest teamName={data?.trainer?.academyName ?? null} size="md" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-slate-400">Academia</p>
            <h1 className="truncate text-base font-bold sm:text-lg">
              {data?.trainer?.academyName ?? "Estádio e CT"}
            </h1>
            <p className="truncate text-[11px] text-slate-400">
              {data?.trainer ? `${data.trainer.name} · Nível ${data.trainer.level}` : "Infraestrutura do seu clube"}
            </p>
            <BuildingTrainerProgress
              level={data?.trainer?.level ?? 0}
              xpIntoLevel={data?.trainer?.xpIntoLevel ?? 0}
              xpForNextLevel={data?.trainer?.xpForNextLevel ?? 1}
              isMaxLevel={data?.trainer?.isMaxLevel ?? false}
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex h-10 items-center gap-2 rounded-lg border border-violet-400/25 bg-slate-900/80 px-3 text-sm font-bold">
              <Gem className="h-4 w-4 fill-violet-400/25 text-violet-300" />
              {(data?.gems ?? 0).toLocaleString("pt-BR")}
            </div>
            <div className="hidden h-10 items-center gap-2 rounded-lg border border-amber-400/25 bg-slate-900/80 px-3 text-sm font-bold sm:flex">
              <Coins className="h-4 w-4 text-amber-400" />
              {(data?.money ?? 0).toLocaleString("pt-BR")}
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-5xl space-y-3 p-2.5 sm:space-y-4 sm:p-4">
        <div className="flex items-end justify-between gap-3 rounded-xl border border-violet-500/25 bg-slate-950/72 px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.2)] backdrop-blur-sm">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-violet-300">Academia</p>
            <h2 className="text-xl font-black text-white sm:text-2xl">Estádio e CT</h2>
            <p className="text-[11px] text-slate-400">Infraestrutura do seu clube</p>
          </div>
          <Link to="/dashboard" className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs font-bold text-slate-200 hover:border-violet-500/60 hover:bg-violet-950/70">
            Voltar ao início
          </Link>
        </div>
        <Card className="border-violet-400/35 bg-gradient-to-r from-slate-950/95 via-violet-950/75 to-slate-950/95 text-white shadow-xl">
          <CardContent className="flex items-center gap-3 py-4 text-sm">
            <span className="grid h-10 w-10 place-items-center rounded-lg border border-violet-400/30 bg-violet-500/10 text-violet-200"><Hammer className="h-5 w-5" /></span>
            <span className="text-slate-300">Construtores disponíveis:</span>
            <span className="font-semibold">
              {(data?.builders ?? 1) - (data?.builders_busy ?? 0)}/{data?.builders ?? 1}
            </span>
            {data?.builders_busy ? (
              <Badge variant="outline" className="ml-auto border-amber-400/40 bg-amber-500/10 text-amber-200">Obra em andamento</Badge>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data?.buildings?.map((b) => {
            const insufficientMoney = (b.nextCost ?? 0) > (data?.money ?? 0);
            const otherBusy = (data?.builders_busy ?? 0) > 0 && !b.upgrading;
            const maxed = b.level >= b.maxLevel;
            const disabled =
              maxed || b.upgrading || otherBusy || insufficientMoney || startMut.isPending;
            return (
              <Card key={b.type} className="overflow-hidden border-violet-400/30 bg-gradient-to-br from-slate-950/95 via-slate-950/92 to-violet-950/75 text-white shadow-xl">
                <div className="relative h-44 overflow-hidden border-b border-violet-400/25 sm:h-52">
                  <img
                    src={buildingImage(b.type, b.level, b.maxLevel)}
                    alt={`${b.name} no nível ${b.level}`}
                    className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.03]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent" />
                  <span className="absolute bottom-3 left-3 rounded-md border border-white/20 bg-slate-950/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white backdrop-blur">
                    Estrutura atual · Nível {b.level}
                  </span>
                </div>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-violet-400/35 bg-violet-500/10 text-violet-200">{ICONS[b.type]}</div>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base">{b.name}</CardTitle>
                      <p className="mt-0.5 text-xs text-slate-400">{b.description}</p>
                    </div>
                    <Badge className="border border-violet-400/35 bg-violet-500/15 text-violet-100">Nv. {b.level}/{b.maxLevel}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <div className="grid grid-cols-5 gap-1">
                    {Array.from({ length: b.maxLevel }).map((_, i) => (
                      <div
                        key={i}
                        className={`h-1.5 rounded-full ${i < b.level ? "bg-gradient-to-r from-violet-500 to-cyan-400" : "bg-slate-800"}`}
                      />
                    ))}
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-950/55 p-3 text-xs">
                    <p>
                      <span className="text-slate-400">Agora: </span>
                      <span className="font-medium">{b.currentEffect}</span>
                    </p>
                    {b.nextEffect && (
                      <p>
                        <span className="text-slate-400">Após obra: </span>
                        <span className="font-medium text-cyan-300">{b.nextEffect}</span>
                      </p>
                    )}
                    <p className="mt-1 text-slate-400">
                      Manutenção: {formatMoney(b.maintenancePerMatch ?? 0)}/partida
                      {typeof b.nextMaintenancePerMatch === "number" &&
                        ` → ${formatMoney(b.nextMaintenancePerMatch)}/partida`}
                    </p>
                    {b.type === "estadio" && typeof b.estimatedSeasonReturn === "number" && (
                      <>
                        <p className="mt-1 text-amber-200">
                          Demanda da sua divisão: até {Number(b.divisionDemandCap ?? 0).toLocaleString("pt-BR")} torcedores por jogo.
                        </p>
                        <p className={b.estimatedSeasonReturn >= 0 ? "text-emerald-400" : "text-red-300"}>
                          Retorno estimado do próximo nível: {b.estimatedSeasonReturn >= 0 ? "+" : ""}
                          {formatMoney(b.estimatedSeasonReturn)}/temporada
                        </p>
                        {(b.nextEffect?.includes("torcedores") && Number(b.divisionDemandCap ?? 0) > 0) && (
                          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                            Um estádio maior não cria torcedores automaticamente. Público, divisão e moral continuam limitando a bilheteria.
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  {b.upgrading && b.completes_at ? (
                    <div className="rounded-lg border border-amber-400/30 bg-amber-500/5 p-3">
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
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-950/70 p-3">
                      <div className="text-xs">
                        <p className="text-slate-400">Próximo nível</p>
                        <p className="font-semibold">
                          {formatMoney(b.nextCost ?? 0)} • {formatDuration(b.nextDurationSec ?? 0)}
                        </p>
                      </div>
                      <Button className="bg-violet-600 text-white hover:bg-violet-500"
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

        <Link
          to="/finances"
          preload="intent"
          className="group flex items-center gap-3 rounded-xl border border-amber-400/30 bg-gradient-to-r from-slate-950/95 via-amber-950/35 to-slate-950/95 p-4 text-white shadow-lg transition hover:-translate-y-0.5 hover:border-amber-300/60"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-amber-400/35 bg-amber-500/10 text-amber-300">
            <Wallet className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">Movimentação financeira</span>
            <span className="block text-xs text-slate-400">Consulte receitas, despesas e o extrato completo na área de Finanças.</span>
          </span>
          <ChevronRight className="h-5 w-5 text-amber-200/70 transition-transform group-hover:translate-x-1" />
        </Link>
      </main>
    </div>
  );
}

function BuildingTrainerProgress({
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
      <div className="h-1.5 overflow-hidden rounded-full border border-violet-400/25 bg-slate-800/90 shadow-inner" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}>
        <div className="h-full rounded-full bg-gradient-to-r from-violet-600 via-fuchsia-500 to-cyan-400 shadow-[0_0_8px_rgba(217,70,239,0.8)] transition-[width] duration-500" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}
