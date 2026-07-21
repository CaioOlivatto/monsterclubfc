import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ATTR_KEYS = ["attack", "defense", "goalkeeper", "physical", "strength"] as const;
const AFF_KEYS = ["fogo", "agua", "terra", "ar", "gelo"] as const;
type AttrKey = (typeof ATTR_KEYS)[number];
type AffKey = (typeof AFF_KEYS)[number];

const affColumn: Record<AffKey, string> = {
  fogo: "aff_fogo",
  agua: "aff_agua",
  terra: "aff_terra",
  ar: "aff_ar",
  gelo: "aff_gelo",
};


const SpendSchema = z.object({
  creatureId: z.string().uuid(),
  focus: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("attribute"), key: z.enum(ATTR_KEYS) }),
    z.object({ kind: z.literal("affinity"), key: z.enum(AFF_KEYS) }),
  ]),
});

/**
 * §6.3 — Ao subir meia-estrela, o jogador escolhe manualmente onde aplicar
 * o incremento (+5 num atributo 0-100, ou +1 numa afinidade 0-15).
 */
export const spendHalfStar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SpendSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: trainer } = await supabase
      .from("trainers")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!trainer) throw new Error("Treinador não encontrado.");

    const { data: c } = await supabase
      .from("creatures")
      .select(
        "id, attack, defense, goalkeeper, physical, strength, aff_fogo, aff_agua, aff_terra, aff_ar, aff_gelo, pending_half_stars, half_stars_earned, overall",
      )

      .eq("id", data.creatureId)
      .eq("owner_trainer_id", trainer.id)
      .maybeSingle();
    if (!c) throw new Error("Criatura não encontrada.");
    if ((c.pending_half_stars ?? 0) < 1) throw new Error("Sem meia-estrela pendente.");

    const update: Record<string, any> = {
      pending_half_stars: (c.pending_half_stars ?? 0) - 1,
      half_stars_earned: (c.half_stars_earned ?? 0) + 1,
    };

    if (data.focus.kind === "attribute") {
      const k = data.focus.key as AttrKey;
      const current = (c as any)[k] as number;
      const next = Math.min(100, current + 5);
      update[k] = next;
    } else {
      const col = affColumn[data.focus.key as AffKey];
      const current = (c as any)[col] as number;
      const next = Math.min(15, current + 1);
      update[col] = next;
    }

    // Recalcula overall (média simples dos 5 atributos base)
    const attrs = {
      attack: c.attack,
      defense: c.defense,
      goalkeeper: c.goalkeeper,
      physical: c.physical,
      strength: c.strength,
      ...update,
    };
    const overall = Math.round(
      (attrs.attack + attrs.defense + attrs.goalkeeper + attrs.physical + attrs.strength) / 5,
    );
    update.overall = overall;

    const { error } = await supabase
      .from("creatures")
      .update(update as any)
      .eq("id", c.id)

      .eq("owner_trainer_id", trainer.id);
    if (error) throw error;

    return { ok: true, message: "Meia-estrela aplicada!" };
  });

/**
 * §3.1 — Recompensa semanal: 30 💎 a cada 7 dias.
 * Retorna { claimed: boolean, gems: number, nextAt: string | null }.
 */
export const claimWeeklyGems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: trainer } = await supabase
      .from("trainers")
      .select("id, last_weekly_gems_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (!trainer) throw new Error("Treinador não encontrado.");

    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const lastAt = trainer.last_weekly_gems_at ? new Date(trainer.last_weekly_gems_at).getTime() : 0;
    const now = Date.now();
    if (lastAt && now - lastAt < WEEK_MS) {
      return {
        claimed: false,
        gems: 0,
        nextAt: new Date(lastAt + WEEK_MS).toISOString(),
      };
    }

    const { data: acad } = await supabase
      .from("academies")
      .select("gems")
      .eq("trainer_id", trainer.id)
      .maybeSingle();
    const current = acad?.gems ?? 0;

    await supabase
      .from("academies")
      .update({ gems: current + 30 })
      .eq("trainer_id", trainer.id);
    await supabase
      .from("trainers")
      .update({ last_weekly_gems_at: new Date(now).toISOString() })
      .eq("id", trainer.id);
    await supabase.from("financial_transactions").insert({
      trainer_id: trainer.id,
      transaction_type: "income",
      amount: 0,
      description: "Recompensa semanal — +30 💎",
    });
    await supabase.from("messages").insert({
      trainer_id: trainer.id,
      kind: "reward",
      title: "Recompensa semanal",
      body: "Você recebeu 30 💎 pela sua atividade semanal.",
    });

    return {
      claimed: true,
      gems: 30,
      nextAt: new Date(now + WEEK_MS).toISOString(),
    };
  });
