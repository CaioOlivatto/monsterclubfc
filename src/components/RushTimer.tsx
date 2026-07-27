// Exibição padronizada de processos com temporizador que aceitam aceleração por gemas.
// Regra única: 1 gema por 10 minutos restantes (arredondado para cima, mínimo 1).
// O valor é recalculado a cada segundo, então cai sozinho enquanto a tela fica aberta.

import { useEffect, useState, type ReactNode } from "react";
import { Progress } from "@/components/ui/progress";
import { Gem } from "lucide-react";

/** 1 gema a cada 10 minutos restantes (mínimo 1). */
export function rushGemCost(remainingMs: number): number {
  return Math.max(1, Math.ceil(Math.max(0, remainingMs) / (10 * 60 * 1000)));
}

/** Relógio reativo — força re-render a cada `intervalMs`. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${String(m).padStart(2, "0")}m ${String(ss).padStart(2, "0")}s`;
}

export function RushTimer({
  target,
  totalMs,
  label,
  className,
  children,
}: {
  /** ISO de conclusão. */
  target: string;
  /** Duração total do processo, para a barra de progresso. */
  totalMs?: number;
  label?: ReactNode;
  className?: string;
  /** Ações (acelerar/cancelar) recebendo o custo já calculado ao vivo. */
  children?: (state: { remainingMs: number; cost: number; done: boolean }) => ReactNode;
}) {
  const now = useNow(1000);
  const remainingMs = Math.max(0, new Date(target).getTime() - now);
  const cost = rushGemCost(remainingMs);
  const done = remainingMs <= 0;
  const progress =
    totalMs && totalMs > 0
      ? Math.max(0, Math.min(100, ((totalMs - remainingMs) / totalMs) * 100))
      : 0;

  return (
    <div className={className ?? "space-y-2"}>
      <div className="flex items-center justify-between gap-2 text-sm">
        {label ? <span className="min-w-0 truncate font-medium">{label}</span> : <span />}
        <span className="font-mono text-xs text-muted-foreground">
          {done ? "Pronto" : `${formatRemaining(remainingMs)} restantes`}
        </span>
      </div>
      {totalMs ? <Progress value={progress} className="h-1.5" /> : null}
      {!done && (
        <p className="flex items-center gap-1 text-xs font-medium text-primary">
          <Gem className="h-3 w-3" />
          Concluir agora: {cost} {cost === 1 ? "gema" : "gemas"}
        </p>
      )}
      {children?.({ remainingMs, cost, done })}
    </div>
  );
}
