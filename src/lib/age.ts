// Helpers de idade / aposentadoria — usados apenas na UI.
// Regra do bestiário: nasce com 18, +3 anos por temporada, aposenta aos 33.

export type AgeStatus = "normal" | "veteran" | "last_season" | "retired";

export function ageStatus(age: number | null | undefined): AgeStatus {
  const a = age ?? 18;
  if (a >= 33) return "retired";
  if (a >= 30) return "last_season";
  if (a >= 27) return "veteran";
  return "normal";
}

export function seasonsRemaining(age: number | null | undefined): number {
  const a = age ?? 18;
  return Math.max(0, Math.ceil((33 - a) / 3));
}

// Espelha src/lib/lifecycle.functions.ts → rebirthHalfStars()
export function rebirthHalfStarsPreview(currentHalfStars: number): number {
  if (currentHalfStars >= 8) return 6;
  if (currentHalfStars === 7) return 5;
  if (currentHalfStars === 6) return 4;
  if (currentHalfStars === 5) return 4;
  return currentHalfStars;
}

// Valor recebido ao vender: valor de mercado atual - 25% (conforme prompt).
export function sellValuePreview(marketValue: number): number {
  return Math.round((marketValue ?? 0) * 0.75);
}

export const AGE_LABEL: Record<AgeStatus, string> = {
  normal: "",
  veteran: "Veterano",
  last_season: "Última temporada",
  retired: "Aposentada",
};
