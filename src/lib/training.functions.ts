// Treinamento de ATRIBUTO (v2) — não gera XP novo.
// O treino DIRECIONA o XP que a criatura já acumulou jogando partidas:
// cada sessão consome 100 XP do saldo + 20 de energia, leva 4h reais
// (aceleráveis com gemas) e concede +1 ponto no atributo escolhido.
// O XP gasto é gasto: sai do saldo e atrasa a próxima meia-estrela.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { computeLineOverall, computeGkOverall, computeMarketValue } from "./bestiary";
import { halfStarsFromXp } from "./xp.server";
import { attrTrainingDurationMs, BASE_ATTR_TRAINING_DURATION_MS } from "./training-elements";


const LINE_ATTR_KEYS = ["defender", "passar", "atacar", "tecnica", "forca", "pique"] as const;
const GK_ATTR_KEYS = ["maos", "concentracao", "elasticidade"] as const;

const attrColumn = {
  defender: "attr_defender", passar: "attr_passar", atacar: "attr_atacar",
  tecnica: "attr_tecnica",   forca: "attr_forca",   pique: "attr_pique",
  maos: "attr_maos", concentracao: "attr_concentracao", elasticidade: "attr_elasticidade",
} as const;

/** Duração base da sessão (4h). O elemento nativo pode reduzi-la. */
export const ATTR_TRAINING_DURATION_MS = BASE_ATTR_TRAINING_DURATION_MS;

/** XP consumido por sessão — 100 XP = +1 ponto de atributo. */
export const ATTR_TRAINING_XP_COST = 100;
export const ATTR_TRAINING_ENERGY_COST = 20;

const AttrKeySchema = z.enum([...LINE_ATTR_KEYS, ...GK_ATTR_KEYS]);

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

function recomputeOverall(c: any) {
  const isGk = c.is_goalkeeper ?? c.suggested_position === "Goleiro";
  return isGk
    ? computeGkOverall({
        maos: c.attr_maos, concentracao: c.attr_concentracao, elasticidade: c.attr_elasticidade,
      })
    : computeLineOverall({
        defender: c.attr_defender, passar: c.attr_passar, atacar: c.attr_atacar,
        tecnica: c.attr_tecnica, forca: c.attr_forca, pique: c.attr_pique,
      }, (c.suggested_position as any) ?? "Meio-campo");
}

/** Aplica os treinos de atributo vencidos do treinador. */
export async function sweepAttributeTrainings(supabase: any, trainerId: string) {
  const nowIso = new Date().toISOString();
  const { data: done } = await supabase
    .from("creatures")
    .select("*")
    .eq("owner_trainer_id", trainerId)
    .not("attr_training_completes_at", "is", null)
    .lte("attr_training_completes_at", nowIso);
  if (!done || !done.length) return 0;

  let n = 0;
  for (const c of done) {
    const key = c.attr_training_key as keyof typeof attrColumn | null;
    const upd: Record<string, any> = {
      attr_training_key: null,
      attr_training_completes_at: null,
    };
    if (key && attrColumn[key]) {
      const col = attrColumn[key];
      const next = Math.min(100, (c[col] as number) + 1);
      upd[col] = next;
      const merged = { ...c, [col]: next };
      const overall = recomputeOverall(merged);
      upd.overall = overall;
      upd.market_value = computeMarketValue(overall, c.age ?? 18);
    }
    await supabase.from("creatures").update(upd).eq("id", c.id);
    n++;
  }
  return n;
}

