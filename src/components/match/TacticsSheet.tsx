import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getMyLineup, getMyTactics, saveTactics } from "@/lib/lineup.functions";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Sliders } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

type Tactics = {
  mentalidade: number;
  verticalidade: number;
  pressao: number;
  cortes: number;
};

const NEUTRAL: Tactics = { mentalidade: 0, verticalidade: 0, pressao: 0, cortes: 0 };

const AXES: Array<{
  key: keyof Tactics;
  label: string;
  minLabel: string;
  maxLabel: string;
  hint: string;
}> = [
  {
    key: "mentalidade",
    label: "Mentalidade",
    minLabel: "Defensiva",
    maxLabel: "Ofensiva",
    hint: "Ataque × Defesa. Ofensiva marca mais e sofre mais.",
  },
  {
    key: "verticalidade",
    label: "Verticalidade",
    minLabel: "Posse",
    maxLabel: "Direto",
    hint: "Direto gera mais chances, mas com pior qualidade.",
  },
  {
    key: "pressao",
    label: "Pressão",
    minLabel: "Baixa",
    maxLabel: "Alta",
    hint: "Alta rouba mais bolas; aumenta lesão e cartões.",
  },
  {
    key: "cortes",
    label: "Cortes",
    minLabel: "Leve",
    maxLabel: "Duro",
    hint: "Duro reforça a defesa; risco maior de cartão.",
  },
];

function axisText(v: number, min: string, max: string) {
  if (v === 0) return "Neutro";
  const side = v > 0 ? max : min;
  const strength = Math.abs(v) === 2 ? "muito " : "";
  return `${strength}${side}`.trim();
}

