/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { BUILDINGS, BUILDING_TYPES, stadiumCapacity, stadiumRevenueMultiplier, type BuildingType } from "./buildings.server";
import { awardTrainerXp } from "./trainer-xp.server";
import { levelProgress } from "./trainer-xp.server";
import { ATTENDANCE_DEMAND_CAP, TICKET_PRICE, maintenancePerMatch, revenueCapacity } from "./economy";
import { resolvePlayerDivision } from "./division.server";
import { adjustAcademyMoney } from "./academy-money.server";


async function getTrainer(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("trainers")
    .select("id, trainer_name, academy_name, level, xp, current_team_id, academies(money, gems, builders)")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Treinador não encontrado.");
  const academy = Array.isArray(data.academies) ? data.academies[0] : data.academies;
  return {
    id: data.id,
    trainerName: data.trainer_name,
    academyName: data.academy_name,
    level: data.level ?? 0,
    xp: data.xp ?? 0,
    currentTeamId: data.current_team_id,
    money: academy?.money ?? 0,
    gems: academy?.gems ?? 0,
    builders: academy?.builders ?? 1,
  };
}

/** Finaliza upgrades cujo tempo já passou. Idempotente. */
async function finalizeCompletedUpgrades(supabase: any, trainerId: string) {
  const nowIso = new Date().toISOString();
  const { data: done } = await supabase
    .from("buildings")
    .select("id, level, upgrade_completes_at")
    .eq("trainer_id", trainerId)
    .not("upgrade_completes_at", "is", null)
    .lte("upgrade_completes_at", nowIso);
  if (!done || done.length === 0) return;
  await Promise.all(done.flatMap((b: { id: string; level: number | null }) => [
    supabase
      .from("buildings")
      .update({ level: (b.level ?? 0) + 1, upgrade_completes_at: null })
      .eq("id", b.id),
    awardTrainerXp(supabase, trainerId, "building", 1),
  ]));
}


export const getBuildings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const trainer = await getTrainer(supabase, userId);
    await finalizeCompletedUpgrades(supabase, trainer.id);
    const division = await resolvePlayerDivision(supabase, trainer.id, trainer.currentTeamId);
    const progress = levelProgress(trainer.xp);

    const { data: rows } = await supabase
      .from("buildings")
      .select("id, building_type, level, upgrade_completes_at")
      .eq("trainer_id", trainer.id);

    const byType = new Map<string, { id?: string; level: number; upgrade_completes_at: string | null }>();
    for (const r of rows ?? []) {
      byType.set(r.building_type, {
        id: r.id,
        level: r.level ?? 0,
        upgrade_completes_at: r.upgrade_completes_at,
      });
    }

    const items = BUILDING_TYPES.map((type) => {
      const spec = BUILDINGS[type];
      const state = byType.get(type) ?? { level: 0, upgrade_completes_at: null };
      const upgrading = !!state.upgrade_completes_at;
      const nextLevel = state.level + 1;
      const canUpgrade = state.level < spec.maxLevel;
      const currentMaintenance = maintenancePerMatch(division, type, state.level);
      const nextMaintenance = canUpgrade ? maintenancePerMatch(division, type, nextLevel) : null;
      const stadiumSeasonReturn = type === "estadio" && canUpgrade
        ? Math.round(
            (revenueCapacity(division, stadiumCapacity(nextLevel)) * stadiumRevenueMultiplier(nextLevel) - revenueCapacity(division, stadiumCapacity(state.level)) * stadiumRevenueMultiplier(state.level)) * 0.73 * TICKET_PRICE[division] * 13 -
            ((nextMaintenance ?? 0) - currentMaintenance) * 26,
          )
        : null;
      return {
        type,
        name: spec.name,
        description: spec.description,
        level: state.level,
        maxLevel: spec.maxLevel,
        currentEffect: spec.effectByLevel(state.level),
        nextEffect: canUpgrade ? spec.effectByLevel(nextLevel) : null,
        nextCost: canUpgrade ? spec.cost(nextLevel) : null,
        nextDurationSec: canUpgrade ? spec.duration(nextLevel) : null,
        maintenancePerMatch: currentMaintenance,
        nextMaintenancePerMatch: nextMaintenance,
        estimatedSeasonReturn: stadiumSeasonReturn,
        divisionDemandCap: type === "estadio" ? ATTENDANCE_DEMAND_CAP[division] : null,
        upgrading,
        completes_at: state.upgrade_completes_at,
      };
    });

    // Slot de builder ativo?
    const anyUpgrading = items.some((i) => i.upgrading);

    return {
      trainer: {
        name: trainer.trainerName,
        academyName: trainer.academyName,
        level: progress.level,
        xpIntoLevel: progress.intoLevel,
        xpForNextLevel: progress.levelNeed,
        isMaxLevel: progress.isMax,
      },
      money: trainer.money,
      gems: trainer.gems,
      builders: trainer.builders,
      builders_busy: anyUpgrading ? 1 : 0,
      division,
      buildings: items,
    };
  });

