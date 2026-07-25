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
export const MORALE_SESSION_INDIVIDUAL_BOOST = 25;
export const MORALE_MEETING_COLLECTIVE_BOOST = 25;

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
  for (const c of done) {
    const next = applyDiminishing(c.morale ?? 50, MORALE_SESSION_INDIVIDUAL_BOOST);
    await supabase
      .from("creatures")
      .update({ morale: next, morale_session_completes_at: null })
      .eq("id", c.id);
  }
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
  for (const c of list) {
    const next = applyDiminishing(c.morale ?? 50, MORALE_MEETING_COLLECTIVE_BOOST);
    await supabase.from("creatures").update({ morale: next }).eq("id", c.id);
  }
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
    return {
      meeting_completes_at: (a?.morale_meeting_completes_at ?? null) as string | null,
      gems: (a?.gems ?? 0) as number,
      individual_ms: MORALE_SESSION_INDIVIDUAL_MS,
      collective_ms: MORALE_MEETING_COLLECTIVE_MS,
    };
  });
