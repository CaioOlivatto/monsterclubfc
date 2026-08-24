import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  ITEMS,
  ITEM_KEYS,
  GEM_PACKAGES,
  EXTRA_BUILDER_COSTS,
  extraBuilderCostFor,
  MAX_BUILDERS,
  ROSTER_EXPANSIONS,
  SPEED_REAL_MONEY_PRODUCTS,
  SPEED_GEM_UNLOCKS,
  XP_BURST_MATCHES,
  XP_BURST_MULTIPLIER,
  GEM_TO_MONEY_RATE,
  GEM_EXCHANGE_PRESETS,
  DIVISION_EXCHANGE_MULT,
  gemExchangeRateFor,
  MORALE_BOOST_INDIVIDUAL,
  MORALE_BOOST_COLLECTIVE,
  type ItemKey,
  type ExchangeDivision,
} from "./shop.server";
import { recordTelemetryBestEffort } from "./telemetry.server";


async function loadCtx(context: { supabase: any; userId: string }) {
  const { data: trainer } = await context.supabase
    .from("trainers")
    .select("id, xp_burst_multiplier, xp_burst_matches_left, current_team_id")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (!trainer) throw new Error("Treinador não encontrado");
  const academyPromise = context.supabase
    .from("academies")
    .select("*")
    .eq("trainer_id", trainer.id)
    .maybeSingle();
  const divisionModulePromise = import("./division.server");
  const [{ data: academy }, { resolvePlayerDivision }] = await Promise.all([
    academyPromise,
    divisionModulePromise,
  ]);
  if (!academy) throw new Error("Academia não encontrada");
  const division = (await resolvePlayerDivision(
    context.supabase,
    trainer.id,
    trainer.current_team_id,
  )) as ExchangeDivision;

  return { trainer, academy, division };
}

async function logTx(
  context: { supabase: any },
  trainerId: string,
  type: "expense" | "income",
  amount: number,
  description: string,
) {
  await context.supabase.from("financial_transactions").insert({
    trainer_id: trainerId,
    transaction_type: type,
    amount,
    description,
  });
}

// ---------- Estado da loja ----------
export const getShopState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { trainer, academy, division } = await loadCtx(context);
    const [itemsResult, creaturesResult] = await Promise.all([
      context.supabase
        .from("items")
        .select("item_key, quantity")
        .eq("trainer_id", trainer.id),
      context.supabase
        .from("creatures")
        .select("id", { count: "exact", head: true })
        .eq("owner_trainer_id", trainer.id),
    ]);
    const { data: items } = itemsResult;
    const { count: creaturesCount } = creaturesResult;

    const inventory: Record<string, number> = {};
    for (const k of ITEM_KEYS) inventory[k] = 0;
    for (const row of items ?? []) inventory[row.item_key] = row.quantity;

    return {
      academy: {
        money: Number(academy.money),
        gems: academy.gems,
        builders: academy.builders,
        roster_slots: academy.roster_slots,
        paid_2x: !!academy.paid_2x,
        paid_4x: !!academy.paid_4x,
        paid_instant: !!academy.paid_instant,
      },
      trainer: {
        xp_burst_multiplier: Number(trainer.xp_burst_multiplier ?? 1),
        xp_burst_matches_left: trainer.xp_burst_matches_left ?? 0,
      },
      creaturesCount: creaturesCount ?? 0,
      inventory,
      catalogs: {
        items: Object.values(ITEMS),
        gemPackages: GEM_PACKAGES,
        rosterExpansions: ROSTER_EXPANSIONS,
        extraBuilderCosts: EXTRA_BUILDER_COSTS,
        nextBuilderCost: extraBuilderCostFor(academy.builders ?? 1),
        maxBuilders: MAX_BUILDERS,
        speedProducts: SPEED_REAL_MONEY_PRODUCTS,
        speedGemUnlocks: SPEED_GEM_UNLOCKS,
        xpBurstMatches: XP_BURST_MATCHES,
        gemToMoneyRate: GEM_TO_MONEY_RATE,
        gemToMoneyRateEffective: gemExchangeRateFor(division),
        gemExchangeMultiplier: DIVISION_EXCHANGE_MULT[division],
        gemExchangeDivision: division,
        gemExchangePresets: GEM_EXCHANGE_PRESETS,
      },
    };
  });

