// Helpers de fadiga v2 (client-safe) — piso 30, escala contínua.
// Mantém coerência com o motor (src/lib/match-engine.server.ts).

export type FatigueState = "pleno" | "leve" | "cansado" | "muito_cansado" | "exausto";

/** Piso de energia: nunca cai abaixo de 30 em lugar nenhum. */
export const ENERGY_FLOOR = 30;

export function clampEnergy(e: number): number {
  if (!Number.isFinite(e)) return 100;
  return Math.max(ENERGY_FLOOR, Math.min(100, e));
}

/** Escala contínua: >=70 → 1.00; senão 0.50 + 0.50 * (e-30)/40. */
export function energyMultiplier(energy: number): number {
  const e = clampEnergy(energy);
  if (e >= 70) return 1.0;
  return 0.5 + 0.5 * (e - 30) / 40;
}

/** Rótulo por faixa — apenas nomenclatura; o cálculo é contínuo. */
export function fatigueState(energy: number): FatigueState {
  const e = clampEnergy(energy);
  if (e >= 70) return "pleno";
  if (e >= 60) return "leve";
  if (e >= 50) return "cansado";
  if (e >= 40) return "muito_cansado";
  return "exausto";
}

export const FATIGUE_LABEL: Record<FatigueState, string> = {
  pleno: "Pleno",
  leve: "Levemente cansado",
  cansado: "Cansado",
  muito_cansado: "Muito cansado",
  exausto: "Exausto",
};

export const FATIGUE_CLASS: Record<FatigueState, string> = {
  pleno: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  leve: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
  cansado: "bg-orange-500/15 text-orange-700 border-orange-500/30",
  muito_cansado: "bg-red-500/15 text-red-600 border-red-500/40",
  exausto: "bg-red-700/25 text-red-700 border-red-700/50",
};

export function effectiveOverall(overall: number, energy: number): number {
  return Math.round(overall * energyMultiplier(energy));
}
