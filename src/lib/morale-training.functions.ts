// Sessões de moral GRATUITAS por tempo — Balanceamento §Moral.
// - Sessão Individual (1 criatura): 4h → aplica +25 moral nominal (com ganhos decrescentes).
// - Reunião de Equipe (todo elenco): 8h → aplica +15 moral nominal (com ganhos decrescentes).
// Fórmula: ganho_real = round(nominal × (1 - moral_atual / 120)).
// Pode ser acelerado com gemas (1💎 por 10min restantes), como obras.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const MORALE_SESSION_INDIVIDUAL_MS = 4 * 60 * 60 * 1000;
export const MORALE_MEETING_COLLECTIVE_MS = 4 * 60 * 60 * 1000;
export const MORALE_GENERAL_MS = 4 * 60 * 60 * 1000;
export const MORALE_SESSION_INDIVIDUAL_BOOST = 25;
export const MORALE_MEETING_COLLECTIVE_BOOST = 15;
export const MORALE_GENERAL_BOOST = 25;

function applyDiminishing(current: number, nominal: number): number {
  const cur = Math.max(0, Math.min(100, current ?? 50));
  const mul = Math.max(0, 1 - cur / 120);
  return Math.max(0, Math.min(100, Math.round(cur + nominal * mul)));
}

async function loadTrainer(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("trainers")
    .select("id, academies(id, gems, morale_meeting_completes_at)")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Treinador não encontrado.");
  return {
    id: data.id as string,
    academyId: data.academies?.id as string,
    gems: (data.academies?.gems ?? 0) as number,
    meetingAt: (data.academies?.morale_meeting_completes_at ?? null) as string | null,
  };
}

/** Aplica sessões individuais vencidas do treinador. */
export async function sweepMoraleSessions(supabase: any, trainerId: string) {
  const nowIso = new Date().toISOString();
  const { data: done } = await supabase
    .from("creatures")
    .select("id, morale")
    .eq("owner_trainer_id", trainerId)
    .not("morale_session_completes_at", "is", null)
    .lte("morale_session_completes_at", nowIso);
  if (!done || !done.length) return 0;
  await Promise.all(
    done.map((c: { id: string; morale: number | null }) => {
      const next = applyDiminishing(c.morale ?? 50, MORALE_SESSION_INDIVIDUAL_BOOST);
      return supabase
        .from("creatures")
        .update({ morale: next, morale_session_completes_at: null })
        .eq("id", c.id);
    }),
  );
  return done.length;
}

/** Aplica reunião coletiva vencida da academia (se houver). */
export async function sweepMoraleMeeting(supabase: any, trainerId: string, academyId: string, meetingAt: string | null) {
  if (!meetingAt) return 0;
  if (new Date(meetingAt).getTime() > Date.now()) return 0;
  const { data: creatures } = await supabase
    .from("creatures")
    .select("id, morale, retired")
    .eq("owner_trainer_id", trainerId);
  const list = (creatures ?? []).filter((c: any) => !c.retired);
  await Promise.all(
    list.map((c: any) => {
      const next = applyDiminishing(c.morale ?? 50, MORALE_MEETING_COLLECTIVE_BOOST);
      return supabase.from("creatures").update({ morale: next }).eq("id", c.id);
    }),
  );
  await supabase.from("academies").update({ morale_meeting_completes_at: null }).eq("id", academyId);
  return list.length;
}

export const startMoraleSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ creatureId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const trainer = await loadTrainer(supabase, userId);
    await sweepMoraleSessions(supabase, trainer.id);

    const { data: c } = await supabase
      .from("creatures")
      .select("id, retired, morale_session_completes_at")
      .eq("id", data.creatureId)
      .eq("owner_trainer_id", trainer.id)
      .maybeSingle();
    if (!c) throw new Error("Criatura não encontrada.");
    if (c.retired) throw new Error("Criatura aposentada.");
    if (c.morale_session_completes_at && new Date(c.morale_session_completes_at).getTime() > Date.now()) {
      throw new Error("Já há uma sessão de incentivo em andamento.");
    }
    const completes = new Date(Date.now() + MORALE_SESSION_INDIVIDUAL_MS).toISOString();
    const { error } = await supabase
      .from("creatures")
      .update({ morale_session_completes_at: completes })
      .eq("id", c.id);
    if (error) throw error;
    return { completes_at: completes };
  });