export const exchangeGemsForMoney = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { gems: number }) => ({
    gems: z.number().int().min(1).max(100000).parse(data.gems),
  }))
  .handler(async ({ data, context }) => {
    void data;
    void context;
    throw new Error("A troca de gemas por dinheiro foi encerrada para preservar o equilíbrio competitivo.");
  });


// ---------- Comprar item ----------
export const buyItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { itemKey: ItemKey; currency: "money" | "gems"; quantity?: number }) => ({
    itemKey: z.enum(ITEM_KEYS as [ItemKey, ...ItemKey[]]).parse(data.itemKey),
    currency: z.enum(["money", "gems"]).parse(data.currency),
    quantity: Math.max(1, Math.min(20, data.quantity ?? 1)),
  }))
  .handler(async ({ data, context }) => {
    const { trainer, academy } = await loadCtx(context);
    const spec = ITEMS[data.itemKey];
    const unit = data.currency === "money" ? spec.moneyPrice : spec.gemPrice;
    if (unit == null) throw new Error("Este item não aceita essa forma de pagamento.");
    const total = unit * data.quantity;

    const { error } = await context.supabase.rpc("buy_shop_item_atomic" as any, {
      p_trainer_id: trainer.id,
      p_item_key: data.itemKey,
      p_currency: data.currency,
      p_quantity: data.quantity,
    });
    if (error) throw error;

    return { ok: true, message: `Comprou ${data.quantity}× ${spec.name}.` };
  });

// ---------- Usar item ----------
export const useItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { itemKey: ItemKey; creatureId?: string }) => ({
    itemKey: z.enum(ITEM_KEYS as [ItemKey, ...ItemKey[]]).parse(data.itemKey),
    creatureId: data.creatureId ? z.string().uuid().parse(data.creatureId) : undefined,
  }))
  .handler(async ({ data, context }) => {
    const { trainer } = await loadCtx(context);
    const { data: inv } = await context.supabase
      .from("items")
      .select("id, quantity")
      .eq("trainer_id", trainer.id)
      .eq("item_key", data.itemKey)
      .maybeSingle();
    if (!inv || inv.quantity < 1) throw new Error("Você não possui esse item.");

    let msg = "";

    if (data.itemKey === "potion_individual") {
      if (!data.creatureId) throw new Error("Escolha uma criatura para usar a poção.");
      const { data: c } = await context.supabase
        .from("creatures")
        .select("id, name, energy, owner_trainer_id")
        .eq("id", data.creatureId)
        .maybeSingle();
      if (!c || c.owner_trainer_id !== trainer.id) throw new Error("Criatura inválida.");
      await context.supabase.from("creatures").update({ energy: 100 }).eq("id", c.id);
      msg = `${c.name} está com energia total.`;
    } else if (data.itemKey === "potion_collective") {
      const { data: crs } = await context.supabase
        .from("creatures")
        .select("id, energy")
        .eq("owner_trainer_id", trainer.id);
      for (const cr of crs ?? []) {
        await context.supabase
          .from("creatures")
          .update({ energy: Math.min(100, cr.energy + 15) })
          .eq("id", cr.id);
      }
      msg = "Todo o elenco recuperou +15% de energia.";
    } else if (data.itemKey === "vital_crystal") {
      const { data: crs } = await context.supabase
        .from("creatures")
        .select("id, energy")
        .eq("owner_trainer_id", trainer.id);
      for (const cr of crs ?? []) {
        await context.supabase
          .from("creatures")
          .update({ energy: Math.min(100, cr.energy + 25) })
          .eq("id", cr.id);
      }
      msg = "Todo o elenco recuperou +25% de energia.";
    } else if (data.itemKey === "morale_individual") {
      if (!data.creatureId) throw new Error("Escolha uma criatura para usar o Ânimo.");
      const { data: c } = await context.supabase
        .from("creatures")
        .select("id, name, morale, owner_trainer_id")
        .eq("id", data.creatureId)
        .maybeSingle();
      if (!c || c.owner_trainer_id !== trainer.id) throw new Error("Criatura inválida.");
      const cur = Math.max(0, Math.min(100, c.morale ?? 50));
      const gain = Math.round(MORALE_BOOST_INDIVIDUAL * Math.max(0, 1 - cur / 120));
      const next = Math.max(0, Math.min(100, cur + gain));
      await context.supabase.from("creatures").update({ morale: next }).eq("id", c.id);
      msg = `${c.name}: moral ${cur} → ${next} (+${gain}).`;
    } else if (data.itemKey === "morale_collective") {
      const { data: crs } = await context.supabase
        .from("creatures")
        .select("id, morale")
        .eq("owner_trainer_id", trainer.id);
      let total = 0;
      for (const cr of crs ?? []) {
        const cur = Math.max(0, Math.min(100, cr.morale ?? 50));
        const gain = Math.round(MORALE_BOOST_COLLECTIVE * Math.max(0, 1 - cur / 120));
        const next = Math.max(0, Math.min(100, cur + gain));
        if (next !== cur) {
          await context.supabase.from("creatures").update({ morale: next }).eq("id", cr.id);
          total += gain;
        }
      }
      msg = `Elenco animado (+${total} de moral no total, com ganhos decrescentes).`;
    } else if (
      data.itemKey === "xp_burst_5" ||
      data.itemKey === "xp_burst_10" ||
      data.itemKey === "xp_burst_15"
    ) {
      const mult = XP_BURST_MULTIPLIER[data.itemKey];
      await context.supabase
        .from("trainers")
        .update({
          xp_burst_multiplier: mult,
          xp_burst_matches_left: XP_BURST_MATCHES,
        })
        .eq("id", trainer.id);
      const pct = Math.round((mult - 1) * 100);
      msg = `Impulso de XP +${pct}% ativo pelas próximas ${XP_BURST_MATCHES} partidas!`;
    }

    await context.supabase.from("items").update({ quantity: inv.quantity - 1 }).eq("id", inv.id);
    return { ok: true, message: msg };
  });

