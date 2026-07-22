import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { getMyLineup, saveLineup } from "@/lib/lineup.functions";
import { getLineupPrognostic } from "@/lib/odds.functions";
import { PrognosticCard } from "@/components/PrognosticCard";
import { buildSlots, FORMATIONS, MAX_BENCH, type Formation, type SlotRole } from "@/lib/lineup.server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ArrowLeft, Save, Shield, Swords, Scale, Wand2, AlertTriangle, HeartPulse, BedDouble } from "lucide-react";
import { fatigueState, FATIGUE_LABEL, FATIGUE_CLASS, effectiveOverall, energyMultiplier } from "@/lib/fatigue";


export const Route = createFileRoute("/_authenticated/lineup")({
  head: () => ({
    meta: [
      { title: "Escalação — Monster Club Manager" },
      {
        name: "description",
        content: "Monte a formação e estratégia do seu time de criaturas.",
      },
      { property: "og:title", content: "Escalação — Monster Club Manager" },
      {
        property: "og:description",
        content: "Escolha formação, titulares e reservas.",
      },
    ],
  }),
  component: LineupPage,
});

const ELEMENT_LABEL: Record<string, string> = {
  fogo: "Fogo",
  agua: "Água",
  terra: "Terra",
  ar: "Ar",
  gelo: "Gelo",
};

const ROLE_HINT: Record<SlotRole, string[]> = {
  GOL: ["Goleiro"],
  DEF: ["Zagueiro"],
  MEI: ["Meio-campo"],
  ATA: ["Atacante"],
};

interface StarterSlot {
  slot: number;
  role: SlotRole;
  creature_id: string | null;
}

function LineupPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchLineup = useServerFn(getMyLineup);
  const save = useServerFn(saveLineup);
  const fetchProg = useServerFn(getLineupPrognostic);

  const { data, isLoading } = useQuery({
    queryKey: ["lineup"],
    queryFn: () => fetchLineup(),
  });

  const [formation, setFormation] = useState<Formation>("4-4-2");
  const [strategy, setStrategy] = useState<"ofensiva" | "equilibrada" | "defensiva">("equilibrada");
  const [starters, setStarters] = useState<StarterSlot[]>([]);
  const [bench, setBench] = useState<string[]>([]);

  // Draft enviado ao servidor para recalcular odds ao vivo (sem precisar salvar).
  const draft = useMemo(() => ({
    formation, strategy, starters, bench,
  }), [formation, strategy, starters, bench]);

  const prog = useQuery({
    queryKey: ["prognostic", draft],
    queryFn: () => fetchProg({ data: { draft } }),
    retry: false,
    enabled: !!data && starters.filter((s) => s.creature_id).length === 11,
  });

  const slots = useMemo(() => buildSlots(formation), [formation]);


  // Sincroniza estado quando dados carregam
  useEffect(() => {
    if (!data) return;
    const savedFormation = (data.lineup.formation as Formation) ?? "4-4-2";
    setFormation(savedFormation);
    setStrategy((data.lineup.strategy as any) ?? "equilibrada");
    const savedStarters = Array.isArray(data.lineup.starters)
      ? (data.lineup.starters as unknown as StarterSlot[])
      : [];
    const newSlots = buildSlots(savedFormation);
    setStarters(
      newSlots.map((s) => {
        const found = savedStarters.find((x) => x.slot === s.index);
        return { slot: s.index, role: s.role, creature_id: found?.creature_id ?? null };
      }),
    );
    setBench(Array.isArray(data.lineup.bench) ? (data.lineup.bench as unknown as string[]) : []);
  }, [data]);

  // Se o usuário mudar a formação depois, refaz os slots preservando IDs por índice quando possível
  useEffect(() => {
    setStarters((prev) => {
      const map = new Map(prev.map((p) => [p.slot, p.creature_id]));
      return slots.map((s) => ({ slot: s.index, role: s.role, creature_id: map.get(s.index) ?? null }));
    });
  }, [slots]);

  const allCreatures = data?.creatures ?? [];
  const creatures = allCreatures.filter((c: any) => (c.injury_matches_remaining ?? 0) === 0);
  const injuredList = allCreatures.filter((c: any) => (c.injury_matches_remaining ?? 0) > 0);
  const usedIds = new Set<string>([
    ...starters.map((s) => s.creature_id).filter(Boolean) as string[],
    ...bench,
  ]);

  const availableFor = (currentId: string | null) =>
    creatures.filter((c: any) => c.id === currentId || !usedIds.has(c.id));

  const setSlotCreature = (slotIdx: number, creatureId: string | null) => {
    setStarters((prev) =>
      prev.map((s) => (s.slot === slotIdx ? { ...s, creature_id: creatureId } : s)),
    );
  };

  const addToBench = (id: string) => {
    if (bench.length >= MAX_BENCH) return;
    setBench((b) => [...b, id]);
  };
  const removeFromBench = (id: string) => setBench((b) => b.filter((x) => x !== id));

  const buildAuto = (mode: "best" | "rested") => {
    // best: prioriza OVERALL EFETIVO (fadiga aplicada) — bom p/ desempenho médio.
    // rested: prioriza ENERGIA (>=70) e usa efetivo como desempate — bom p/ preservar elenco.
    const pool = [...creatures].sort((a, b) => {
      const ea = a.energy ?? 100, eb = b.energy ?? 100;
      if (mode === "rested") {
        if (eb !== ea) return eb - ea;
        return effectiveOverall(b.overall, eb) - effectiveOverall(a.overall, ea);
      }
      return (
        effectiveOverall(b.overall, eb) - effectiveOverall(a.overall, ea) ||
        eb - ea
      );
    });

    const used = new Set<string>();
    const newStarters: StarterSlot[] = slots.map((s) => ({ slot: s.index, role: s.role, creature_id: null }));

    for (const s of newStarters) {
      const hint = ROLE_HINT[s.role];
      const pick = pool.find((c) => !used.has(c.id) && hint.includes(c.suggested_position ?? ""));
      if (pick) { s.creature_id = pick.id; used.add(pick.id); }
    }
    for (const s of newStarters) {
      if (s.creature_id) continue;
      const pick = pool.find((c) => !used.has(c.id));
      if (pick) { s.creature_id = pick.id; used.add(pick.id); }
    }
    const newBench: string[] = [];
    for (const c of pool) {
      if (newBench.length >= MAX_BENCH) break;
      if (!used.has(c.id)) { newBench.push(c.id); used.add(c.id); }
    }

    setStarters(newStarters);
    setBench(newBench);
    toast.success(mode === "rested" ? "Time descansado escalado — lembre de salvar!" : "Escalação automática aplicada — lembre de salvar!");
  };
  const autoFill = () => buildAuto("best");
  const autoRested = () => buildAuto("rested");


  const mut = useMutation({
    mutationFn: async () => {
      await save({
        data: {
          formation,
          strategy,
          starters,
          bench,
        },
      });
    },
    onSuccess: () => {
      toast.success("Escalação salva!");
      qc.invalidateQueries({ queryKey: ["lineup"] });
      qc.invalidateQueries({ queryKey: ["prognostic"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar."),
  });

  const filledStarters = starters.filter((s) => s.creature_id).length;

  if (isLoading) {
    return <div className="p-6 text-center text-muted-foreground">Carregando…</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/dashboard" })}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-lg font-semibold">Escalação</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={autoFill}
              disabled={creatures.length === 0}
              size="sm"
              variant="secondary"
            >
              <Wand2 className="mr-2 h-4 w-4" />
              Auto definir
            </Button>
            <Button
              onClick={autoRested}
              disabled={creatures.length === 0}
              size="sm"
              variant="outline"
              title="Prioriza criaturas com energia alta"
            >
              Escalar time descansado
            </Button>

            <Button
              onClick={() => mut.mutate()}
              disabled={mut.isPending || filledStarters !== 11}
              size="sm"
            >
              <Save className="mr-2 h-4 w-4" />
              Salvar
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 px-4 py-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tática</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Formação</label>
              <Select value={formation} onValueChange={(v) => setFormation(v as Formation)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMATIONS.map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Estratégia</label>
              <Select value={strategy} onValueChange={(v) => setStrategy(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ofensiva">
                    <span className="flex items-center gap-2"><Swords className="h-4 w-4" />Ofensiva</span>
                  </SelectItem>
                  <SelectItem value="equilibrada">
                    <span className="flex items-center gap-2"><Scale className="h-4 w-4" />Equilibrada</span>
                  </SelectItem>
                  <SelectItem value="defensiva">
                    <span className="flex items-center gap-2"><Shield className="h-4 w-4" />Defensiva</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 text-xs text-muted-foreground">
              Titulares preenchidos: <b>{filledStarters}/11</b> · Reservas: <b>{bench.length}/{MAX_BENCH}</b>
            </div>
            {injuredList.length > 0 && (
              <div className="sm:col-span-2 flex items-start gap-2 rounded-md border border-red-500/60 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                <HeartPulse className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {injuredList.length} {injuredList.length === 1 ? "criatura lesionada" : "criaturas lesionadas"} não estão disponíveis: {injuredList.map((c: any) => c.name).join(", ")}.
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <PrognosticCard state={prog} />



        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Titulares</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {slots.map((s) => {
              const current = starters.find((x) => x.slot === s.index)?.creature_id ?? null;
              const options = availableFor(current);
              const sug = ROLE_HINT[s.role];
              const currentCreature = current ? creatures.find((x) => x.id === current) : null;
              const currFs = currentCreature ? fatigueState(currentCreature.energy ?? 100) : null;
              const currMult = currentCreature ? energyMultiplier(currentCreature.energy ?? 100) : 1;
              const currEff = currentCreature ? effectiveOverall(currentCreature.overall ?? 0, currentCreature.energy ?? 100) : 0;
              const warn = currFs === "muito_cansado" || currFs === "exausto";
              return (
                <div key={s.index} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="w-16 shrink-0 justify-center">
                      {s.label}
                    </Badge>
                    <Select
                      value={current ?? "__none"}
                      onValueChange={(v) => setSlotCreature(s.index, v === "__none" ? null : v)}
                    >
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Vazio" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">— Vazio —</SelectItem>
                        {options.map((c) => {
                          const match = sug.includes(c.suggested_position ?? "");
                          const fs = fatigueState(c.energy ?? 100);
                          const eff = effectiveOverall(c.overall ?? 0, c.energy ?? 100);
                          const tag =
                            fs === "exausto" ? " ⚠️ EXAUSTO" :
                            fs === "muito_cansado" ? " ⚠️ Muito cansado" :
                            fs === "cansado" ? " · cansado" :
                            fs === "leve" ? " · leve cansaço" : "";

                          return (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name} · {ELEMENT_LABEL[c.element] ?? c.element} · OVR {c.overall}{eff !== c.overall ? `→${eff}` : ""} · {(c.overall / 20).toFixed(1)}★
                              {match ? " (posição ideal)" : ""}{tag}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  {currentCreature && currFs && currFs !== "pleno" && (
                    <div className={"ml-[4.5rem] inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] " + FATIGUE_CLASS[currFs] + (warn ? " font-semibold" : "")}>
                      {warn && <AlertTriangle className="h-3 w-3" />}
                      <span>{FATIGUE_LABEL[currFs]} · {currentCreature.energy}%</span>
                      <span className="opacity-80">Ovr {currentCreature.overall}→{currEff} (-{Math.round((1 - currMult) * 100)}%)</span>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Reservas ({bench.length}/{MAX_BENCH})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {bench.length > 0 && (
              <div className="space-y-2">
                {bench.map((id) => {
                  const c = creatures.find((x) => x.id === id);
                  if (!c) return null;
                  const fs = fatigueState(c.energy ?? 100);
                  const eff = effectiveOverall(c.overall ?? 0, c.energy ?? 100);
                  return (
                    <div key={id} className="flex items-center justify-between rounded-md border p-2">
                      <div className="text-sm min-w-0">
                        <span className="font-medium">{c.name}</span>{" "}
                        <span className="text-muted-foreground">
                          · {ELEMENT_LABEL[c.element] ?? c.element} · OVR {c.overall}{eff !== c.overall ? `→${eff}` : ""} · {(c.overall / 20).toFixed(1)}★
                        </span>
                        <div className={"mt-1 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] " + FATIGUE_CLASS[fs]}>
                          {FATIGUE_LABEL[fs]} · {c.energy}%
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => removeFromBench(id)}>
                        Remover
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {bench.length < MAX_BENCH && (
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Adicionar reserva</label>
                <Select value="" onValueChange={(v) => v && addToBench(v)}>
                  <SelectTrigger><SelectValue placeholder="Escolher criatura…" /></SelectTrigger>
                  <SelectContent>
                    {creatures
                      .filter((c) => !usedIds.has(c.id))
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} · {ELEMENT_LABEL[c.element] ?? c.element} · OVR {c.overall} · {(c.overall / 20).toFixed(1)}★
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="pb-4 text-center text-xs text-muted-foreground">
          Dica: criaturas com posição sugerida compatível aparecem marcadas com ★.{" "}
          <Link to="/roster" className="underline">Ver elenco completo</Link>
        </p>
      </main>
    </div>
  );
}
