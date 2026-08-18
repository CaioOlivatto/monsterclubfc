import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { getCreature, healCreatureWithGems, reduceInjuryWithGems, HEAL_GEMS_PER_MATCH } from "@/lib/creatures.functions";
import {
  startAttributeTraining,
  rushAttributeTraining,
  cancelAttributeTraining,
  ATTR_TRAINING_DURATION_MS,
  ATTR_TRAINING_XP_COST,
  ATTR_TRAINING_ENERGY_COST,
} from "@/lib/training.functions";
import { getRestState, startRest, rushRest, cancelRest, REST_DURATION_MS, REST_ENERGY_GAIN, REST_POOL_MAX } from "@/lib/rest.functions";
import { spendHalfStar } from "@/lib/progression.functions";
import { retireCreature, rebirthCreature } from "@/lib/lifecycle.functions";
import { attrTrainingDurationMs, formatTrainingDuration } from "@/lib/training-elements";
import {
  startMoraleSession,
  rushMoraleSession,
  cancelMoraleSession,
  MORALE_SESSION_INDIVIDUAL_MS,
  MORALE_SESSION_INDIVIDUAL_BOOST,
} from "@/lib/morale-training.functions";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RushTimer } from "@/components/RushTimer";
import { ArrowLeft, BatteryCharging, Clock, Coins, Dumbbell, Gem, HeartPulse, Hourglass, Sparkles, Star } from "lucide-react";
import { ageStatus, seasonsRemaining, rebirthHalfStarsPreview, sellValuePreview, matchesUntilExhausted } from "@/lib/age";
import { moraleState, MORALE_EMOJI, MORALE_LABEL } from "@/lib/morale";
import { StarRating, halfStarsToStars } from "@/components/StarRating";
import { GameRecovery } from "@/components/GameRecovery";


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
  errorComponent: () => <GameRecovery area="a ficha da criatura" />,
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
  const startAttrFn = useServerFn(startAttributeTraining);
  const rushAttrFn = useServerFn(rushAttributeTraining);
  const cancelAttrFn = useServerFn(cancelAttributeTraining);
  const getRestFn = useServerFn(getRestState);
  const startRestFn = useServerFn(startRest);
  const rushRestFn = useServerFn(rushRest);
  const cancelRestFn = useServerFn(cancelRest);
  const spendFn = useServerFn(spendHalfStar);
  const { data: c, isLoading, error } = useQuery({

    queryKey: ["creature", id],
    queryFn: () => fetchOne({ data: { id } }),
  });

  const { data: restState } = useQuery({
    queryKey: ["rest-state"],
    queryFn: () => getRestFn(),
    refetchInterval: 30_000,
  });

  const trainMut = useMutation({
    mutationFn: (key: string) => startAttrFn({ data: { creatureId: id, key: key as any } }),
    onSuccess: () => {
      toast.success(`Treino iniciado — −${ATTR_TRAINING_XP_COST} XP e −${ATTR_TRAINING_ENERGY_COST} de energia.`);
      qc.invalidateQueries({ queryKey: ["creature", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha no treino"),
  });
  const rushAttrMut = useMutation({
    mutationFn: () => rushAttrFn({ data: { creatureId: id } }),
    onSuccess: (r: any) => {
      toast.success(r?.spent ? `Treino concluído (−${r.spent} 💎).` : "Treino concluído.");
      qc.invalidateQueries({ queryKey: ["creature", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao acelerar"),
  });
  const cancelAttrMut = useMutation({
    mutationFn: () => cancelAttrFn({ data: { creatureId: id } }),
    onSuccess: () => {
      toast.success("Treino cancelado — XP e energia devolvidos.");
      qc.invalidateQueries({ queryKey: ["creature", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao cancelar"),
  });

  const startRestMut = useMutation({
    mutationFn: () => startRestFn({ data: { creatureId: id } }),
    onSuccess: (res: any) => {
      toast.success(res?.paid_cost ? `Descanso iniciado (−${res.paid_cost} 💎).` : "Descanso iniciado.");
      qc.invalidateQueries({ queryKey: ["creature", id] });
      qc.invalidateQueries({ queryKey: ["rest-state"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao descansar"),
  });
  const rushRestMut = useMutation({
    mutationFn: () => rushRestFn({ data: { creatureId: id } }),
    onSuccess: (r: any) => {
      toast.success(r?.spent ? `Descanso concluído (−${r.spent} 💎).` : "Descanso concluído.");
      qc.invalidateQueries({ queryKey: ["creature", id] });
      qc.invalidateQueries({ queryKey: ["rest-state"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao acelerar"),
  });
  const cancelRestMut = useMutation({
    mutationFn: () => cancelRestFn({ data: { creatureId: id } }),
    onSuccess: () => {
      toast.success("Descanso cancelado.");
      qc.invalidateQueries({ queryKey: ["creature", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha"),
  });

  const startMorFn = useServerFn(startMoraleSession);
  const rushMorFn = useServerFn(rushMoraleSession);
  const cancelMorFn = useServerFn(cancelMoraleSession);
  const startMorMut = useMutation({
    mutationFn: () => startMorFn({ data: { creatureId: id } }),
    onSuccess: () => {
      toast.success("Sessão de incentivo iniciada.");
      qc.invalidateQueries({ queryKey: ["creature", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao iniciar sessão"),
  });
  const rushMorMut = useMutation({
    mutationFn: () => rushMorFn({ data: { creatureId: id } }),
    onSuccess: (r: any) => {
      toast.success(r?.spent ? `Sessão acelerada (${r.spent} 💎).` : "Sessão concluída.");
      qc.invalidateQueries({ queryKey: ["creature", id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao acelerar"),
  });
  const cancelMorMut = useMutation({
    mutationFn: () => cancelMorFn({ data: { creatureId: id } }),
    onSuccess: () => {
      toast.success("Sessão cancelada.");
      qc.invalidateQueries({ queryKey: ["creature", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao cancelar"),
  });
  const spendMut = useMutation({
    mutationFn: (focus: { kind: "attribute"; key: any }) =>
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

  const retireFn = useServerFn(retireCreature);
  const retireMut = useMutation({
    mutationFn: () => retireFn({ data: { creature_id: id } }),
    onSuccess: (res) => {
      toast.success(`${res.retired} aposentada — recebeu $${res.payout.toLocaleString("pt-BR")}`);
      qc.invalidateQueries({ queryKey: ["my-creatures"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["my-lineup"] });
      nav({ to: "/roster" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao aposentar"),
  });

  const rebirthFn = useServerFn(rebirthCreature);
  const rebirthMut = useMutation({
    mutationFn: () => rebirthFn({ data: { creature_id: id } }),
    onSuccess: (res) => {
      toast.success(`${res.rebirth} renasceu — ${(res.half_stars / 2).toFixed(1)}★ (OVR ${res.overall})`);
      qc.invalidateQueries({ queryKey: ["creature", id] });
      qc.invalidateQueries({ queryKey: ["my-creatures"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["my-lineup"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao renascer"),
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
          <div className="ml-auto flex items-center gap-1.5">
            {(c as any).is_prodigy ? (
              <Badge className="border-yellow-400/40 bg-yellow-500/15 text-yellow-200" variant="outline">
                <Sparkles className="mr-1 h-3 w-3" /> Prodígio
              </Badge>
            ) : null}
            <Badge
              variant="outline"
              className={ELEMENT_COLORS[c.element] ?? ""}
            >
              {ELEMENT_LABEL[c.element] ?? c.element}
            </Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-5">
          <StatChip label="Overall" value={String(c.overall)} icon={<Star className="h-4 w-4" />} />
          <StatChip
            label="Estrelas"
            value={<StarRating value={halfStarsToStars(c.half_stars_earned ?? 0)} size={0.85} showNumber />}
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
                {age >= 27 && status !== "retired" && (
                  <div className="space-y-1">
                    <p className="text-xs text-amber-500">
                      Veterano — mais propenso a cansaço e lesão.
                    </p>
                    {(() => {
                      const n = matchesUntilExhausted(age, c.energy);
                      if (n === null) {
                        return (
                          <p className="text-xs text-muted-foreground">
                            No ritmo atual, não deve ficar exausto tão cedo.
                          </p>
                        );
                      }
                      if (n === 0) {
                        return (
                          <p className="text-xs text-red-500">
                            Já está exausto — precisa descansar.
                          </p>
                        );
                      }
                      return (
                        <p className="text-xs text-amber-500">
                          No ritmo atual, fica Exausto em aproximadamente {n} {n === 1 ? "rodada" : "rodadas"}.
                        </p>
                      );
                    })()}
                  </div>
                )}

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
                        Se vender {status === "retired" ? "agora" : "ao aposentar"}
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
                        Se renascer {status === "retired" ? "agora" : "ao aposentar"}
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

                {status === "retired" && (
                  <div className="space-y-2 rounded-md border border-orange-500/50 bg-orange-500/5 p-3">
                    <p className="text-sm font-medium text-orange-200">
                      Chegou aos 33 anos — decida agora.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Enquanto não decidir, {c.name} continua ocupando vaga do elenco e não pode ser escalada.
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={retireMut.isPending || rebirthMut.isPending}
                        onClick={() => {
                          if (confirm(`Vender ${c.name} por $${sellNow.toLocaleString("pt-BR")}? A criatura sai do elenco.`)) {
                            retireMut.mutate();
                          }
                        }}
                      >
                        <Coins className="mr-1 h-3.5 w-3.5" />
                        Vender por $ {sellNow.toLocaleString("pt-BR")}
                      </Button>
                      <Button
                        size="sm"
                        disabled={retireMut.isPending || rebirthMut.isPending}
                        onClick={() => {
                          if (confirm(`Renascer ${c.name}? Volta aos 18 anos com ${rebirthStars}★ (hoje: ${currentStars}★).`)) {
                            rebirthMut.mutate();
                          }
                        }}
                      >
                        <Sparkles className="mr-1 h-3.5 w-3.5" />
                        Renascer com {rebirthStars}★
                      </Button>
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
                Escolha onde investir: +5 no atributo escolhido.
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
            <CardTitle className="flex items-center gap-2 text-base">
              <Dumbbell className="h-4 w-4" /> Treinamento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              O treino não gera XP novo: ele <strong>direciona</strong> o XP que a criatura já ganhou jogando.
              Cada sessão consome {ATTR_TRAINING_XP_COST} XP do saldo e {ATTR_TRAINING_ENERGY_COST} de energia,
              leva até 4h (o elemento nativo pode acelerar) e concede +1 ponto no atributo escolhido. O XP gasto sai do saldo e atrasa a próxima meia-estrela.
            </p>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Atributos · saldo de XP: {c.xp ?? 0}
              </p>
              {(() => {
                const trainingKey = (c as any).attr_training_key as string | null;
                const finishAt = (c as any).attr_training_completes_at as string | null;
                if (trainingKey && finishAt) {
                  return (
                    <div className="rounded-md border border-border/60 bg-card/40 p-3">
                      <RushTimer
                        target={finishAt}
                        totalMs={attrTrainingDurationMs(c.element, trainingKey, isGk)}
                        label={`Treinando ${ATTR_LABELS[trainingKey as keyof typeof ATTR_LABELS] ?? trainingKey}`}
                      >
                        {({ cost, done }) => (
                          <div className="flex gap-2 pt-1">
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={rushAttrMut.isPending}
                              onClick={() => rushAttrMut.mutate()}
                            >
                              <Gem className="mr-1 h-3 w-3" />
                              {done ? "Finalizar" : `Concluir agora (${cost} 💎)`}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={cancelAttrMut.isPending}
                              onClick={() => cancelAttrMut.mutate()}
                            >
                              Cancelar
                            </Button>
                          </div>
                        )}
                      </RushTimer>
                    </div>
                  );
                }

                const noXp = (c.xp ?? 0) < ATTR_TRAINING_XP_COST;
                const noEnergy = (c.energy ?? 0) < ATTR_TRAINING_ENERGY_COST;
                return (
                  <div className="space-y-2">
                    {noXp && (
                      <p className="text-xs text-amber-600">
                        XP insuficiente ({c.xp ?? 0}/{ATTR_TRAINING_XP_COST}). Jogue mais partidas para acumular XP.
                      </p>
                    )}
                    {noEnergy && !noXp && (
                      <p className="text-xs text-amber-600">Energia insuficiente — descanse a criatura.</p>
                    )}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {ATTR_KEYS.map((k) => {
                        const ms = attrTrainingDurationMs(c.element, k, isGk);
                        const bonus = ms < ATTR_TRAINING_DURATION_MS;
                        return (
                          <Button
                            key={k}
                            size="sm"
                            variant="secondary"
                            className="h-auto flex-col gap-0.5 py-2"
                            disabled={trainMut.isPending || noXp || noEnergy}
                            onClick={() => trainMut.mutate(k)}
                          >
                            <span>{ATTR_LABELS[k]}</span>
                            <span className="text-[10px] font-normal opacity-80">
                              {formatTrainingDuration(ms)}
                              {bonus ? ` · bônus de ${ELEMENT_LABEL[c.element] ?? c.element}` : ""}
                            </span>
                          </Button>
                        );
                      })}
                    </div>

                  </div>
                );
              })()}
            </div>




            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Sessão de incentivo (gratuita)
              </p>
              {(() => {
                const finishAt = (c as any).morale_session_completes_at as string | null;
                const remainingMs = finishAt ? new Date(finishAt).getTime() - Date.now() : 0;
                const cur = (c as any).morale ?? 50;
                const expectedGain = Math.round(MORALE_SESSION_INDIVIDUAL_BOOST * Math.max(0, 1 - cur / 120));
                if (finishAt && remainingMs > 0) {
                  return (
                    <div className="rounded-md border border-border/60 bg-card/40 p-3">
                      <RushTimer
                        target={finishAt}
                        totalMs={MORALE_SESSION_INDIVIDUAL_MS}
                        label="Sessão de incentivo"
                      >
                        {({ cost }) => (
                          <div className="flex gap-2 pt-1">
                            <Button size="sm" variant="secondary" disabled={rushMorMut.isPending} onClick={() => rushMorMut.mutate()}>
                              <Gem className="mr-1 h-3 w-3" />Concluir agora ({cost} 💎)
                            </Button>
                            <Button size="sm" variant="ghost" disabled={cancelMorMut.isPending} onClick={() => cancelMorMut.mutate()}>
                              Cancelar
                            </Button>
                          </div>
                        )}
                      </RushTimer>
                    </div>
                  );
                }

                return (
                  <div className="space-y-2 rounded-md border border-border/60 bg-card/40 p-3">
                    <p className="text-xs text-muted-foreground">
                      Passa 4h com esta criatura e aplica +{MORALE_SESSION_INDIVIDUAL_BOOST} moral nominal
                      (~+{expectedGain} real, com ganhos decrescentes). Sem custo em dinheiro.
                    </p>
                    <Button size="sm" onClick={() => startMorMut.mutate()} disabled={startMorMut.isPending}>
                      Iniciar sessão de incentivo
                    </Button>
                  </div>
                );
              })()}
            </div>


            {(() => {
              const finishAt = (c as any).rest_completes_at as string | null;
              const remainingMs = finishAt ? new Date(finishAt).getTime() - Date.now() : 0;
              const free = restState?.free_charges ?? REST_POOL_MAX;
              const nextFreeAt = restState?.next_free_at ?? null;
              const nextPaidCost = restState?.next_paid_cost ?? 15;
              const nextFreeMs = nextFreeAt ? Math.max(0, new Date(nextFreeAt).getTime() - Date.now()) : 0;
              const nextFreeH = Math.floor(nextFreeMs / 3_600_000);
              const nextFreeM = Math.floor((nextFreeMs % 3_600_000) / 60_000);
              const isResting = finishAt && remainingMs > 0;
              const atMax = (c.energy ?? 0) >= 100;

              return (
                <div className="space-y-3 rounded-md border border-border/60 bg-card/40 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 text-sm">
                      <p className="font-medium flex items-center gap-2">
                        <BatteryCharging className="h-4 w-4" /> Descansar
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Recupera +{REST_ENERGY_GAIN} de energia após 15 min.
                      </p>
                    </div>
                    <div className="text-right text-xs">
                      <div className="font-medium">Cargas: {free}/{REST_POOL_MAX}</div>
                      {free <= 0 && nextFreeMs > 0 && (
                        <div className="text-muted-foreground">Próxima grátis em {nextFreeH}h{String(nextFreeM).padStart(2, "0")}m</div>
                      )}
                    </div>
                  </div>

                  {isResting && finishAt ? (
                    <RushTimer target={finishAt} totalMs={REST_DURATION_MS} label="Descansando…">
                      {({ cost }) => (
                        <div className="flex gap-2 pt-1">
                          <Button size="sm" variant="secondary" disabled={rushRestMut.isPending} onClick={() => rushRestMut.mutate()}>
                            <Gem className="mr-1 h-3 w-3" />Concluir agora ({cost} 💎)
                          </Button>
                          <Button size="sm" variant="ghost" disabled={cancelRestMut.isPending} onClick={() => cancelRestMut.mutate()}>
                            Cancelar
                          </Button>
                        </div>
                      )}
                    </RushTimer>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => startRestMut.mutate()}
                      disabled={startRestMut.isPending || atMax}
                    >
                      {free > 0
                        ? <>Descansar (grátis · {free} restantes)</>
                        : <><Gem className="mr-1 h-3 w-3" />Descansar ({nextPaidCost} 💎)</>}
                    </Button>
                  )}
                </div>
              );
            })()}
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
