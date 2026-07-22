// Helpers de fadiga compartilhados (client-safe). Mantém coerência com o motor
// (src/lib/match-engine.server.ts: energyMultiplier / fatigueState).

export type FatigueState = "pleno" | "leve" | "cansado" | "exausto" | "esgotado";

export function fatigueState(energy: number): FatigueState {
  if (energy >= 70) return "pleno";
  if (energy >= 50) return "leve";
  if (energy >= 30) return "cansado";
  if (energy >= 15) return "exausto";
  return "esgotado";
}

export function energyMultiplier(energy: number): number {
  if (energy >= 70) return 1.0;
  if (energy >= 50) return 0.95;
  if (energy >= 30) return 0.85;
  if (energy >= 15) return 0.7;
  return 0.5;
}

export const FATIGUE_LABEL: Record<FatigueState, string> = {
  pleno: "Pleno",
  leve: "Leve cansaço",
  cansado: "Cansado",
  exausto: "Exausto",
  esgotado: "Esgotado",
};

// Classes utilitárias Tailwind — tokens semânticos onde possível.
export const FATIGUE_CLASS: Record<FatigueState, string> = {
  pleno: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  leve: "bg-lime-500/15 text-lime-700 border-lime-500/30",
  cansado: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  exausto: "bg-orange-500/20 text-orange-700 border-orange-500/40",
  esgotado: "bg-destructive/15 text-destructive border-destructive/40",
};

export function effectiveOverall(overall: number, energy: number): number {
  return Math.round(overall * energyMultiplier(energy));
}
