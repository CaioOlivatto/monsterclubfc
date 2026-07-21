import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { getMyLineup, saveLineup } from "@/lib/lineup.functions";
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
import { toast } from "sonner";
import { ArrowLeft, Save, Shield, Swords, Scale } from "lucide-react";

export const Route = createFileRoute("/_authenticated/lineup")({
  head: () => ({
    meta: [
      { title: "Escalação — Futebol de Criaturas" },
      {
        name: "description",
        content: "Monte a formação e estratégia do seu time de criaturas.",
      },
      { property: "og:title", content: "Escalação — Futebol de Criaturas" },
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

  const { data, isLoading } = useQuery({
    queryKey: ["lineup"],
    queryFn: () => fetchLineup(),
  });

  const [formation, setFormation] = useState<Formation>("4-4-2");
  const [strategy, setStrategy] = useState<"ofensiva" | "equilibrada" | "defensiva">("equilibrada");
  const [starters, setStarters] = useState<StarterSlot[]>([]);
  const [bench, setBench] = useState<string[]>([]);

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
    setBench(Array.isArray(data.lineup.bench) ? (data.lineup.bench as string[]) : []);
  }, [data]);

  // Se o usuário mudar a formação depois, refaz os slots preservando IDs por índice quando possível
  useEffect(() => {
    setStarters((prev) => {
      const map = new Map(prev.map((p) => [p.slot, p.creature_id]));
      return slots.map((s) => ({ slot: s.index, role: s.role, creature_id: map.get(s.index) ?? null }));
    });
  }, [slots]);

  const creatures = data?.creatures ?? [];
  const usedIds = new Set<string>([
    ...starters.map((s) => s.creature_id).filter(Boolean) as string[],
    ...bench,
  ]);

  const availableFor = (currentId: string | null) =>
    creatures.filter((c) => c.id === currentId || !usedIds.has(c.id));

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
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || filledStarters !== 11}
            size="sm"
          >
            <Save className="mr-2 h-4 w-4" />
            Salvar
          </Button>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Titulares</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {slots.map((s) => {
              const current = starters.find((x) => x.slot === s.index)?.creature_id ?? null;
              const options = availableFor(current);
              const sug = ROLE_HINT[s.role];
              return (
                <div key={s.index} className="flex items-center gap-2">
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
                        return (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name} · {ELEMENT_LABEL[c.element] ?? c.element} · OVR {c.overall}
                            {match ? " ★" : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
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
                  return (
                    <div key={id} className="flex items-center justify-between rounded-md border p-2">
                      <div className="text-sm">
                        <span className="font-medium">{c.name}</span>{" "}
                        <span className="text-muted-foreground">
                          · {ELEMENT_LABEL[c.element] ?? c.element} · OVR {c.overall} · Energia {c.energy}
                        </span>
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
                          {c.name} · {ELEMENT_LABEL[c.element] ?? c.element} · OVR {c.overall}
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
