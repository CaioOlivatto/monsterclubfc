import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getMyTactics, saveTactics } from "@/lib/lineup.functions";
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

export function TacticsSheet() {
  const qc = useQueryClient();
  const fetchTactics = useServerFn(getMyTactics);
  const saveFn = useServerFn(saveTactics);

  const { data } = useQuery({
    queryKey: ["my-tactics"],
    queryFn: () => fetchTactics(),
  });

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Tactics>(NEUTRAL);

  useEffect(() => {
    if (data?.tactics) setDraft(data.tactics);
  }, [data?.tactics]);

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
    onError: () =>
      toast.error("N\u00e3o foi poss\u00edvel salvar as t\u00e1ticas. Tente novamente."),
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline">
          <Sliders className="mr-1 h-3 w-3" /> Táticas
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Táticas</SheetTitle>
          <SheetDescription>
            Ajuste os quatro eixos táticos. O motor é pré-simulado, então mudanças passam a
            valer a partir da <b>próxima partida</b>.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-4">
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
        </div>

        <SheetFooter className="flex-row gap-2 sm:flex-row">
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
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
