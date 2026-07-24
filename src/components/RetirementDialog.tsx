import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { retireCreature, rebirthCreature } from "@/lib/lifecycle.functions";
import { rebirthHalfStarsPreview, sellValuePreview } from "@/lib/age";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Hourglass, Coins, Sparkles } from "lucide-react";

type Creature = {
  id: string;
  name: string;
  age: number | null;
  market_value: number | null;
  half_stars_earned: number | null;
};

/**
 * Popup automático de aposentadoria. Ao montar (dashboard/roster),
 * enfileira todas as criaturas com idade >= 33 e apresenta uma por vez.
 * "Decidir depois" avança a fila mas NÃO persiste — o diálogo reabre
 * na próxima visita à tela enquanto ainda houver pendências.
 */
export function RetirementDialog({ creatures }: { creatures: Creature[] | undefined }) {
  const qc = useQueryClient();
  const retireFn = useServerFn(retireCreature);
  const rebirthFn = useServerFn(rebirthCreature);

  const pending = React.useMemo(
    () => (creatures ?? []).filter((c) => (c.age ?? 0) >= 33),
    [creatures],
  );

  // Fila local: ids que ainda queremos mostrar nesta montagem.
  const [queue, setQueue] = React.useState<string[]>([]);
  const initedRef = React.useRef(false);

  React.useEffect(() => {
    if (initedRef.current) return;
    if (pending.length === 0) return;
    initedRef.current = true;
    setQueue(pending.map((c) => c.id));
  }, [pending]);

  const current = React.useMemo(() => {
    const id = queue[0];
    return pending.find((c) => c.id === id);
  }, [queue, pending]);

  const advance = () => setQueue((q) => q.slice(1));

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["my-creatures"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["my-lineup"] });
    if (current) qc.invalidateQueries({ queryKey: ["creature", current.id] });
  };

  const retireMut = useMutation({
    mutationFn: (id: string) => retireFn({ data: { creature_id: id } }),
    onSuccess: (res) => {
      toast.success(`${res.retired} aposentada — recebeu $${res.payout.toLocaleString("pt-BR")}`);
      invalidateAll();
      advance();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao aposentar"),
  });

  const rebirthMut = useMutation({
    mutationFn: (id: string) => rebirthFn({ data: { creature_id: id } }),
    onSuccess: (res) => {
      toast.success(`${res.rebirth} renasceu — ${(res.half_stars / 2).toFixed(1)}★ (OVR ${res.overall})`);
      invalidateAll();
      advance();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao renascer"),
  });

  if (!current) return null;

  const currentHs = current.half_stars_earned ?? 0;
  const currentStars = (currentHs / 2).toFixed(1);
  const rebirthHs = rebirthHalfStarsPreview(currentHs);
  const rebirthStars = (rebirthHs / 2).toFixed(1);
  const payout = sellValuePreview(current.market_value ?? 0);
  const isBusy = retireMut.isPending || rebirthMut.isPending;
  const remaining = queue.length - 1;

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !isBusy) advance(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-2 flex items-center gap-2 text-amber-600 dark:text-amber-500">
            <Hourglass className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wide">Aposentadoria</span>
          </div>
          <DialogTitle>
            {current.name} completou 33 anos e está pronta para se aposentar.
          </DialogTitle>
          <DialogDescription>
            Escolha o destino da criatura. A vaga do elenco continua ocupada até você decidir.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="rounded-lg border p-3">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <Coins className="h-4 w-4 text-emerald-600" />
              Vender agora
            </div>
            <p className="text-sm text-muted-foreground">
              Recebe <span className="font-semibold text-foreground">${payout.toLocaleString("pt-BR")}</span>{" "}
              (valor de mercado −25%). A criatura sai do elenco.
            </p>
          </div>

          <div className="rounded-lg border p-3">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-violet-600" />
              Renascer
            </div>
            <p className="text-sm text-muted-foreground">
              Volta aos 18 anos com <span className="font-semibold text-foreground">{rebirthStars}★</span>{" "}
              (hoje: {currentStars}★).
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="ghost"
            onClick={advance}
            disabled={isBusy}
            className="sm:mr-auto"
          >
            Decidir depois
          </Button>
          <Button
            variant="outline"
            onClick={() => rebirthMut.mutate(current.id)}
            disabled={isBusy}
          >
            Renascer com {rebirthStars}★
          </Button>
          <Button
            onClick={() => retireMut.mutate(current.id)}
            disabled={isBusy}
          >
            Vender por ${payout.toLocaleString("pt-BR")}
          </Button>
        </DialogFooter>

        {remaining > 0 && (
          <p className="mt-1 text-center text-xs text-muted-foreground">
            +{remaining} {remaining === 1 ? "outra criatura pendente" : "outras criaturas pendentes"}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