// ---------- Comprar pacote de Gemas ----------
export const buyGemPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { packageId: string }) => ({
    packageId: z.string().parse(data.packageId),
  }))
  .handler(async ({ data, context }) => {
    const pkg = GEM_PACKAGES.find((p) => p.id === data.packageId);
    if (!pkg) throw new Error("Pacote inválido.");
    void context;
    throw new Error("Os pagamentos reais ainda não foram ativados. Nenhuma cobrança foi realizada.");
  });

// ---------- Construtor extra ----------
export const buyExtraBuilder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("buy_academy_capacity_atomic", {
      p_kind: "builder", p_idempotency_key: `builder:${crypto.randomUUID()}`,
    });
    if (error) throw error;
    return { ok: true, ...data };
  });

// ---------- Expandir elenco ----------
export const expandRoster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("buy_academy_capacity_atomic", {
      p_kind: "roster", p_idempotency_key: `roster:${crypto.randomUUID()}`,
    });
    if (error) throw error;
    return { ok: true, ...data };
  });

// ---------- Desbloquear velocidade permanentemente ----------
export const unlockSpeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { mode: "2x" | "4x" | "instant" | "bundle" }) => ({
    mode: z.enum(["2x", "4x", "instant", "bundle"]).parse(data.mode),
  }))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("unlock_match_speed_with_gems" as any, {
      p_mode: data.mode,
    });
    if (error) throw error;
    await recordTelemetryBestEffort(context.supabase, "speed_unlocked", "/shop", {
      mode: data.mode,
    });
    return {
      ok: true,
      message: data.mode === "bundle"
        ? "Pacote completo de velocidades desbloqueado."
        : `Velocidade ${data.mode} desbloqueada permanentemente.`,
      result,
    };
  });
