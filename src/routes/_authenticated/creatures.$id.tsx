import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { getCreature } from "@/lib/creatures.functions";
import { trainCreature, restCreature } from "@/lib/training.functions";
import { spendHalfStar } from "@/lib/progression.functions";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, BatteryCharging, Coins, Dumbbell, Sparkles, Star } from "lucide-react";


export const Route = createFileRoute("/_authenticated/creatures/$id")({
  head: () => ({
    meta: [
      { title: "Detalhe da criatura — Monster Club Manager" },
      { name: "description", content: "Ficha completa da sua criatura." },
      { property: "og:title", content: "Detalhe da criatura — Monster Club Manager" },
      { property: "og:description", content: "Ficha completa da sua criatura." },
    ],
  }),
  component: CreatureDetail,
  notFoundComponent: () => (
    <div className="p-8 text-center text-muted-foreground">
      Criatura não encontrada.
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="p-8 text-center text-sm text-destructive">
      Erro: {error.message}
    </div>
  ),
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

function stars(v: number) {
  // 0-100 → 0-5 estrelas (meia-estrela por 10)
  return (Math.round(v / 10) / 2).toFixed(1);
}

function CreatureDetail() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const fetchOne = useServerFn(getCreature);
  const trainFn = useServerFn(trainCreature);
  const restFn = useServerFn(restCreature);
  const spendFn = useServerFn(spendHalfStar);
  const { data: c, isLoading, error } = useQuery({

    queryKey: ["creature", id],
    queryFn: () => fetchOne({ data: { id } }),
  });

  const trainMut = useMutation({
    mutationFn: (focus: { kind: "attribute"; key: any } | { kind: "affinity"; key: any }) =>
      trainFn({ data: { creatureId: id, focus } }),
    onSuccess: (res) => {
      toast.success(res.message);
      qc.invalidateQueries({ queryKey: ["creature", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha no treino"),
  });

  const restMut = useMutation({
    mutationFn: () => restFn({ data: { creatureId: id } }),
    onSuccess: (res) => {
      toast.success(res.message);
      qc.invalidateQueries({ queryKey: ["creature", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao descansar"),
  });

  const spendMut = useMutation({
    mutationFn: (focus: { kind: "attribute"; key: any } | { kind: "affinity"; key: any }) =>
      spendFn({ data: { creatureId: id, focus } }),
    onSuccess: (res) => {
      toast.success(res.message);
      qc.invalidateQueries({ queryKey: ["creature", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao aplicar"),
  });



  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }
  if (error || !c) {
    return (
      <div className="p-8 text-center text-sm text-destructive">
        {error?.message ?? "Não encontrada"}
      </div>
    );
  }

  const attrs: [string, number][] = [
    ["Ataque", c.attack],
    ["Defesa", c.defense],
    ["Goleiro", c.goalkeeper],
    ["Físico", c.physical],
    ["Força", c.strength],
  ];

  const affinities: [string, number, string][] = [
    ["Fogo", c.aff_fogo, "fogo"],
    ["Água", c.aff_agua, "agua"],
    ["Terra", c.aff_terra, "terra"],
    ["Ar", c.aff_ar, "ar"],
    ["Gelo", c.aff_gelo, "gelo"],
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4">
          <Button variant="ghost" size="sm" onClick={() => nav({ to: "/roster" })}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Elenco
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold sm:text-2xl">{c.name}</h1>
            <p className="truncate text-sm text-muted-foreground">
              {c.suggested_position}
            </p>
          </div>
          <Badge
            variant="outline"
            className={"ml-auto " + (ELEMENT_COLORS[c.element] ?? "")}
          >
            {ELEMENT_LABEL[c.element] ?? c.element}
          </Badge>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <StatChip label="Overall" value={String(c.overall)} icon={<Star className="h-4 w-4" />} />
          <StatChip
            label="Estrelas"
            value={`${(c.half_stars_earned / 2).toFixed(1)}★`}
            icon={<Star className="h-4 w-4" />}
          />
          <StatChip
            label="Energia"
            value={`${c.energy}%`}
            icon={<BatteryCharging className="h-4 w-4" />}
          />
          <StatChip
            label="Valor"
            value={"$ " + c.market_value.toLocaleString("pt-BR")}
            icon={<Coins className="h-4 w-4" />}
          />
        </div>

        {(c.pending_half_stars ?? 0) > 0 && (
          <Card className="border-primary/50 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Star className="h-4 w-4 text-primary" />
                {c.pending_half_stars} meia-estrela(s) para aplicar
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Escolha onde investir. +5 no atributo escolhido, ou +1 numa afinidade.
              </p>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Atributo (+5)</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {(["attack", "defense", "goalkeeper", "physical", "strength"] as const).map((k) => (
                    <Button
                      key={k}
                      size="sm"
                      disabled={spendMut.isPending}
                      onClick={() => spendMut.mutate({ kind: "attribute", key: k })}
                    >
                      {({ attack: "Ataque", defense: "Defesa", goalkeeper: "Goleiro", physical: "Físico", strength: "Força" } as const)[k]}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Afinidade (+1)</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {(["fogo", "agua", "terra", "ar", "gelo"] as const).map((k) => (
                    <Button
                      key={k}
                      size="sm"
                      variant="outline"
                      disabled={spendMut.isPending}
                      onClick={() => spendMut.mutate({ kind: "affinity", key: k })}
                    >
                      <Sparkles className="mr-1 h-3 w-3" />
                      {ELEMENT_LABEL[k]}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}


        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Atributos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {attrs.map(([label, v]) => (
              <div key={label}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">
                    {v}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({stars(v)}★)
                    </span>
                  </span>
                </div>
                <Progress value={v} className="h-2" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Afinidades elementais</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {affinities.map(([label, v, key]) => (
              <div key={key}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <Badge variant="outline" className={ELEMENT_COLORS[key] ?? ""}>
                    {label}
                  </Badge>
                  <span className="font-medium">{v}</span>
                </div>
                <Progress value={v} className="h-2" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Dumbbell className="h-4 w-4" /> Treinamento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Cada sessão consome 20 de energia e concede XP. A cada 100 XP em um atributo, +1 ponto (recalcula overall e meia-estrelas). Sessões de afinidade têm chance de +1 no elemento treinado.
            </p>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Atributos</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {(["attack", "defense", "goalkeeper", "physical", "strength"] as const).map((k) => (
                  <Button
                    key={k}
                    size="sm"
                    variant="secondary"
                    disabled={trainMut.isPending || c.energy < 20}
                    onClick={() => trainMut.mutate({ kind: "attribute", key: k })}
                  >
                    {({ attack: "Ataque", defense: "Defesa", goalkeeper: "Goleiro", physical: "Físico", strength: "Força" } as const)[k]}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Afinidades elementais</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {(["fogo", "agua", "terra", "ar", "gelo"] as const).map((k) => (
                  <Button
                    key={k}
                    size="sm"
                    variant="outline"
                    disabled={trainMut.isPending || c.energy < 20}
                    onClick={() => trainMut.mutate({ kind: "affinity", key: k })}
                  >
                    <Sparkles className="mr-1 h-3 w-3" />
                    {ELEMENT_LABEL[k]}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-card/40 p-3">
              <div className="min-w-0 text-sm">
                <p className="font-medium">Descansar</p>
                <p className="text-xs text-muted-foreground">Recupera energia com base no Centro Médico.</p>
              </div>
              <Button size="sm" onClick={() => restMut.mutate()} disabled={restMut.isPending || c.energy >= 100}>
                <BatteryCharging className="mr-2 h-4 w-4" /> Descansar
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Progresso</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              XP acumulado:{" "}
              <span className="font-medium text-foreground">{c.xp}</span>
            </p>
            <p className="text-muted-foreground">
              Meia-estrelas ganhas:{" "}
              <span className="font-medium text-foreground">
                {c.half_stars_earned}
              </span>
            </p>
          </CardContent>
        </Card>

      </main>
    </div>
  );
}

function StatChip({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
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