export const startUpgrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ type: z.enum(["ct_treino", "estadio", "centro_medico"]) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const trainer = await getTrainer(supabase, userId);
    await finalizeCompletedUpgrades(supabase, trainer.id);

    // Regra: 1 construtor ativo por vez.
    const type = data.type as BuildingType;
    const [busyResult, existingResult] = await Promise.all([
      supabase
        .from("buildings")
        .select("id")
        .eq("trainer_id", trainer.id)
        .not("upgrade_completes_at", "is", null)
        .limit(1),
      supabase
        .from("buildings")
        .select("id, level")
        .eq("trainer_id", trainer.id)
        .eq("building_type", type)
        .maybeSingle(),
    ]);
    const { data: busy } = busyResult;
    if (busy && busy.length > 0) {
      throw new Error("Seu construtor já está ocupado com outra obra.");
    }

    const spec = BUILDINGS[type];
    const { data: existing } = existingResult;

    const currentLevel = existing?.level ?? 0;
    if (currentLevel >= spec.maxLevel) throw new Error("Nível máximo já atingido.");

    const nextLevel = currentLevel + 1;
    const cost = spec.cost(nextLevel);
    const durationSec = spec.duration(nextLevel);

    if (trainer.money < cost) throw new Error("Dinheiro insuficiente para essa obra.");

    const completesAt = new Date(Date.now() + durationSec * 1000).toISOString();

    await adjustAcademyMoney(supabase, trainer.id, -cost);

    if (existing) {
      const { error } = await supabase
        .from("buildings")
        .update({ upgrade_completes_at: completesAt })
        .eq("id", existing.id);
      if (error) {
        await adjustAcademyMoney(supabase, trainer.id, cost).catch(() => undefined);
        throw error;
      }
    } else {
      const { error } = await supabase
        .from("buildings")
        .insert({
          trainer_id: trainer.id,
          team_id: (trainer.currentTeamId as any) || null,
          building_type: type,
          level: 0,
          upgrade_completes_at: completesAt,
        });
      if (error) {
        await adjustAcademyMoney(supabase, trainer.id, cost).catch(() => undefined);
        throw error;
      }
    }

    await supabase.from("financial_transactions").insert({
      trainer_id: trainer.id,
      transaction_type: "expense",
      amount: cost,
      description: `Obra: ${spec.name} nível ${nextLevel}`,
    });

    return { completes_at: completesAt, target_level: nextLevel };
  });

export const finishNowWithGems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ type: z.enum(["ct_treino", "estadio", "centro_medico"]) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const trainer = await getTrainer(supabase, userId);

    const { data: b } = await supabase
      .from("buildings")
      .select("id, level, upgrade_completes_at")
      .eq("trainer_id", trainer.id)
      .eq("building_type", data.type)
      .maybeSingle();
    if (!b || !b.upgrade_completes_at) throw new Error("Nenhuma obra em andamento aqui.");

    const remainingMs = new Date(b.upgrade_completes_at).getTime() - Date.now();
    if (remainingMs <= 0) {
      // já acabou — só finaliza
      await supabase
        .from("buildings")
        .update({ level: (b.level ?? 0) + 1, upgrade_completes_at: null })
        .eq("id", b.id);
      await awardTrainerXp(supabase, trainer.id, "building", 1);
      return { spent: 0 };
    }
    // Balanceamento §5.3: 1 gema a cada 10 minutos restantes (mínimo 1).
    const cost = Math.max(1, Math.ceil(remainingMs / (10 * 60 * 1000)));
    if (trainer.gems < cost) throw new Error(`Você precisa de ${cost} 💎 para acelerar.`);

    await supabase
      .from("academies")
      .update({ gems: trainer.gems - cost })
      .eq("trainer_id", trainer.id);
    await supabase
      .from("buildings")
      .update({ level: (b.level ?? 0) + 1, upgrade_completes_at: null })
      .eq("id", b.id);

    await supabase.from("financial_transactions").insert({
      trainer_id: trainer.id,
      transaction_type: "expense",
      amount: 0,
      description: `Obra acelerada com ${cost} 💎`,
    });

    await awardTrainerXp(supabase, trainer.id, "building", 1);

    return { spent: cost };
  });


export const getFinancials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const trainer = await getTrainer(supabase, userId);
    const { data } = await supabase
      .from("financial_transactions")
      .select("id, transaction_type, amount, description, created_at")
      .eq("trainer_id", trainer.id)
      .order("created_at", { ascending: false })
      .limit(30);
    return {
      money: trainer.money,
      gems: trainer.gems,
      transactions: data ?? [],
    };
  });
