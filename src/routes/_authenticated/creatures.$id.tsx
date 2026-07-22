import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { getCreature, healCreatureWithGems, reduceInjuryWithGems, HEAL_GEMS_PER_MATCH } from "@/lib/creatures.functions";
import { trainCreature, restCreature } from "@/lib/training.functions";
import { spendHalfStar } from "@/lib/progression.functions";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, BatteryCharging, Clock, Coins, Dumbbell, Gem, HeartPulse, Hourglass, Sparkles, Star } from "lucide-react";
import { ageStatus, seasonsRemaining, rebirthHalfStarsPreview, sellValuePreview } from "@/lib/age";
import { moraleState, MORALE_EMOJI, MORALE_LABEL } from "@/lib/morale";


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

  const healFn = useServerFn(healCreatureWithGems);
  const healMut = useMutation({
    mutationFn: () => healFn({ data: { id } }),
    onSuccess: (res) => {
      toast.success(`Cura acelerada! -${res.spent} 💎`);
      qc.invalidateQueries({ queryKey: ["creature", id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao curar"),
  });

  const reduceFn = useServerFn(reduceInjuryWithGems);
  const reduceMut = useMutation({
    mutationFn: () => reduceFn({ data: { id } }),
    onSuccess: (res) => {
      toast.success(`-1 partida de lesão (-${res.spent} 💎)`);
      qc.invalidateQueries({ queryKey: ["creature", id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao reduzir"),
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

  const isGk = (c as any).is_goalkeeper ?? c.suggested_position === "Goleiro";
  const LINE_ATTRS: [string, string][] = [
    ["Defender", "attr_defender"],
    ["Passar", "attr_passar"],
    ["Atacar", "attr_atacar"],
    ["Técnica", "attr_tecnica"],
    ["Força", "attr_forca"],
    ["Pique", "attr_pique"],
  ];
  const GK_ATTRS: [string, string][] = [
    ["Mãos", "attr_maos"],
    ["Concentração", "attr_concentracao"],
    ["Elasticidade", "attr_elasticidade"],
  ];
  const attrs: [string, number][] = (isGk ? GK_ATTRS : LINE_ATTRS).map(
    ([label, col]) => [label, ((c as any)[col] as number) ?? 0],
  );
  const ATTR_KEYS = isGk
    ? (["maos", "concentracao", "elasticidade"] as const)
    : (["defender", "passar", "atacar", "tecnica", "forca", "pique"] as const);
  const ATTR_LABELS: Record<string, string> = {
    defender: "Defender", passar: "Passar", atacar: "Atacar",
    tecnica: "Técnica", forca: "Força", pique: "Pique",
    maos: "Mãos", concentracao: "Concentração", elasticidade: "Elasticidade",
  };

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
        <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-5">
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
          {(() => {
            const s = moraleState((c as any).morale);
            return (
              <StatChip
                label="Moral"
                value={`${MORALE_EMOJI[s]} ${MORALE_LABEL[s]} (${(c as any).morale ?? 50})`}
                icon={<span className="text-base leading-none">{MORALE_EMOJI[s]}</span>}
              />
            );
          })()}
          <StatChip
            label="Valor"
            value={"$ " + c.market_value.toLocaleString("pt-BR")}
            icon={<Coins className="h-4 w-4" />}
          />
        </div>

        {(() => {
          const age = (c as any).age ?? 18;
          const status = ageStatus(age);
          const seasons = seasonsRemaining(age);
          const totalCareer = 5; // 18,21,24,27,30 (aposenta aos 33)
          const filled = Math.min(totalCareer, Math.max(0, Math.floor((age - 18) / 3) + 1));
          const showRetirementPreview = age >= 27;
          const sellNow = sellValuePreview(c.market_value ?? 0);
          const rebirthHs = rebirthHalfStarsPreview(c.half_stars_earned ?? 0);
          const rebirthStars = (rebirthHs / 2).toFixed(1);
          const currentStars = ((c.half_stars_earned ?? 0) / 2).toFixed(1);

          const tone =
            status === "last_season"
              ? "border-orange-500/60 bg-orange-500/5"
              : status === "veteran"
              ? "border-amber-500/40 bg-amber-500/5"
              : "border-border/60";

          return (
            <Card className={tone}>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  Carreira
                  {status === "veteran" && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">
                      <Clock className="h-3 w-3" /> Veterano
                    </span>
                  )}
                  {status === "last_season" && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-orange-500/60 bg-orange-500/15 px-2 py-0.5 text-xs text-orange-200">
                      <Hourglass className="h-3 w-3" /> Última temporada
                    </span>
                  )}
                  {status === "retired" && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-muted bg-muted/30 px-2 py-0.5 text-xs text-muted-foreground">
                      Aposentada
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Idade</span>
                  <span className="font-medium">{age} anos</span>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Progresso da carreira</span>
                    <span>{filled} / {totalCareer} temporadas</span>
                  </div>
                  <div className="flex gap-1">
                    {Array.from({ length: totalCareer }).map((_, i) => {
                      const active = i < filled;
                      const isLast = i === totalCareer - 1;
                      return (
                        <div
                          key={i}
                          className={
                            "h-2 flex-1 rounded-sm " +
                            (active
                              ? isLast && status !== "normal"
                                ? "bg-orange-500"
                                : status === "veteran" && i >= filled - 1
                                ? "bg-amber-500"
                                : "bg-primary"
                              : "bg-muted")
                          }
                        />
                      );
                    })}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {status === "retired"
                      ? "Aposentada — decida vender ou renascer."
                      : status === "last_season"
                      ? "Aposenta no fim desta temporada — hora de decidir."
                      : status === "veteran"
                      ? `Faltam ${seasons} temporadas. Valor de mercado começando a cair.`
                      : `Temporadas restantes: ${seasons}.`}
                  </p>
                </div>

                {showRetirementPreview && (
                  <div className="grid gap-2 rounded-md border border-border/60 bg-card/40 p-3 text-sm sm:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">
                        Se vender agora
                      </p>
                      <p className="mt-0.5 font-semibold">
                        $ {sellNow.toLocaleString("pt-BR")}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        75% do valor de mercado atual.
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">
                        Se renascer ao aposentar
                      </p>
                      <p className="mt-0.5 font-semibold">
                        Volta aos 18 com {rebirthStars}★
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Hoje: {currentStars}★ · mais 5 temporadas de carreira.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })()}

        {((c as any).injury_matches_remaining ?? 0) > 0 && (() => {
          const remaining = (c as any).injury_matches_remaining as number;
          const severity = ((c as any).injury_severity as string) ?? "leve";
          const sevLabel = severity === "grave" ? "GRAVE" : severity === "moderada" ? "Moderada" : "Leve";
          const tone = severity === "grave"
            ? "border-red-500/60 bg-red-500/10"
            : severity === "moderada"
            ? "border-orange-500/60 bg-orange-500/10"
            : "border-yellow-500/60 bg-yellow-500/10";
          const cost = remaining * HEAL_GEMS_PER_MATCH;
          return (
            <Card className={tone}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <HeartPulse className="h-4 w-4" />
                  Lesão {sevLabel}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>
                  Faltam <b>{remaining}</b> {remaining === 1 ? "partida oficial" : "partidas oficiais"} para
                  se recuperar. Não pode ser escalada.
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Acelere a recuperação com gemas ({HEAL_GEMS_PER_MATCH}💎/partida).
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={reduceMut.isPending || remaining <= 1}
                      onClick={() => reduceMut.mutate()}
                    >
                      <Gem className="mr-1 h-3.5 w-3.5" />
                      Reduzir 1 partida ({HEAL_GEMS_PER_MATCH} 💎)
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={healMut.isPending}
                      onClick={() => healMut.mutate()}
                    >
                      <Gem className="mr-1 h-3.5 w-3.5" />
                      Curar agora ({cost} 💎)
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })()}


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
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {ATTR_KEYS.map((k) => (
                    <Button
                      key={k}
                      size="sm"
                      disabled={spendMut.isPending}
                      onClick={() => spendMut.mutate({ kind: "attribute", key: k })}
                    >
                      {ATTR_LABELS[k]}
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
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ATTR_KEYS.map((k) => (
                  <Button
                    key={k}
                    size="sm"
                    variant="secondary"
                    disabled={trainMut.isPending || c.energy < 20}
                    onClick={() => trainMut.mutate({ kind: "attribute", key: k })}
                  >
                    {ATTR_LABELS[k]}
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
  value: React.ReactNode;
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
        <div className="truncate text-sm font-semibold">{value}</div>
      </div>
    </div>
  );
}