export const rushMoraleSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ creatureId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const trainer = await loadTrainer(supabase, userId);
    const { data: c } = await supabase
      .from("creatures")
      .select("id, morale_session_completes_at")
      .eq("id", data.creatureId)
      .eq("owner_trainer_id", trainer.id)
      .maybeSingle();
    if (!c || !c.morale_session_completes_at) throw new Error("Nenhuma sessão em andamento.");
    const remainingMs = new Date(c.morale_session_completes_at).getTime() - Date.now();
    if (remainingMs <= 0) {
      await sweepMoraleSessions(supabase, trainer.id);
      return { spent: 0 };
    }
    const cost = Math.max(1, Math.ceil(remainingMs / (10 * 60 * 1000)));
    if (trainer.gems < cost) throw new Error(`Você precisa de ${cost} 💎 para acelerar.`);
    await supabase.from("academies").update({ gems: trainer.gems - cost }).eq("id", trainer.academyId);
    await supabase
      .from("creatures")
      .update({ morale_session_completes_at: new Date().toISOString() })
      .eq("id", c.id);
    await sweepMoraleSessions(supabase, trainer.id);
    return { spent: cost };
  });

export const cancelMoraleSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ creatureId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const trainer = await loadTrainer(supabase, userId);
    await supabase
      .from("creatures")
      .update({ morale_session_completes_at: null })
      .eq("id", data.creatureId)
      .eq("owner_trainer_id", trainer.id);
    return { ok: true };
  });

export const startMoraleMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const trainer = await loadTrainer(supabase, userId);
    await sweepMoraleMeeting(supabase, trainer.id, trainer.academyId, trainer.meetingAt);
    // Recarrega estado após sweep.
    const { data: a } = await supabase
      .from("academies")
      .select("morale_meeting_completes_at")
      .eq("id", trainer.academyId)
      .maybeSingle();
    if (a?.morale_meeting_completes_at && new Date(a.morale_meeting_completes_at).getTime() > Date.now()) {
      throw new Error("Já há uma reunião de equipe em andamento.");
    }
    const completes = new Date(Date.now() + MORALE_MEETING_COLLECTIVE_MS).toISOString();
    await supabase
      .from("academies")
      .update({ morale_meeting_completes_at: completes })
      .eq("id", trainer.academyId);
    return { completes_at: completes };
  });

export const rushMoraleMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const trainer = await loadTrainer(supabase, userId);
    if (!trainer.meetingAt) throw new Error("Nenhuma reunião em andamento.");
    const remainingMs = new Date(trainer.meetingAt).getTime() - Date.now();
    if (remainingMs <= 0) {
      await sweepMoraleMeeting(supabase, trainer.id, trainer.academyId, trainer.meetingAt);
      return { spent: 0 };
    }
    const cost = Math.max(1, Math.ceil(remainingMs / (10 * 60 * 1000)));
    if (trainer.gems < cost) throw new Error(`Você precisa de ${cost} 💎 para acelerar.`);
    await supabase
      .from("academies")
      .update({
        gems: trainer.gems - cost,
        morale_meeting_completes_at: new Date().toISOString(),
      })
      .eq("id", trainer.academyId);
    await sweepMoraleMeeting(supabase, trainer.id, trainer.academyId, new Date().toISOString());
    return { spent: cost };
  });

export const cancelMoraleMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const trainer = await loadTrainer(supabase, userId);
    await supabase
      .from("academies")
      .update({ morale_meeting_completes_at: null })
      .eq("id", trainer.academyId);
    return { ok: true };
  });