export const startAttributeTraining = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ creatureId: z.string().uuid(), key: AttrKeySchema }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const trainer = await loadTrainer(supabase, userId);
    await sweepAttributeTrainings(supabase, trainer.id);

    const { data: c, error } = await supabase
      .from("creatures")
      .select("*")
      .eq("id", data.creatureId)
      .eq("owner_trainer_id", trainer.id)
      .maybeSingle();
    if (error) throw error;
    if (!c) throw new Error("Criatura não encontrada.");
    if (c.retired) throw new Error("Criatura aposentada — não treina mais.");
    if (c.attr_training_completes_at && new Date(c.attr_training_completes_at).getTime() > Date.now()) {
      throw new Error("Já há um treino de atributo em andamento.");
    }
    if ((c.energy ?? 0) < ATTR_TRAINING_ENERGY_COST) {
      throw new Error("Energia insuficiente. Descanse a criatura antes de treinar.");
    }
    if ((c.xp ?? 0) < ATTR_TRAINING_XP_COST) {
      throw new Error(
        `XP insuficiente: o treino consome ${ATTR_TRAINING_XP_COST} XP acumulado em partidas (saldo atual: ${c.xp ?? 0}).`,
      );
    }

    const isGk = c.is_goalkeeper ?? c.suggested_position === "Goleiro";
    if (isGk && !GK_ATTR_KEYS.includes(data.key as any)) {
      throw new Error("Goleiro só treina Mãos, Concentração ou Elasticidade.");
    }
    if (!isGk && !LINE_ATTR_KEYS.includes(data.key as any)) {
      throw new Error("Jogador de linha não treina atributos de goleiro.");
    }
    if ((c[attrColumn[data.key]] as number) >= 100) {
      throw new Error("Este atributo já está no máximo (100).");
    }

    const newXp = (c.xp ?? 0) - ATTR_TRAINING_XP_COST;
    const applied = c.half_stars_earned ?? 0;
    const pending = Math.max(0, Math.min(10 - applied, halfStarsFromXp(newXp) - applied));
    const completes = new Date(Date.now() + ATTR_TRAINING_DURATION_MS).toISOString();

    const { error: uErr } = await supabase
      .from("creatures")
      .update({
        xp: newXp,
        pending_half_stars: pending,
        energy: Math.max(0, (c.energy ?? 0) - ATTR_TRAINING_ENERGY_COST),
        attr_training_key: data.key,
        attr_training_completes_at: completes,
      })
      .eq("id", c.id);
    if (uErr) throw uErr;

    return { completes_at: completes, xp_spent: ATTR_TRAINING_XP_COST, xp_left: newXp };
  });

export const rushAttributeTraining = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ creatureId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const trainer = await loadTrainer(supabase, userId);

    const { data: c } = await supabase
      .from("creatures")
      .select("id, attr_training_key, attr_training_completes_at")
      .eq("id", data.creatureId)
      .eq("owner_trainer_id", trainer.id)
      .maybeSingle();
    if (!c || !c.attr_training_key || !c.attr_training_completes_at) {
      throw new Error("Nenhum treino de atributo em andamento.");
    }
    const remainingMs = new Date(c.attr_training_completes_at).getTime() - Date.now();
    if (remainingMs <= 0) {
      await sweepAttributeTrainings(supabase, trainer.id);
      return { spent: 0 };
    }
    // Mesmo padrão dos demais temporizadores: 1 gema a cada 10 min restantes.
    const cost = Math.max(1, Math.ceil(remainingMs / (10 * 60 * 1000)));
    if (trainer.gems < cost) throw new Error(`Você precisa de ${cost} 💎 para acelerar.`);

    await supabase.from("academies").update({ gems: trainer.gems - cost }).eq("trainer_id", trainer.id);
    await supabase
      .from("creatures")
      .update({ attr_training_completes_at: new Date().toISOString() })
      .eq("id", c.id);
    await sweepAttributeTrainings(supabase, trainer.id);
    return { spent: cost };
  });

/** Cancela o treino e devolve o XP e a energia consumidos. */
export const cancelAttributeTraining = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ creatureId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const trainer = await loadTrainer(supabase, userId);

    const { data: c } = await supabase
      .from("creatures")
      .select("id, xp, energy, half_stars_earned, attr_training_completes_at")
      .eq("id", data.creatureId)
      .eq("owner_trainer_id", trainer.id)
      .maybeSingle();
    if (!c || !c.attr_training_completes_at) throw new Error("Nenhum treino em andamento.");

    const newXp = (c.xp ?? 0) + ATTR_TRAINING_XP_COST;
    const applied = c.half_stars_earned ?? 0;
    const pending = Math.max(0, Math.min(10 - applied, halfStarsFromXp(newXp) - applied));

    const { error } = await supabase
      .from("creatures")
      .update({
        xp: newXp,
        pending_half_stars: pending,
        energy: Math.min(100, (c.energy ?? 0) + ATTR_TRAINING_ENERGY_COST),
        attr_training_key: null,
        attr_training_completes_at: null,
      })
      .eq("id", c.id);
    if (error) throw error;
    return { ok: true, xp_refunded: ATTR_TRAINING_XP_COST };
  });
