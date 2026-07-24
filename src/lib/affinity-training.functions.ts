// Treino de afinidade elemental baseado em tempo (Balanceamento §5).
// Fluxo similar às construções: consome tempo; pode ser acelerado com gemas.
// Ao concluir, a afinidade escolhida sobe ao teto atual do CT Elemental.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { affinityCap } from "./buildings.server";

/** Duração do treino de afinidade (4h). */
export const AFFINITY_TRAINING_DURATION_MS = 4 * 60 * 60 * 1000;

const ELEMENT_SCHEMA = z.enum(["fogo", "agua", "terra", "ar", "gelo"]);

const affCol = (el: string) => `aff_${el}` as const;

async function loadTrainer(supabase: any, userId: string) {
  const { data: t, error } = await supabase
    .from("trainers")
    .select("id, academies(gems)")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!t) throw new Error("Treinador não encontrado.");
  return { id: t.id as string, gems: (t.academies?.gems ?? 0) as number };
}

async function ctElementalLevel(supabase: any, trainerId: string) {
  const { data } = await supabase
    .from("buildings")
    .select("level")
    .eq("trainer_id", trainerId)
    .eq("building_type", "ct_elemental")
    .maybeSingle();
  return (data?.level ?? 0) as number;
}

/** Aplica os treinos vencidos (`training_completes_at <= now`) do treinador. */
export async function sweepAffinityTrainings(supabase: any, trainerId: string) {
  const nowIso = new Date().toISOString();
  const { data: done } = await supabase
    .from("creatures")
    .select("id, training_element, aff_fogo, aff_agua, aff_terra, aff_ar, aff_gelo")
    .eq("owner_trainer_id", trainerId)
    .not("training_completes_at", "is", null)
    .lte("training_completes_at", nowIso);
  if (!done || !done.length) return 0;

  const ct = await ctElementalLevel(supabase, trainerId);
  const cap = affinityCap(ct);
  let n = 0;
  for (const c of done) {
    if (!c.training_element) continue;
    const col = affCol(c.training_element);
    const current = (c as any)[col] as number;
    const next = Math.max(current, cap);
    const upd: Record<string, any> = {
      training_element: null,
      training_completes_at: null,
    };
    if (next > current) upd[col] = next;
    await supabase.from("creatures").update(upd).eq("id", c.id);
    n++;
  }
  return n;
}

export const startAffinityTraining = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ creatureId: z.string().uuid(), element: ELEMENT_SCHEMA }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const trainer = await loadTrainer(supabase, userId);
    await sweepAffinityTrainings(supabase, trainer.id);

    const ct = await ctElementalLevel(supabase, trainer.id);
    if (ct <= 0) throw new Error("Construa o CT Elemental para treinar afinidades.");
    const cap = affinityCap(ct);

    const { data: c, error } = await supabase
      .from("creatures")
      .select("id, retired, training_element, training_completes_at, aff_fogo, aff_agua, aff_terra, aff_ar, aff_gelo")
      .eq("id", data.creatureId)
      .eq("owner_trainer_id", trainer.id)
      .maybeSingle();
    if (error) throw error;
    if (!c) throw new Error("Criatura não encontrada.");
    if (c.retired) throw new Error("Criatura aposentada — não treina mais.");
    if (c.training_element && c.training_completes_at && new Date(c.training_completes_at).getTime() > Date.now()) {
      throw new Error("Já há um treino elemental em andamento.");
    }
    const current = (c as any)[affCol(data.element)] as number;
    if (current >= cap) {
      throw new Error(`Afinidade ${data.element} já está no teto do CT Elemental (${cap}%).`);
    }

    const completes = new Date(Date.now() + AFFINITY_TRAINING_DURATION_MS).toISOString();
    const { error: uErr } = await supabase
      .from("creatures")
      .update({ training_element: data.element, training_completes_at: completes })
      .eq("id", c.id);
    if (uErr) throw uErr;
    return { completes_at: completes, cap };
  });

export const rushAffinityTraining = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ creatureId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const trainer = await loadTrainer(supabase, userId);

    const { data: c } = await supabase
      .from("creatures")
      .select("id, training_element, training_completes_at")
      .eq("id", data.creatureId)
      .eq("owner_trainer_id", trainer.id)
      .maybeSingle();
    if (!c || !c.training_element || !c.training_completes_at) {
      throw new Error("Nenhum treino elemental em andamento.");
    }
    const remainingMs = new Date(c.training_completes_at).getTime() - Date.now();
    if (remainingMs <= 0) {
      await sweepAffinityTrainings(supabase, trainer.id);
      return { spent: 0 };
    }
    // Mesmo padrão de obras: 1 gema a cada 10 minutos restantes (mínimo 1).
    const cost = Math.max(1, Math.ceil(remainingMs / (10 * 60 * 1000)));
    if (trainer.gems < cost) throw new Error(`Você precisa de ${cost} 💎 para acelerar.`);

    await supabase
      .from("academies")
      .update({ gems: trainer.gems - cost })
      .eq("trainer_id", trainer.id);
    // Marca como concluído "agora" e aplica.
    await supabase
      .from("creatures")
      .update({ training_completes_at: new Date().toISOString() })
      .eq("id", c.id);
    await sweepAffinityTrainings(supabase, trainer.id);
    return { spent: cost };
  });

export const cancelAffinityTraining = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ creatureId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const trainer = await loadTrainer(supabase, userId);
    const { error } = await supabase
      .from("creatures")
      .update({ training_element: null, training_completes_at: null })
      .eq("id", data.creatureId)
      .eq("owner_trainer_id", trainer.id);
    if (error) throw error;
    return { ok: true };
  });
