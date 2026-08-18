import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { NarrationParts } from "@/lib/narration/session";

interface Props {
  parts: NarrationParts;
  teamColor: string; // hsl or css color
  outcome: "goal" | "save" | "miss" | "block" | "red_card";
  elementalAdvantage?: boolean;
  brief?: boolean; // pula direto ao desfecho (ex.: cartão vermelho)
  inline?: boolean;
  onFinished: () => void;
}

/**
 * Tarja de 3 tempos. Revela p1, p2, p3 com pausa entre elas.
 * Em gol, pisca ao mostrar p3. Em modo brief, mostra só o desfecho.
 */
export function PlayBanner({ parts, teamColor, outcome, elementalAdvantage, brief, inline = false, onFinished }: Props) {
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const step2Delay = parts.fast_beat ? 500 : 900;
  const step3Delay = parts.fast_beat ? 500 : 900;
  const holdMs = outcome === "goal" ? 1900 : brief ? 1200 : 1400;

  useEffect(() => {
    if (brief) {
      const t3 = window.setTimeout(() => setStep(3), 50);
      const t4 = window.setTimeout(() => onFinished(), 50 + holdMs);
      return () => {
        window.clearTimeout(t3);
        window.clearTimeout(t4);
      };
    }
    const t1 = window.setTimeout(() => setStep(1), 50);
    const t2 = window.setTimeout(() => setStep(2), 50 + step2Delay);
    const t3 = window.setTimeout(() => setStep(3), 50 + step2Delay + step3Delay);
    const t4 = window.setTimeout(() => onFinished(), 50 + step2Delay + step3Delay + holdMs);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearTimeout(t4);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const isGoal = outcome === "goal";
  const showFlash = isGoal && step === 3;

  return (
    <div className={cn(inline ? "relative w-full" : "fixed inset-x-0 top-0 z-50 flex justify-center px-2 pt-2", "animate-fade-in")}>
      <div
        className={cn(
          "w-full rounded-xl border-2 p-4 shadow-2xl backdrop-blur sm:p-5",
          !inline && "max-w-2xl",
          showFlash && "ring-1 ring-white/20",
        )}
        style={{
          borderColor: teamColor,
          background: `linear-gradient(180deg, ${teamColor}22, hsl(var(--card) / 0.95))`,
          boxShadow: `0 0 40px ${teamColor}66`,
        }}
      >
        {inline && (
          <div className="mb-3 flex items-center justify-between gap-3 border-b border-white/10 pb-2">
            <span className="text-[10px] font-bold uppercase tracking-[.16em] text-violet-300">🎙️ Narração ao vivo · lance principal</span>
            <span className="text-xs font-bold text-cyan-300">Ao vivo</span>
          </div>
        )}
        <ol className="space-y-2 text-left">
          {step >= 1 && (
            <li
              className={cn(
                "text-base font-medium leading-snug text-foreground/80 transition-opacity",
                step === 1 && "text-foreground",
              )}
            >
              {parts.p1}
            </li>
          )}
          {step >= 2 && (
            <li
              className={cn(
                "text-base font-medium leading-snug text-foreground/80 transition-opacity",
                step === 2 && "text-foreground",
              )}
            >
              {parts.p2}
            </li>
          )}
          {step >= 3 && (
            <li
              className={cn(
                "font-bold leading-tight",
                isGoal
                  ? "text-3xl uppercase tracking-tight text-primary"
                  : "text-lg text-foreground",
              )}
              style={isGoal ? { color: teamColor, textShadow: `0 0 20px ${teamColor}` } : undefined}
            >
              {parts.p3}
            </li>
          )}
          {step >= 3 && parts.callbacks.length > 0 && (
            <li className="text-sm italic text-muted-foreground">
              {parts.callbacks[0]}
            </li>
          )}
          {step >= 3 && isGoal && elementalAdvantage && (
            <li className="mt-1 inline-block rounded-full bg-primary/20 px-2 py-0.5 text-xs font-semibold text-primary">
              ⚡ Vantagem elemental!
            </li>
          )}
        </ol>
      </div>
    </div>
  );
}
