import * as React from "react";
import { CalendarDays, LoaderCircle, Shuffle, Sparkles, Trophy } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

const STEPS = [
  { at: 8, label: "Calculando nova temporada", icon: Sparkles },
  { at: 32, label: "Distribuindo times entre as divisões", icon: Shuffle },
  { at: 58, label: "Montando o novo calendário", icon: CalendarDays },
  { at: 80, label: "Finalizando competições", icon: Trophy },
] as const;

export function SeasonTransitionProgress({ open }: { open: boolean }) {
  const [progress, setProgress] = React.useState(8);

  React.useEffect(() => {
    if (!open) {
      setProgress(8);
      return;
    }
    const timer = window.setInterval(() => {
      setProgress((value) => Math.min(92, value + (value < 55 ? 7 : value < 80 ? 4 : 1)));
    }, 850);
    return () => window.clearInterval(timer);
  }, [open]);

  const stepIndex = STEPS.findLastIndex((step) => progress >= step.at);
  const current = STEPS[Math.max(0, stepIndex)];
  const CurrentIcon = current.icon;

  return (
    <Dialog open={open}>
      <DialogContent
        hideClose
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        className="w-[calc(100vw-1.5rem)] max-w-lg overflow-hidden border-cyan-300/35 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-0 text-white shadow-[0_0_55px_rgba(34,211,238,0.2)]"
      >
        <div className="relative p-5 sm:p-7">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent" />
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-cyan-300/45 bg-cyan-400/10 text-cyan-200 shadow-[0_0_20px_rgba(34,211,238,0.2)]">
              <CurrentIcon className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-300">Mudança de temporada</p>
              <DialogTitle className="mt-1 text-lg text-white sm:text-xl">Preparando um novo campeonato</DialogTitle>
              <DialogDescription className="mt-1 text-sm text-slate-300">
                Aguarde enquanto o mundo do jogo é reorganizado.
              </DialogDescription>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2 font-semibold text-cyan-100">
                <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" />
                <span className="truncate sm:whitespace-normal">{current.label}</span>
              </span>
              <span className="shrink-0 font-mono text-xs text-cyan-200">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2.5 bg-slate-800 [&>div]:bg-gradient-to-r [&>div]:from-violet-500 [&>div]:via-cyan-400 [&>div]:to-emerald-400" />
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              const done = index < stepIndex;
              const active = index === stepIndex;
              return (
                <div key={step.label} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${active ? "border-cyan-300/45 bg-cyan-400/10 text-cyan-100" : done ? "border-emerald-400/25 bg-emerald-400/5 text-emerald-200" : "border-white/10 bg-white/[0.03] text-slate-500"}`}>
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{step.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
