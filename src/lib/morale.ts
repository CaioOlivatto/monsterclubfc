// Sistema de Moral (0..100) — client-safe helpers.
// Efeito multiplicativo separado da fadiga (±10% no rating do duelo).

export type MoraleState = "otimo" | "bom" | "normal" | "baixo" | "pessimo";

export function clampMorale(m: number | null | undefined): number {
  if (typeof m !== "number" || !Number.isFinite(m)) return 50;
  return Math.max(0, Math.min(100, Math.round(m)));
}

export function moraleState(m: number | null | undefined): MoraleState {
  const v = clampMorale(m);
  if (v >= 80) return "otimo";
  if (v >= 60) return "bom";
  if (v >= 40) return "normal";
  if (v >= 20) return "baixo";
  return "pessimo";
}

export function moraleMultiplier(m: number | null | undefined): number {
  switch (moraleState(m)) {
    case "otimo": return 1.10;
    case "bom": return 1.05;
    case "normal": return 1.00;
    case "baixo": return 0.95;
    case "pessimo": return 0.90;
  }
}

export const MORALE_EMOJI: Record<MoraleState, string> = {
  otimo: "😄", bom: "🙂", normal: "😐", baixo: "🙁", pessimo: "😞",
};

export const MORALE_LABEL: Record<MoraleState, string> = {
  otimo: "Ótimo", bom: "Bom", normal: "Normal", baixo: "Baixo", pessimo: "Péssimo",
};

export const MORALE_CLASS: Record<MoraleState, string> = {
  otimo: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  bom: "bg-emerald-400/10 text-emerald-400 border-emerald-400/30",
  normal: "bg-muted text-muted-foreground border-border",
  baixo: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  pessimo: "bg-red-500/15 text-red-400 border-red-500/40",
};

/** Motivo curto a partir do estado da criatura. */
export function moraleReason(c: {
  morale?: number | null;
  injury_matches_remaining?: number | null;
  energy?: number | null;
}): string {
  if ((c.injury_matches_remaining ?? 0) > 0) return "Lesionado";
  const s = moraleState(c.morale);
  if (s === "otimo") return "Jogando com regularidade";
  if (s === "bom") return "Em bom astral";
  if (s === "normal") return "Sem novidades";
  if (s === "baixo") return "Muito tempo no banco ou time em má fase";
  return "Muito desanimado";
}
