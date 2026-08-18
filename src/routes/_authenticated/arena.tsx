import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Clock, Coins, Shield, Swords, Trophy, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  buyArenaScout,
  buyArenaShield,
  getArena,
  playArenaDuel,
  rushArenaRepair,
} from "@/lib/arena.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/arena")({ component: ArenaPage });
type Buff = "none" | "preparation" | "adrenaline" | "wall" | "insurance";
const BUFFS: Array<{ key: Buff; label: string; cost: number; detail: string }> = [
  { key: "none", label: "Sem buff", cost: 0, detail: "Jogue com a força normal" },
  {
    key: "preparation",
    label: "Preparação +3%",
    cost: 20,
    detail: "Mais força, mas causa desgaste no time",
  },
  {
    key: "adrenaline",
    label: "Adrenalina +5%",
    cost: 35,
    detail: "Mais força e risco de lesão elevado para 30%",
  },
  {
    key: "wall",
    label: "Muralha defensiva",
    cost: 25,
    detail: "Melhora a resistência, mas reduz o ataque",
  },
  {
    key: "insurance",
    label: "Seguro do estádio",
    cost: 30,
    detail: "Evita dano se você perder; não aumenta força",
  },
];

function ArenaPage() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"competitive" | "risk">("competitive");
  const [buff, setBuff] = useState<Buff>("none");
  const [scouted, setScouted] = useState<Record<string, number>>({});
  const load = useServerFn(getArena),
    play = useServerFn(playArenaDuel),
    buyShield = useServerFn(buyArenaShield),
    rush = useServerFn(rushArenaRepair),
    scout = useServerFn(buyArenaScout);
  const { data, isLoading } = useQuery({ queryKey: ["arena"], queryFn: () => load() });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["arena"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const duel = useMutation({
    mutationFn: (value: any) =>
      play({ data: { ...value, mode, buff: mode === "competitive" ? "none" : buff } }),
    onSuccess: (result: any) => {
      toast[result.won ? "success" : "error"](
        `${result.won ? "Vitória" : "Derrota"} · ${mode === "competitive" ? "ranking atualizado" : `${result.money_delta >= 0 ? "+" : "−"}$${Math.abs(result.money_delta).toLocaleString("pt-BR")}`} · +${result.trainer_xp} XP`,
      );
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const shield = useMutation({
    mutationFn: (hours: 12 | 24 | 72) => buyShield({ data: { hours } }),
    onSuccess: () => {
      toast.success("Escudo ativado");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const repair = useMutation({
    mutationFn: () => rush(),
    onSuccess: (result) => {
      toast.success(`Reparo concluído por ${result.spent} gemas`);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const scoutMutation = useMutation({
    mutationFn: (opponent: any) =>
      scout({ data: { opponent_id: opponent.id, opponent_kind: opponent.kind } }),
    onSuccess: (result, opponent) => {
      setScouted((value) => ({ ...value, [opponent.kind + opponent.id]: result.chance }));
      toast.success("Relatório do olheiro pronto");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  if (isLoading || !data)
    return <div className="grid min-h-screen place-items-center">Carregando Arena...</div>;
  if (data.locked)
    return (
      <main className="mx-auto max-w-xl p-6">
        <Button asChild variant="ghost">
          <Link to="/dashboard">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Link>
        </Button>
        <Card className="mt-6">
          <CardContent className="py-12 text-center">
            <Swords className="mx-auto h-12 w-12 text-muted-foreground" />
            <h1 className="mt-4 text-2xl font-bold">Arena dos Clubes</h1>
            <p className="mt-2 text-muted-foreground">
              Desbloqueia no nível 10. Você está no nível {data.level}.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  const chosen = BUFFS.find((item) => item.key === buff)!;
  const modeLeft = mode === "competitive" ? data.competitive_left : data.risk_left;
  const modeLimit = mode === "competitive" ? data.competitive_limit : data.risk_limit;
  return (
    <div className="min-h-screen pb-10">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center gap-3 p-4">
          <Button asChild variant="ghost">
            <Link to="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Link>
          </Button>
          <h1 className="text-xl font-bold">Arena dos Clubes</h1>
          <Badge className="ml-auto">
            {modeLeft}/{modeLimit} neste modo
          </Badge>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 p-4">
        {data.club_active && (
          <p className="rounded-md border border-violet-500/30 bg-violet-500/10 p-2 text-center text-xs">
            Clube ativo: 6 Duelos de Risco. O competitivo permanece igual para todos: 3 partidas.
          </p>
        )}
        <Card>
          <CardContent className="grid grid-cols-3 gap-2 py-4 text-center">
            <div>
              <Coins className="mx-auto h-4 w-4" />
              <b>${data.money.toLocaleString("pt-BR")}</b>
            </div>
            <div>
              <Shield className="mx-auto h-4 w-4" />
              <b>{data.profile.stadium_damage_pct}% dano</b>
            </div>
            <div>
              <Clock className="mx-auto h-4 w-4" />
              <b>8h por janela</b>
            </div>
          </CardContent>
        </Card>
        {data.profile.stadium_damage_pct > 0 && (
          <Button
            className="w-full"
            variant="secondary"
            disabled={repair.isPending || data.gems < data.repair_cost}
            onClick={() => repair.mutate()}
          >
            Concluir reparo · {data.repair_cost} gemas{" "}
            {data.repair_discount ? `(Clube −${data.repair_discount}%)` : ""}
          </Button>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            className={`rounded-lg border p-4 text-left ${mode === "competitive" ? "border-cyan-500 bg-cyan-500/10" : ""}`}
            onClick={() => setMode("competitive")}
          >
            <b>Arena Competitiva · {data.competitive_left}/3</b>
            <p className="mt-1 text-xs text-muted-foreground">
              Sem buffs, apostas ou dano. Pareamento justo e ranking oficial.
            </p>
          </button>
          <button
            className={`rounded-lg border p-4 text-left ${mode === "risk" ? "border-amber-500 bg-amber-500/10" : ""}`}
            onClick={() => setMode("risk")}
          >
            <b>
              Duelo de Risco · {data.risk_left}/{data.risk_limit}
            </b>
            <p className="mt-1 text-xs text-muted-foreground">
              Buffs, dinheiro, lesões e estádio. Não altera o ranking.
            </p>
          </button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Trophy className="h-4 w-4" />
                Temporada competitiva
              </span>
              <Badge variant="secondary">{data.profile.arena_title ?? "Desafiante"}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-2 text-center text-sm">
            <div>
              <b>{data.profile.arena_rating ?? 1000}</b>
              <p className="text-xs text-muted-foreground">rating</p>
            </div>
            <div>
              <b>{data.profile.season_wins ?? 0}</b>
              <p className="text-xs text-muted-foreground">vitórias</p>
            </div>
            <div>
              <b>{data.profile.season_duels ?? 0}</b>
              <p className="text-xs text-muted-foreground">duelos</p>
            </div>
          </CardContent>
        </Card>
        {mode === "risk" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Preparação da batalha
                </span>
                <Badge variant="outline">{data.strength_buffs_left}/3 buffs de força</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <select
                className="w-full rounded-md border bg-background p-2"
                value={buff}
                onChange={(event) => setBuff(event.target.value as Buff)}
              >
                {BUFFS.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}{" "}
                    {item.key === "preparation" && data.preparation_credits > 0
                      ? `· crédito grátis (${data.preparation_credits})`
                      : item.key === "insurance" && data.insurance_credits > 0
                        ? `· crédito grátis (${data.insurance_credits})`
                        : item.cost
                          ? `· ${item.cost} gemas`
                          : ""}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-muted-foreground">
                {chosen.detail}. O prêmio considera a força efetiva após o buff.
              </p>
            </CardContent>
          </Card>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={shield.isPending}
            onClick={() => shield.mutate(12)}
          >
            Escudo 12h ·{" "}
            {data.shield_credits > 0 ? `usar crédito (${data.shield_credits})` : "30💎"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={shield.isPending}
            onClick={() => shield.mutate(24)}
          >
            24h · 50💎
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={shield.isPending}
            onClick={() => shield.mutate(72)}
          >
            72h · 120💎
          </Button>
        </div>
        <div className="grid gap-3">
          {data.opponents.map((opponent: any) => {
            const key = opponent.kind + opponent.id;
            return (
              <Card key={key}>
                <CardHeader>
                  <CardTitle className="flex justify-between text-base">
                    <span>
                      {opponent.name} · {opponent.academy}
                    </span>
                    <Badge variant="outline">Força {opponent.power}</Badge>
                  </CardTitle>
                  {scouted[key] ? (
                    <p className="text-xs text-cyan-500">Chance estimada: {scouted[key]}%</p>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={
                        scoutMutation.isPending || (data.scout_credits < 1 && data.gems < 10)
                      }
                      onClick={() => scoutMutation.mutate(opponent)}
                    >
                      Contratar olheiro ·{" "}
                      {data.scout_credits > 0 ? `usar crédito (${data.scout_credits})` : "10💎"}
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  <Button
                    className="w-full"
                    variant={mode === "risk" ? "destructive" : "default"}
                    disabled={
                      duel.isPending || modeLeft < 1 || (mode === "risk" && data.money < 20000)
                    }
                    onClick={() =>
                      duel.mutate({
                        opponent_id: opponent.id,
                        opponent_kind: opponent.kind,
                        wager: mode === "risk" ? 20000 : 1,
                      })
                    }
                  >
                    {mode === "competitive"
                      ? "Disputar ranking · sem custo"
                      : "Duelo de Risco · $20.000"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
        {data.history.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Histórico transparente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.history.map((entry: any) => (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-xs"
                >
                  <Badge variant={entry.mode === "competitive" ? "default" : "destructive"}>
                    {entry.mode === "competitive" ? "Competitiva" : "Risco"}
                  </Badge>
                  <span>Buff: {entry.buff_key === "none" ? "nenhum" : entry.buff_key}</span>
                  <span>
                    Força: {entry.attacker_power}
                    {entry.effective_attacker_power &&
                    Number(entry.effective_attacker_power) !== entry.attacker_power
                      ? ` → ${Math.round(entry.effective_attacker_power)}`
                      : ""}
                  </span>
                  <span>XP: +{entry.trainer_xp_awarded}</span>
                  {entry.mode === "competitive" && (
                    <b className={entry.rating_delta >= 0 ? "text-emerald-500" : "text-red-500"}>
                      {entry.rating_delta >= 0 ? "+" : ""}
                      {entry.rating_delta} rating
                    </b>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        {data.season_leaders.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top 10 competitivo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.season_leaders.map((entry: any, index: number) => (
                <div
                  key={entry.trainer_id}
                  className="flex items-center gap-3 rounded-md border p-2 text-sm"
                >
                  <b className="w-6">#{index + 1}</b>
                  <span className="min-w-0 flex-1 truncate">
                    {entry.trainers?.trainer_name} · {entry.trainers?.academy_name}
                  </span>
                  <Badge variant="outline">{entry.arena_rating}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
