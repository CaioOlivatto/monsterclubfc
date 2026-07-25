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

// Espelha ageEnergyMult() em src/lib/match-engine.server.ts.
// Interpolação linear entre âncoras (18, 21, 24, 27, 30).
const AGE_ENERGY_ANCHORS: [number, number][] = [
  [18, 0.80], [21, 0.90], [24, 1.00], [27, 1.10], [30, 1.20],
];
export function ageEnergyMultPreview(age: number | null | undefined): number {
  if (typeof age !== "number" || !Number.isFinite(age)) return 1.0;
  if (age <= AGE_ENERGY_ANCHORS[0][0]) return AGE_ENERGY_ANCHORS[0][1];
  const last = AGE_ENERGY_ANCHORS[AGE_ENERGY_ANCHORS.length - 1];
  if (age >= last[0]) return last[1];
  for (let i = 0; i < AGE_ENERGY_ANCHORS.length - 1; i++) {
    const [a1, v1] = AGE_ENERGY_ANCHORS[i];
    const [a2, v2] = AGE_ENERGY_ANCHORS[i + 1];
    if (age >= a1 && age <= a2) {
      const t = (age - a1) / (a2 - a1);
      return v1 + (v2 - v1) * t;
    }
  }
  return 1.0;
}

/**
 * Projeção de rodadas até "Exausto" (energia < 40) assumindo escalação
 * contínua sem descanso. Base Fadiga v3:
 *   - desgaste médio ~4 pts/partida (média entre V/E/D e pressão neutra),
 *     escalado pelo modificador de idade;
 *   - recuperação de +2 pts para quem jogou.
 * Retorna null se a criatura já está exausta (<40) ou se o net loss ≤ 0
 * (nesse ritmo, ela não fica exausta).
 */
export function matchesUntilExhausted(
  age: number | null | undefined,
  energy: number | null | undefined,
): number | null {
  const e = typeof energy === "number" && Number.isFinite(energy) ? energy : 100;
  if (e < 40) return 0;
  const wear = 4 * ageEnergyMultPreview(age);
  const recovery = 2;
  const net = wear - recovery;
  if (net <= 0) return null;
  return Math.max(1, Math.ceil((e - 40) / net));
}