/** Estado das sessões — usado pelo roster/dashboard. */
export const getMoraleSessionsState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const trainer = await loadTrainer(supabase, userId);
    await sweepMoraleSessions(supabase, trainer.id);
    await sweepMoraleMeeting(supabase, trainer.id, trainer.academyId, trainer.meetingAt);
    const { data: a } = await supabase
      .from("academies")
      .select("morale_meeting_completes_at, gems")
      .eq("id", trainer.academyId)
      .maybeSingle();
    // Preço do Incentivo Geral (pago): preço por criatura × elenco não aposentado, escalado pela divisão atual.
    const { resolvePlayerDivision } = await import("./division.server");
    const division = await resolvePlayerDivision(supabase, trainer.id);

    const { INCENTIVO_GERAL_PRICE_BY_DIVISION } = await import("./shop.server");
    const pricePer = INCENTIVO_GERAL_PRICE_BY_DIVISION[division];
    const { data: allCrs } = await supabase
      .from("creatures")
      .select("id, retired, morale_session_completes_at")
      .eq("owner_trainer_id", trainer.id);
    const eligible = (allCrs ?? []).filter((c: any) => !c.retired);
    const freeOfSession = eligible.filter(
      (c: any) =>
        !c.morale_session_completes_at ||
        new Date(c.morale_session_completes_at).getTime() <= Date.now(),
    );
    const { data: acadMoney } = await supabase
      .from("academies")
      .select("money")
      .eq("id", trainer.academyId)
      .maybeSingle();
    return {
      meeting_completes_at: (a?.morale_meeting_completes_at ?? null) as string | null,
      gems: (a?.gems ?? 0) as number,
      money: Number(acadMoney?.money ?? 0),
      individual_ms: MORALE_SESSION_INDIVIDUAL_MS,
      collective_ms: MORALE_MEETING_COLLECTIVE_MS,
      general_ms: MORALE_GENERAL_MS,
      general: {
        division,
        price_per_creature: pricePer,
        eligible_count: eligible.length,
        appliable_count: freeOfSession.length,
        total_price: pricePer * freeOfSession.length,
      },
    };
  });

export const startMoraleGeneral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const trainer = await loadTrainer(supabase, userId);
    await sweepMoraleSessions(supabase, trainer.id);

    // Descobre divisão atual (fonte única: time atual do jogador)
    const { resolvePlayerDivision } = await import("./division.server");
    const division = await resolvePlayerDivision(supabase, trainer.id);

    const { INCENTIVO_GERAL_PRICE_BY_DIVISION } = await import("./shop.server");
    const pricePer = INCENTIVO_GERAL_PRICE_BY_DIVISION[division];

    const { data: allCrs } = await supabase
      .from("creatures")
      .select("id, retired, morale_session_completes_at")
      .eq("owner_trainer_id", trainer.id);
    const targets = (allCrs ?? []).filter(
      (c: any) =>
        !c.retired &&
        (!c.morale_session_completes_at ||
          new Date(c.morale_session_completes_at).getTime() <= Date.now()),
    );
    if (targets.length === 0) {
      throw new Error("Nenhuma criatura disponível (todas já estão em sessão de incentivo).");
    }

    const totalCost = pricePer * targets.length;
    const { data: acad } = await supabase
      .from("academies")
      .select("id, money")
      .eq("id", trainer.academyId)
      .maybeSingle();
    if (!acad) throw new Error("Academia não encontrada.");
    if (Number(acad.money) < totalCost) {
      throw new Error(`Você precisa de $${totalCost.toLocaleString("pt-BR")} para o Incentivo Geral.`);
    }

    await supabase
      .from("academies")
      .update({ money: Number(acad.money) - totalCost })
      .eq("id", acad.id);

    await supabase.from("financial_transactions").insert({
      trainer_id: trainer.id,
      transaction_type: "expense",
      amount: totalCost,
      description: `Incentivo Geral (${targets.length} criaturas × $${pricePer.toLocaleString("pt-BR")})`,
    });

    const completesAt = new Date(Date.now() + MORALE_GENERAL_MS).toISOString();
    // Marca sessão individual em todas as criaturas alvo em paralelo.
    await Promise.all(
      targets.map((c: any) =>
        supabase
          .from("creatures")
          .update({ morale_session_completes_at: completesAt })
          .eq("id", c.id),
      ),
    );

    return {
      applied: targets.length,
      total_cost: totalCost,
      price_per_creature: pricePer,
      completes_at: completesAt,
    };
  });
