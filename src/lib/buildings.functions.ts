import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { BUILDINGS, BUILDING_TYPES, MAX_LEVEL, type BuildingType } from "./buildings.server";
import { awardTrainerXp } from "./trainer-xp.server";


async function getTrainer(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("trainers")
    .select("id, academies(money, gems, builders)")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Treinador não encontrado.");
  const academy = Array.isArray(data.academies) ? data.academies[0] : data.academies;
  return { id: data.id, money: academy?.money ?? 0, gems: academy?.gems ?? 0, builders: academy?.builders ?? 1 };
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
  for (const b of done) {
    await supabase
      .from("buildings")
      .update({ level: (b.level ?? 0) + 1, upgrade_completes_at: null })
      .eq("id", b.id);
    await awardTrainerXp(supabase, trainerId, "building", 1);
  }
}


export const getBuildings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const trainer = await getTrainer(supabase, userId);
    await finalizeCompletedUpgrades(supabase, trainer.id);

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
      const canUpgrade = state.level < MAX_LEVEL;
      return {
        type,
        name: spec.name,
        description: spec.description,
        level: state.level,
        maxLevel: MAX_LEVEL,
        currentEffect: spec.effectByLevel(state.level),
        nextEffect: canUpgrade ? spec.effectByLevel(nextLevel) : null,
        nextCost: canUpgrade ? spec.cost(nextLevel) : null,
        nextDurationSec: canUpgrade ? spec.duration(nextLevel) : null,
        upgrading,
        completes_at: state.upgrade_completes_at,
      };
    });

    // Slot de builder ativo?
    const anyUpgrading = items.some((i) => i.upgrading);

    return {
      money: trainer.money,
      gems: trainer.gems,
      builders: trainer.builders,
      builders_busy: anyUpgrading ? 1 : 0,
      buildings: items,
    };
  });

export const startUpgrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ type: z.enum(["ct_treino", "ct_elemental", "estadio", "centro_medico"]) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const trainer = await getTrainer(supabase, userId);
    await finalizeCompletedUpgrades(supabase, trainer.id);

    // Regra: 1 construtor ativo por vez.
    const { data: busy } = await supabase
      .from("buildings")
      .select("id")
      .eq("trainer_id", trainer.id)
      .not("upgrade_completes_at", "is", null)
      .limit(1);
    if (busy && busy.length > 0) {
      throw new Error("Seu construtor já está ocupado com outra obra.");
    }

    const type = data.type as BuildingType;
    const spec = BUILDINGS[type];

    const { data: existing } = await supabase
      .from("buildings")
      .select("id, level")
      .eq("trainer_id", trainer.id)
      .eq("building_type", type)
      .maybeSingle();

    const currentLevel = existing?.level ?? 0;
    if (currentLevel >= MAX_LEVEL) throw new Error("Nível máximo já atingido.");

    const nextLevel = currentLevel + 1;
    const cost = spec.cost(nextLevel);
    const durationSec = spec.duration(nextLevel);

    if (trainer.money < cost) throw new Error("Dinheiro insuficiente para essa obra.");

    const completesAt = new Date(Date.now() + durationSec * 1000).toISOString();

    if (existing) {
      const { error } = await supabase
        .from("buildings")
        .update({ upgrade_completes_at: completesAt })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("buildings")
        .insert({
          trainer_id: trainer.id,
          building_type: type,
          level: 0,
          upgrade_completes_at: completesAt,
        });
      if (error) throw error;
    }

    // Debita e registra
    const { error: aErr } = await supabase
      .from("academies")
      .update({ money: trainer.money - cost })
      .eq("trainer_id", trainer.id);
    if (aErr) throw aErr;

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
    z.object({ type: z.enum(["ct_treino", "ct_elemental", "estadio", "centro_medico"]) }).parse(raw),
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