export function TacticsSheet({ substitutionsUsed = 0, autoOpenSubstitutions = false, onSubstitute }: { substitutionsUsed?: number; autoOpenSubstitutions?: boolean; onSubstitute?: (change: { outId: string; outName: string; inId: string; inName: string }) => void }) {
  const qc = useQueryClient();
  const fetchTactics = useServerFn(getMyTactics);
  const saveFn = useServerFn(saveTactics);
  const fetchLineup = useServerFn(getMyLineup);

  const { data } = useQuery({
    queryKey: ["my-tactics"],
    queryFn: () => fetchTactics(),
  });
  const { data: lineupData } = useQuery({
    queryKey: ["lineup"],
    queryFn: () => fetchLineup(),
    staleTime: 60_000,
  });

  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"tactics" | "substitutions">("tactics");
  const [visualStarters, setVisualStarters] = useState<string[]>([]);
  const [visualBench, setVisualBench] = useState<string[]>([]);
  const [selectedOut, setSelectedOut] = useState<string | null>(null);
  const [selectedIn, setSelectedIn] = useState<string | null>(null);
  const [draft, setDraft] = useState<Tactics>(NEUTRAL);

  useEffect(() => {
    if (data?.tactics) setDraft(data.tactics);
  }, [data?.tactics]);

  useEffect(() => {
    if (!autoOpenSubstitutions) return;
    setActiveTab("substitutions");
    setOpen(true);
  }, [autoOpenSubstitutions]);

  useEffect(() => {
    if (!lineupData?.lineup) return;
    setVisualStarters((current) => current.length ? current : (lineupData.lineup.starters ?? []).map((item: any) => item.creature_id).filter(Boolean));
    setVisualBench((current) => current.length ? current : (lineupData.lineup.bench ?? []));
  }, [lineupData?.lineup]);

  const confirmSubstitution = () => {
    if (!selectedOut || !selectedIn || substitutionsUsed >= 5) return;
    const outCreature = lineupData?.creatures?.find((item: any) => item.id === selectedOut);
    const inCreature = lineupData?.creatures?.find((item: any) => item.id === selectedIn);
    if (!outCreature || !inCreature) return;
    setVisualStarters((list) => list.map((id) => id === selectedOut ? selectedIn : id));
    setVisualBench((list) => list.map((id) => id === selectedIn ? selectedOut : id));
    onSubstitute?.({ outId: selectedOut, outName: outCreature.name, inId: selectedIn, inName: inCreature.name });
    setSelectedOut(null);
    setSelectedIn(null);
    toast.success(`Entra ${inCreature.name}; sai ${outCreature.name}.`);
  };

  const mut = useMutation({
    mutationFn: (t: Tactics) =>
      saveFn({
        data: {
          mentalidade: Number(t.mentalidade),
          verticalidade: Number(t.verticalidade),
          pressao: Number(t.pressao),
          cortes: Number(t.cortes),
        },
      }),
    onSuccess: () => {
      toast.success("Táticas salvas — valem a partir da próxima partida.");
      qc.invalidateQueries({ queryKey: ["my-tactics"] });
      setOpen(false);
    },
    onError: (error) => {
      console.error("[saveTactics]", error);
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar as táticas. Tente novamente.");
    },
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline">
          <Sliders className="mr-1 h-3 w-3" /> Táticas
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="dark w-full overflow-y-auto border-violet-500/40 bg-slate-950 text-slate-100 sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="text-slate-100">Comando da partida</SheetTitle>
          <SheetDescription>
            Ajuste o plano do time e acompanhe as opções disponíveis no banco.
          </SheetDescription>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="py-4">
          <TabsList className="grid w-full grid-cols-2 border border-violet-500/30 bg-slate-900/80 p-1">
            <TabsTrigger value="tactics">Táticas</TabsTrigger>
            <TabsTrigger value="substitutions">Substituições</TabsTrigger>
          </TabsList>
          <TabsContent value="tactics" className="space-y-6 pt-4">
          {AXES.map((a) => {
            const v = draft[a.key];
            return (
              <div key={a.key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{a.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {axisText(v, a.minLabel, a.maxLabel)}
                  </span>
                </div>
                <Slider
                  min={-2}
                  max={2}
                  step={1}
                  value={[v]}
                  onValueChange={(val) =>
                    setDraft((d) => ({ ...d, [a.key]: Number(val[0]) }))
                  }
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>{a.minLabel}</span>
                  <span>Neutro</span>
                  <span>{a.maxLabel}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">{a.hint}</p>
              </div>
            );
          })}
          </TabsContent>
          <TabsContent value="substitutions" className="space-y-4 pt-4">
            <div className="flex items-center justify-between rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
              <div><p className="text-xs font-bold uppercase tracking-wider text-violet-300">Substituições</p><p className="mt-1 text-xs text-slate-400">Limite oficial de cinco trocas.</p></div>
              <Badge className={substitutionsUsed >= 5 ? "bg-red-600" : "bg-violet-600"}>{substitutionsUsed}/5</Badge>
            </div>
            <RosterGroup title="Em campo — escolha quem sai" ids={visualStarters} creatures={lineupData?.creatures ?? []} selectedId={selectedOut} onSelect={setSelectedOut} />
            <RosterGroup title="Reservas — escolha quem entra" ids={visualBench} creatures={lineupData?.creatures ?? []} selectedId={selectedIn} onSelect={setSelectedIn} />
            <Button className="w-full bg-gradient-to-r from-violet-700 to-purple-600 text-white" disabled={!selectedOut || !selectedIn || substitutionsUsed >= 5} onClick={confirmSubstitution}>
              {substitutionsUsed >= 5 ? "Limite de substituições atingido" : "Confirmar substituição"}
            </Button>
          </TabsContent>
        </Tabs>

        {activeTab === "tactics" && <SheetFooter className="flex-row gap-2 sm:flex-row">
          <Button
            variant="ghost"
            className="flex-1"
            onClick={() => setDraft(NEUTRAL)}
            disabled={mut.isPending}
          >
            Neutro
          </Button>
          <SheetClose asChild>
            <Button variant="outline" className="flex-1" disabled={mut.isPending}>
              Cancelar
            </Button>
          </SheetClose>
          <Button
            className="flex-1"
            onClick={() => mut.mutate(draft)}
            disabled={mut.isPending}
          >
            Salvar
          </Button>
        </SheetFooter>}
      </SheetContent>
    </Sheet>
  );
}

function RosterGroup({ title, ids, creatures, selectedId, onSelect }: { title: string; ids: string[]; creatures: any[]; selectedId?: string | null; onSelect?: (id: string) => void }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/55 p-3">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-300">{title} ({ids.length})</h3>
      <div className="space-y-1.5">
        {ids.map((id) => {
          const creature = creatures.find((item: any) => item.id === id);
          if (!creature) return null;
          return <button type="button" onClick={() => onSelect?.(id)} key={id} className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${selectedId === id ? "border-violet-400 bg-violet-500/20" : "border-slate-800 bg-slate-950/70 hover:border-violet-500/50"}`}><span className="truncate font-semibold">{creature.name}</span><span className="shrink-0 text-slate-400">{creature.suggested_position} · OVR {creature.overall} · ⚡ {creature.energy}%</span></button>;
        })}
      </div>
    </section>
  );
}
