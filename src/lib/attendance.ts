// Ocupação do estádio a partir da moral média do elenco.
// Fórmula (spec): ocupação = clamp(10 + moral_média × 0,9, 10, 100)
// Piso de 10% (nunca vazio), âncora em moral 70 → ~73%.
// Consome a MESMA moral já calculada pelo sistema existente — não recalcula.

export type AttendanceLabelKey =
  | "vazio" | "poucas" | "metade" | "muitas" | "lotado";

export interface AttendanceLabel {
  key: AttendanceLabelKey;
  label: string;
  icon: string; // emoji
}

export interface AttendanceInfo {
  capacity: number;
  attendance: number;
  /** 0..1 */
  occupancy: number;
  /** 0..100 (moral média usada) */
  morale_avg: number;
  label: AttendanceLabel;
}

/** Retorna a ocupação (0..1) a partir da moral média (0..100), com ruído opcional ±5%. */
export function computeOccupancy(
  moraleAvg: number,
  rng?: () => number,
): number {
  const m = Math.max(0, Math.min(100, Number.isFinite(moraleAvg) ? moraleAvg : 50));
  const base = 10 + m * 0.9; // 10..100
  const noise = rng ? (rng() * 0.10 - 0.05) : 0; // ±5% absolutos
  const pct = Math.max(10, Math.min(100, base + noise * 100));
  return pct / 100;
}

/** Média de moral do elenco (0..100). Vazio → 50 (neutro). */
export function rosterMoraleAverage(roster: Array<{ morale?: number | null }>): number {
  if (!roster || roster.length === 0) return 50;
  const sum = roster.reduce((a, c) => {
    const v = typeof c.morale === "number" && Number.isFinite(c.morale)
      ? Math.max(0, Math.min(100, c.morale))
      : 50;
    return a + v;
  }, 0);
  return sum / roster.length;
}

export function attendanceLabel(occupancy: number): AttendanceLabel {
  const pct = Math.max(0, Math.min(100, occupancy * 100));
  if (pct < 20) return { key: "vazio",   label: "Vazio",             icon: "🪑" };
  if (pct < 40) return { key: "poucas",  label: "Poucas pessoas",    icon: "🙁" };
  if (pct < 60) return { key: "metade",  label: "Metade do estádio", icon: "😐" };
  if (pct < 85) return { key: "muitas",  label: "Muitas pessoas",    icon: "🙂" };
  return           { key: "lotado",  label: "Lotado",            icon: "🔥" };
}

/** Constrói o pacote de attendance completo a partir de capacidade + moral média. */
export function buildAttendance(
  capacity: number,
  moraleAvg: number,
  rng?: () => number,
): AttendanceInfo {
  const occupancy = computeOccupancy(moraleAvg, rng);
  const attendance = Math.round(capacity * occupancy);
  return {
    capacity,
    attendance,
    occupancy,
    morale_avg: Math.round(moraleAvg),
    label: attendanceLabel(occupancy),
  };
}
