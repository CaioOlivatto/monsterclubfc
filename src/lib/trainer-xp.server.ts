// Sistema de Nível do Treinador — apenas prestígio.
// custo(nível n) = 350 * n. Nível máximo: 50.

export const MAX_TRAINER_LEVEL = 50;
export const LEVEL_STEP = 350;

/** XP total acumulado necessário para atingir o nível `n`. */
export function xpForLevel(n: number): number {
  const lvl = Math.max(0, Math.min(MAX_TRAINER_LEVEL, n));
  // soma de 350*i para i=1..n
  return (LEVEL_STEP * (lvl * (lvl + 1))) / 2;
}

/** Nível atingido com o XP total informado. */
export function levelFromXp(xp: number): number {
  let lvl = 0;
  while (lvl < MAX_TRAINER_LEVEL && xp >= xpForLevel(lvl + 1)) lvl++;
  return lvl;
}

/** Progresso do jogador no nível atual: XP dentro do nível e XP necessário. */
export function levelProgress(xp: number): {
  level: number;
  intoLevel: number;
  levelNeed: number;
  nextLevel: number;
  totalForNext: number;
  isMax: boolean;
} {
  const level = levelFromXp(xp);
  const isMax = level >= MAX_TRAINER_LEVEL;
  const base = xpForLevel(level);
  const totalForNext = xpForLevel(Math.min(MAX_TRAINER_LEVEL, level + 1));
  const levelNeed = Math.max(1, totalForNext - base);
  const intoLevel = Math.max(0, Math.min(levelNeed, xp - base));
  return { level, intoLevel, levelNeed, nextLevel: level + 1, totalForNext, isMax };
}

type XpSource =
  | "match_win"
  | "match_draw"
  | "match_loss"
  | "half_star"
  | "building"
  | "promotion"
  | "title";

const XP_BY_SOURCE: Record<XpSource, number> = {
  match_win: 100,
  match_draw: 40,
  match_loss: 10,
  half_star: 300,
  building: 500,
  promotion: 3000,
  title: 5000,
};

export function xpAmount(source: XpSource, times = 1) {
  return XP_BY_SOURCE[source] * Math.max(1, times);
}

/**
 * Credita XP ao treinador. Atualiza `xp`, `level`, `pending_level_ups` e
 * `season_xp_breakdown`. Retorna dados do progresso e se houve level-up.
 */
export async function awardTrainerXp(
  supabase: any,
  trainerId: string,
  source: XpSource,
  times = 1,
) {
  if (times <= 0) return { added: 0, levelUps: 0, newLevel: 0 };
  const add = xpAmount(source, times);

  const { data: t } = await supabase
    .from("trainers")
    .select("xp, level, pending_level_ups, season_xp_breakdown")
    .eq("id", trainerId)
    .maybeSingle();
  if (!t) return { added: 0, levelUps: 0, newLevel: 0 };

  const prevLevel = levelFromXp(t.xp ?? 0);
  const newXp = (t.xp ?? 0) + add;
  const newLevel = levelFromXp(newXp);
  const levelUps = Math.max(0, newLevel - prevLevel);

  const breakdown = { ...((t.season_xp_breakdown as any) ?? {}) };
  breakdown[source] = (breakdown[source] ?? 0) + add;

  await supabase
    .from("trainers")
    .update({
      xp: newXp,
      level: newLevel,
      pending_level_ups: (t.pending_level_ups ?? 0) + levelUps,
      season_xp_breakdown: breakdown,
    })
    .eq("id", trainerId);

  return { added: add, levelUps, newLevel };
}

/** Reseta o histórico de XP da temporada (chamado ao fim da temporada). */
export async function resetSeasonBreakdown(supabase: any, trainerId: string) {
  await supabase
    .from("trainers")
    .update({ season_xp_breakdown: {} })
    .eq("id", trainerId);
}
