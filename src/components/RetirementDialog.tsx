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
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto overflow-x-hidden border-violet-400/35 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-0 text-white shadow-[0_0_55px_rgba(124,58,237,0.25)] sm:max-h-[calc(100dvh-2rem)]">
        <DialogHeader className="border-b border-white/10 px-4 pb-4 pt-5 text-left sm:px-6 sm:pt-6">
          <div className="mb-1 flex items-center gap-2 text-amber-300">
            <Hourglass className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wide">Aposentadoria</span>
          </div>
          <DialogTitle className="pr-6 text-lg leading-snug text-white sm:text-xl">
            {current.name} completou 33 anos e está pronta para se aposentar.
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-slate-300">
            Escolha o destino da criatura. A vaga do elenco continua ocupada até você decidir.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 px-4 py-4 sm:px-6">
          <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.07] p-3.5">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-emerald-200">
              <Coins className="h-4 w-4" />
              Vender agora
            </div>
            <p className="text-sm leading-relaxed text-slate-300">
              Recebe <span className="font-semibold text-white">${payout.toLocaleString("pt-BR")}</span>{" "}
              (valor de mercado −25%). A criatura sai do elenco.
            </p>
          </div>

          <div className="rounded-xl border border-violet-400/35 bg-violet-400/[0.08] p-3.5">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-violet-200">
              <Sparkles className="h-4 w-4" />
              Renascer
            </div>
            <p className="text-sm leading-relaxed text-slate-300">
              Volta aos 18 anos com <span className="font-semibold text-white">{rebirthStars}★</span>{" "}
              (hoje: {currentStars}★).
            </p>
          </div>
        </div>

        <DialogFooter className="grid grid-cols-1 gap-2 border-t border-white/10 bg-slate-950/35 px-4 py-4 sm:grid-cols-2 sm:px-6">
          <Button
            variant="ghost"
            onClick={advance}
            disabled={isBusy}
            className="h-11 w-full text-slate-300 hover:bg-white/10 hover:text-white sm:col-span-2"
          >
            Decidir depois
          </Button>
          <Button
            variant="outline"
            onClick={() => rebirthMut.mutate(current.id)}
            disabled={isBusy}
            className="h-auto min-h-11 w-full whitespace-normal border-violet-300/45 bg-violet-400/10 py-2 text-violet-100 hover:bg-violet-400/20 hover:text-white"
          >
            Renascer com {rebirthStars}★
          </Button>
          <Button
            onClick={() => retireMut.mutate(current.id)}
            disabled={isBusy}
            className="h-auto min-h-11 w-full whitespace-normal bg-gradient-to-r from-violet-700 to-indigo-700 py-2 text-white hover:from-violet-600 hover:to-indigo-600"
          >
            Vender por ${payout.toLocaleString("pt-BR")}
          </Button>
        </DialogFooter>

        {remaining > 0 && (
          <p className="px-4 pb-4 text-center text-xs text-slate-400 sm:px-6">
            +{remaining} {remaining === 1 ? "outra criatura pendente" : "outras criaturas pendentes"}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
