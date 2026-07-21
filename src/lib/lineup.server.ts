// Formações suportadas (GDD §5.3). Números representam linhas DEF-MEI-ATA.
export const FORMATIONS = [
  "4-4-2",
  "4-3-3",
  "4-2-3-1",
  "4-1-4-1",
  "4-4-1-1",
  "4-5-1",
  "4-2-4",
  "4-3-2-1",
  "4-1-2-1-2",
  "3-5-2",
  "3-4-3",
  "3-6-1",
  "3-4-2-1",
  "5-3-2",
  "5-4-1",
  "5-2-3",
] as const;

export type Formation = (typeof FORMATIONS)[number];
export type SlotRole = "GOL" | "DEF" | "MEI" | "ATA";

export interface FormationSlot {
  index: number; // 0..10
  role: SlotRole;
  label: string; // ex: "DEF 1"
}

// Constrói slots ordenados: GOL, DEFs, MEIs (todas as linhas intermediárias), ATAs.
export function buildSlots(formation: Formation): FormationSlot[] {
  const parts = formation.split("-").map((n) => parseInt(n, 10));
  const def = parts[0];
  const ata = parts[parts.length - 1];
  const mei = parts.slice(1, -1).reduce((a, b) => a + b, 0);
  const slots: FormationSlot[] = [{ index: 0, role: "GOL", label: "GOL" }];
  let i = 1;
  for (let d = 1; d <= def; d++) slots.push({ index: i++, role: "DEF", label: `DEF ${d}` });
  for (let m = 1; m <= mei; m++) slots.push({ index: i++, role: "MEI", label: `MEI ${m}` });
  for (let a = 1; a <= ata; a++) slots.push({ index: i++, role: "ATA", label: `ATA ${a}` });
  return slots;
}

export const MAX_BENCH = 7;
