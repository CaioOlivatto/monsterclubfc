// Sistema de Descanso — cargas gratuitas compartilhadas + preço crescente em gemas.
// - Pool: 3 cargas grátis compartilhadas por todo o elenco do treinador.
// - Cada uso: temporizador de 15 minutos, então +50 pts de energia (cap 100).
// - Pool zera → reset automático 12h depois; contador de uso pago também reseta.
// - Uso pago (pool zerada): 15 → 25 → 40 → 60 (teto) gemas.
// - Rush do temporizador de 15min: 1 gema por 10min restantes (separado).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const REST_DURATION_MS = 15 * 60 * 1000;
export const REST_ENERGY_GAIN = 50;
export const REST_POOL_MAX = 3;
export const REST_POOL_RESET_MS = 12 * 60 * 60 * 1000;

/** Custo em gemas do próximo uso pago dado quantos usos pagos já ocorreram no ciclo. */
export function paidCostForNextUse(paidUsesSoFar: number): number {
  const table = [15, 25, 40];
  if (paidUsesSoFar < table.length) return table[paidUsesSoFar];
  return 60;
}

type Trainer = {
  id: string;
  rest_free_charges: number;
  rest_pool_zeroed_at: string | null;
  rest_paid_uses: number;
  academyId: string;
  gems: number;
};

async function loadTrainer(supabase: any, userId: string): Promise<Trainer> {
  const { data, error } = await supabase
    .from("trainers")
    .select("id, rest_free_charges, rest_pool_zeroed_at, rest_paid_uses, academies(id, gems)")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Treinador não encontrado.");
  return {
    id: data.id,
    rest_free_charges: data.rest_free_charges ?? REST_POOL_MAX,
    rest_pool_zeroed_at: data.rest_pool_zeroed_at ?? null,
    rest_paid_uses: data.rest_paid_uses ?? 0,
    academyId: data.academies?.id,
    gems: data.academies?.gems ?? 0,
  };
}

/** Se a pool estiver zerada há 12h+, restaura para 3 e zera o contador de pago. */
async function maybeResetPool(supabase: any, t: Trainer): Promise<Trainer> {
  if (t.rest_free_charges > 0) return t;
  if (!t.rest_pool_zeroed_at) return t;
  const elapsed = Date.now() - new Date(t.rest_pool_zeroed_at).getTime();
  if (elapsed < REST_POOL_RESET_MS) return t;
  const { error } = await supabase
    .from("trainers")
    .update({ rest_free_charges: REST_POOL_MAX, rest_paid_uses: 0, rest_pool_zeroed_at: null })
    .eq("id", t.id);
  if (error) throw error;
  return { ...t, rest_free_charges: REST_POOL_MAX, rest_paid_uses: 0, rest_pool_zeroed_at: null };
}

/** Aplica +50 energia nas criaturas cujo timer expirou. */
export async function sweepRests(supabase: any, trainerId: string): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data: done } = await supabase
    .from("creatures")
    .select("id, energy")
    .eq("owner_trainer_id", trainerId)
    .not("rest_completes_at", "is", null)
    .lte("rest_completes_at", nowIso);
  if (!done || !done.length) return 0;
  await Promise.all(
    done.map((c: { id: string; energy: number | null }) => {
      const next = Math.min(100, (c.energy ?? 0) + REST_ENERGY_GAIN);
      return supabase
        .from("creatures")
        .update({ energy: next, rest_completes_at: null })
        .eq("id", c.id);
    }),
  );
  return done.length;
}

export const getRestState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    let t = await loadTrainer(supabase, userId);
    t = await maybeResetPool(supabase, t);
    await sweepRests(supabase, t.id);
    const nextFreeAt =
      t.rest_free_charges <= 0 && t.rest_pool_zeroed_at
        ? new Date(new Date(t.rest_pool_zeroed_at).getTime() + REST_POOL_RESET_MS).toISOString()
        : null;
    return {
      free_charges: t.rest_free_charges,
      pool_max: REST_POOL_MAX,
      next_free_at: nextFreeAt,
      paid_uses: t.rest_paid_uses,
      next_paid_cost: paidCostForNextUse(t.rest_paid_uses),
      duration_ms: REST_DURATION_MS,
      gain: REST_ENERGY_GAIN,
      gems: t.gems,
    };
  });

export const startRest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ creatureId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let t = await loadTrainer(supabase, userId);
    t = await maybeResetPool(supabase, t);
    await sweepRests(supabase, t.id);

    const { data: c } = await supabase
      .from("creatures")
      .select("id, retired, energy, rest_completes_at")
      .eq("id", data.creatureId)
      .eq("owner_trainer_id", t.id)
      .maybeSingle();
    if (!c) throw new Error("Criatura não encontrada.");
    if (c.retired) throw new Error("Criatura aposentada.");
    if (c.rest_completes_at && new Date(c.rest_completes_at).getTime() > Date.now()) {
      throw new Error("Esta criatura já está descansando.");
    }
    if ((c.energy ?? 0) >= 100) throw new Error("Energia já está no máximo.");

    let paidCost = 0;
    if (t.rest_free_charges > 0) {
      const nextFree = t.rest_free_charges - 1;
      const update: any = { rest_free_charges: nextFree };
      if (nextFree === 0) update.rest_pool_zeroed_at = new Date().toISOString();
      const { error } = await supabase.from("trainers").update(update).eq("id", t.id);
      if (error) throw error;
    } else {
      paidCost = paidCostForNextUse(t.rest_paid_uses);
      if (t.gems < paidCost) throw new Error(`Você precisa de ${paidCost} 💎 para este descanso extra.`);
      await supabase.from("academies").update({ gems: t.gems - paidCost }).eq("id", t.academyId);
      await supabase.from("trainers").update({ rest_paid_uses: t.rest_paid_uses + 1 }).eq("id", t.id);
    }

    const completes = new Date(Date.now() + REST_DURATION_MS).toISOString();
    const { error } = await supabase
      .from("creatures")
      .update({ rest_completes_at: completes })
      .eq("id", c.id);
    if (error) throw error;
    return { completes_at: completes, paid_cost: paidCost };
  });

export const rushRest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ creatureId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const t = await loadTrainer(supabase, userId);
    const { data: c } = await supabase
      .from("creatures")
      .select("id, rest_completes_at")
      .eq("id", data.creatureId)
      .eq("owner_trainer_id", t.id)
      .maybeSingle();
    if (!c || !c.rest_completes_at) throw new Error("Nenhum descanso em andamento.");
    const remainingMs = new Date(c.rest_completes_at).getTime() - Date.now();
    if (remainingMs <= 0) {
      await sweepRests(supabase, t.id);
      return { spent: 0 };
    }
    const cost = Math.max(1, Math.ceil(remainingMs / (10 * 60 * 1000)));
    if (t.gems < cost) throw new Error(`Você precisa de ${cost} 💎 para acelerar.`);
    await supabase.from("academies").update({ gems: t.gems - cost }).eq("id", t.academyId);
    await supabase
      .from("creatures")
      .update({ rest_completes_at: new Date().toISOString() })
      .eq("id", c.id);
    await sweepRests(supabase, t.id);
    return { spent: cost };
  });

export const cancelRest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ creatureId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const t = await loadTrainer(supabase, userId);
    await supabase
      .from("creatures")
      .update({ rest_completes_at: null })
      .eq("id", data.creatureId)
      .eq("owner_trainer_id", t.id);
    return { ok: true };
  });
