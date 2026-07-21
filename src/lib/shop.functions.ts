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
  SPEED_UNLOCK_COSTS,
  XP_BURST_MATCHES,
  XP_BURST_MULTIPLIER,
  type ItemKey,
} from "./shop.server";

async function loadCtx(context: { supabase: any; userId: string }) {
  const { data: trainer } = await context.supabase
    .from("trainers")
    .select("id, xp_burst_multiplier, xp_burst_matches_left")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (!trainer) throw new Error("Treinador não encontrado");
  const { data: academy } = await context.supabase
    .from("academies")
    .select("*")
    .eq("trainer_id", trainer.id)
    .maybeSingle();
  if (!academy) throw new Error("Academia não encontrada");
  return { trainer, academy };
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
    const { trainer, academy } = await loadCtx(context);
    const { data: items } = await context.supabase
      .from("items")
      .select("item_key, quantity")
      .eq("trainer_id", trainer.id);
    const { count: creaturesCount } = await context.supabase
      .from("creatures")
      .select("id", { count: "exact", head: true })
      .eq("owner_trainer_id", trainer.id);

    const inventory: Record<string, number> = {};
    for (const k of ITEM_KEYS) inventory[k] = 0;
    for (const row of items ?? []) inventory[row.item_key] = row.quantity;

    return {
      academy: {
        money: Number(academy.money),
        gems: academy.gems,
        builders: academy.builders,
        roster_slots: academy.roster_slots,
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
        speedUnlockCosts: SPEED_UNLOCK_COSTS,
        xpBurstMatches: XP_BURST_MATCHES,
      },
    };
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

    if (data.currency === "money") {
      if (Number(academy.money) < total) throw new Error("Dinheiro insuficiente.");
      await context.supabase
        .from("academies")
        .update({ money: Number(academy.money) - total })
        .eq("id", academy.id);
      await logTx(context, trainer.id, "expense", total, `Loja: ${spec.name} × ${data.quantity}`);
    } else {
      if (academy.gems < total) throw new Error("Gemas insuficientes.");
      await context.supabase
        .from("academies")
        .update({ gems: academy.gems - total })
        .eq("id", academy.id);
    }

    const { data: existing } = await context.supabase
      .from("items")
      .select("id, quantity")
      .eq("trainer_id", trainer.id)
      .eq("item_key", data.itemKey)
      .maybeSingle();

    if (existing) {
      await context.supabase
        .from("items")
        .update({ quantity: existing.quantity + data.quantity })
        .eq("id", existing.id);
    } else {
      await context.supabase.from("items").insert({
        trainer_id: trainer.id,
        item_key: data.itemKey,
        quantity: data.quantity,
      });
    }

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
    const { academy } = await loadCtx(context);
    const total = pkg.gems + pkg.bonus;
    await context.supabase
      .from("academies")
      .update({ gems: academy.gems + total })
      .eq("id", academy.id);
    return { ok: true, message: `+${total}💎 creditados (${pkg.name}).` };
  });

// ---------- Construtor extra ----------
export const buyExtraBuilder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { academy } = await loadCtx(context);
    if (academy.builders >= MAX_BUILDERS) throw new Error("Você já tem o máximo de construtores.");
    const cost = extraBuilderCostFor(academy.builders);
    if (cost == null) throw new Error("Você já tem o máximo de construtores.");
    if (academy.gems < cost) throw new Error("Gemas insuficientes.");
    await context.supabase
      .from("academies")
      .update({
        gems: academy.gems - cost,
        builders: academy.builders + 1,
      })
      .eq("id", academy.id);
    return { ok: true, message: `Novo construtor contratado por ${cost}💎!` };
  });

// ---------- Expandir elenco ----------
export const expandRoster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { academy } = await loadCtx(context);
    const next = ROSTER_EXPANSIONS.find((r) => r.from === academy.roster_slots);
    if (!next) throw new Error("Elenco já está no máximo.");
    if (academy.gems < next.gems) throw new Error("Gemas insuficientes.");
    await context.supabase
      .from("academies")
      .update({
        gems: academy.gems - next.gems,
        roster_slots: next.to,
      })
      .eq("id", academy.id);
    return { ok: true, message: `Elenco expandido para ${next.to} vagas.` };
  });

// ---------- Desbloquear velocidade permanentemente ----------
export const unlockSpeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { mode: "4x" | "instant" }) => ({
    mode: z.enum(["4x", "instant"]).parse(data.mode),
  }))
  .handler(async ({ data, context }) => {
    const { academy } = await loadCtx(context);
    const isFourX = data.mode === "4x";
    if (isFourX ? academy.paid_4x : academy.paid_instant) {
      return { ok: true, message: "Velocidade já desbloqueada." };
    }
    const cost = SPEED_UNLOCK_COSTS[data.mode];
    if (academy.gems < cost) throw new Error("Gemas insuficientes.");
    const patch = isFourX
      ? { gems: academy.gems - cost, paid_4x: true }
      : { gems: academy.gems - cost, paid_instant: true };
    await context.supabase.from("academies").update(patch).eq("id", academy.id);
    return { ok: true, message: `Velocidade ${data.mode} desbloqueada!` };
  });
