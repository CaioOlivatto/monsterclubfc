// Regras econômicas compartilhadas — Balanceamento §2.4 (salários) e §8 (calibre e teto).

export type Division = "bronze" | "prata" | "ouro" | "diamante" | "lendaria";

export const DIVISION_ORDER: Division[] = ["bronze", "prata", "ouro", "diamante", "lendaria"];

export function divisionLabel(d: Division): string {
  return { bronze: "5ª Bronze", prata: "4ª Prata", ouro: "3ª Ouro", diamante: "2ª Diamante", lendaria: "1ª Lendária" }[d];
}

/** Salário por temporada — Balanceamento §2.4. Overall aproxima o tier de estrelas. */
export function seasonSalary(overall: number): number {
  if (overall < 30) return 4_000;    // 0,5–1★
  if (overall < 50) return 9_000;    // 1,5–2★
  if (overall < 70) return 20_000;   // 2,5–3★
  if (overall < 90) return 45_000;   // 3,5–4★
  return 90_000;                     // 4,5–5★
}

/** Limite de contratação (banda de meia-estrela máxima) — Balanceamento §8.1. */
export const DIVISION_MAX_BAND: Record<Division, number> = {
  bronze: 6,     // até 3★
  prata: 8,      // até 4★
  ouro: 10,      // até 5★ (chance alta de recusa em 5★)
  diamante: 10,  // até 5★
  lendaria: 10,  // sem restrição
};

/** Teto de folha salarial por divisão (~35% da receita típica) — Balanceamento §8.2. */
export const DIVISION_SALARY_CAP: Record<Division, number> = {
  bronze:      770_000,
  prata:     1_440_000,
  ouro:      2_410_000,
  diamante:  3_920_000,
  lendaria:  6_020_000,
};

/** Chance de recusa por contratação acima do calibre confortável (§8.1). */
export function refusalChance(division: Division, band: number): number {
  if (division === "ouro" && band >= 9) return 0.6;      // Ouro tentando 4,5★+
  if (division === "prata" && band >= 8) return 0.4;     // Prata tentando 4★
  if (division === "bronze" && band >= 6) return 0.5;    // Bronze no teto
  return 0;
}

/** Perfil de distribuição de estrelas por divisão — Balanceamento §7.1.
 *  Cada array tem 10 pesos, um por meia-estrela (índice 0 = 0,5★ ... índice 9 = 5★). */
export const DIVISION_STAR_PROFILE: Record<Division, number[]> = {
  //                   0.5, 1,  1.5, 2,  2.5, 3,  3.5, 4,  4.5, 5
  bronze:    [ 5, 20, 33, 27, 12,  3,  0,  0,  0,  0 ],
  prata:     [ 0,  5, 17, 32, 28, 14,  4,  0,  0,  0 ],
  ouro:      [ 0,  0,  5, 15, 30, 30, 15,  5,  0,  0 ],
  diamante:  [ 0,  0,  0,  6, 18, 32, 26, 14,  4,  0 ],
  lendaria:  [ 0,  0,  0,  0,  8, 20, 30, 25, 12,  5 ],
};

/** Sorteia uma banda de meia-estrela conforme o perfil da divisão. */
export function rollBandForDivision(division: Division, rng: () => number): number {
  const weights = DIVISION_STAR_PROFILE[division];
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i + 1; // banda 1..10
  }
  return weights.length;
}
