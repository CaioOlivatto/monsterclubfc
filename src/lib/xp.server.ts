// Distribuição de XP pós-partida (GDD §6.1) + curva de meia-estrela ajustada à carreira (§10.3):
//   custo(n) = round(800 * 1.25^(n-1))
// CT de Treinamento: +5% por nível.  Burst de XP: multiplicador variável.

import { awardTrainerXp } from "./trainer-xp.server";


const HALF_STAR_COSTS: number[] = Array.from({ length: 10 }, (_, i) =>
  Math.round(800 * Math.pow(1.25, i)),
);

/** Custo em XP para atingir a próxima meia-estrela (n = 1..10). */
export function halfStarCost(n: number): number {
  if (n < 1 || n > 10) return Infinity;
  return HALF_STAR_COSTS[n - 1];
}

/** Total de meia-estrelas que os `xp` acumulados destravam (0..10). */
export function halfStarsFromXp(xp: number): number {
  let acc = 0;
  for (let i = 0; i < HALF_STAR_COSTS.length; i++) {
    acc += HALF_STAR_COSTS[i];
    if (xp < acc) return i;
  }
  return 10;
}

/** Soma total de XP para chegar em N meia-estrelas (0..10). */
export function xpForHalfStars(n: number): number {
  let acc = 0;
  for (let i = 0; i < Math.min(10, Math.max(0, n)); i++) acc += HALF_STAR_COSTS[i];
  return acc;
}

export async function applyPostMatchXp(
  supabase: any,
  trainerId: string,
  opts: {
    starterIds: string[];
    enteredReserveIds: string[];
    unusedReserveIds: string[];
    outcome: "W" | "D" | "L";
    energy_loss: Record<string, number>;
  },
) {
  const base = opts.outcome === "W" ? 100 : opts.outcome === "D" ? 50 : 0;

  const { data: buildings } = await supabase
    .from("buildings")
    .select("building_type, level")
    .eq("trainer_id", trainerId);
  const ctLevel =
    (buildings ?? []).find((b: any) => b.building_type === "ct_treino")?.level ?? 0;
  const ctBonus = 1 + ctLevel * 0.05;

  const { data: trainer } = await supabase
    .from("trainers")
    .select("xp_burst_multiplier, xp_burst_matches_left")
    .eq("id", trainerId)
    .maybeSingle();
  const burstLeft = trainer?.xp_burst_matches_left ?? 0;
  const burstMult = burstLeft > 0 ? Number(trainer?.xp_burst_multiplier ?? 1) : 1;

  const starterXp = Math.round(base * ctBonus * burstMult);
  const enteredXp = Math.round(base * 0.5 * ctBonus * burstMult);
  const benchXp = opts.outcome === "W" ? Math.round(25 * ctBonus * burstMult) : 0;

  const targets: Array<{ id: string; add: number }> = [];
  for (const id of opts.starterIds) targets.push({ id, add: starterXp });
  for (const id of opts.enteredReserveIds) targets.push({ id, add: enteredXp });
  for (const id of opts.unusedReserveIds) targets.push({ id, add: benchXp });

  const allIds = Array.from(new Set(targets.map((t) => t.id).concat(Object.keys(opts.energy_loss))));
  if (!allIds.length) {
    await tickBurst(supabase, trainerId, burstLeft);
    return;
  }

  const { data: creatures } = await supabase
    .from("creatures")
    .select("id, xp, pending_half_stars, half_stars_earned, energy")
    .in("id", allIds)
    .eq("owner_trainer_id", trainerId);

  for (const c of creatures ?? []) {
    const add = targets.filter((t) => t.id === c.id).reduce((a, t) => a + t.add, 0);
    const newXp = (c.xp ?? 0) + add;
    const totalHalfStars = halfStarsFromXp(newXp);
    const applied = c.half_stars_earned ?? 0;
    const pending = Math.max(0, Math.min(10 - applied, totalHalfStars - applied));
    const loss = opts.energy_loss[c.id] ?? 0;
    const newEnergy = Math.max(0, (c.energy ?? 100) - loss);
    await supabase
      .from("creatures")
      .update({ xp: newXp, pending_half_stars: pending, energy: newEnergy })
      .eq("id", c.id);
  }

  await tickBurst(supabase, trainerId, burstLeft);
}

async function tickBurst(supabase: any, trainerId: string, current: number) {
  if (current <= 0) return;
  const next = current - 1;
  const patch: Record<string, any> = { xp_burst_matches_left: next };
  if (next === 0) patch.xp_burst_multiplier = 1;
  await supabase.from("trainers").update(patch).eq("id", trainerId);
}

export async function insertMessage(
  supabase: any,
  trainerId: string,
  kind: string,
  title: string,
  body: string,
) {
  try {
    await supabase.from("messages").insert({ trainer_id: trainerId, kind, title, body });
  } catch (e) {
    console.error("insertMessage error", e);
  }
}
