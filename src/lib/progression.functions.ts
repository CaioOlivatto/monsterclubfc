import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { computeLineOverall, computeGkOverall, computeMarketValue } from "./bestiary";

const LINE_ATTR_KEYS = ["defender","passar","atacar","tecnica","forca","pique"] as const;
const GK_ATTR_KEYS = ["maos","concentracao","elasticidade"] as const;
const AFF_KEYS = ["fogo","agua","terra","ar","gelo"] as const;
type LineAttr = (typeof LINE_ATTR_KEYS)[number];
type GkAttr = (typeof GK_ATTR_KEYS)[number];
type AffKey = (typeof AFF_KEYS)[number];

const affColumn: Record<AffKey, string> = {
  fogo: "aff_fogo", agua: "aff_agua", terra: "aff_terra", ar: "aff_ar", gelo: "aff_gelo",
};

const attrColumn = {
  defender: "attr_defender", passar: "attr_passar", atacar: "attr_atacar",
  tecnica: "attr_tecnica",   forca: "attr_forca",   pique: "attr_pique",
  maos: "attr_maos", concentracao: "attr_concentracao", elasticidade: "attr_elasticidade",
} as const;

const SpendSchema = z.object({
  creatureId: z.string().uuid(),
  focus: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("attribute"), key: z.enum([...LINE_ATTR_KEYS, ...GK_ATTR_KEYS]) }),
    z.object({ kind: z.literal("affinity"),  key: z.enum(AFF_KEYS) }),
  ]),
});

export const spendHalfStar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SpendSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: trainer } = await supabase
      .from("trainers").select("id").eq("user_id", userId).maybeSingle();
    if (!trainer) throw new Error("Treinador não encontrado.");

    const { data: c } = await supabase
      .from("creatures")
      .select(
        "id, is_goalkeeper, suggested_position, age, attr_defender, attr_passar, attr_atacar, attr_tecnica, attr_forca, attr_pique, attr_maos, attr_concentracao, attr_elasticidade, aff_fogo, aff_agua, aff_terra, aff_ar, aff_gelo, pending_half_stars, half_stars_earned",
      )
      .eq("id", data.creatureId)
      .eq("owner_trainer_id", trainer.id)
      .maybeSingle();
    if (!c) throw new Error("Criatura não encontrada.");
    if ((c.pending_half_stars ?? 0) < 1) throw new Error("Sem meia-estrela pendente.");

    const isGk = c.is_goalkeeper ?? c.suggested_position === "Goleiro";
    const update: Record<string, any> = {
      pending_half_stars: (c.pending_half_stars ?? 0) - 1,
      half_stars_earned: (c.half_stars_earned ?? 0) + 1,
    };

    if (data.focus.kind === "attribute") {
      const key = data.focus.key;
      if (isGk && !GK_ATTR_KEYS.includes(key as GkAttr)) {
        throw new Error("Goleiro só treina Mãos, Concentração ou Elasticidade.");
      }
      if (!isGk && !LINE_ATTR_KEYS.includes(key as LineAttr)) {
        throw new Error("Jogador de linha não treina atributos de goleiro.");
      }
      const col = (attrColumn as any)[key] as string;
      const current = (c as any)[col] as number;
      update[col] = Math.min(100, current + 5);
    } else {
      const col = affColumn[data.focus.key as AffKey];
      const current = (c as any)[col] as number;
      update[col] = Math.min(15, current + 1);
    }

    // Recalcula overall
    const merged: any = { ...c, ...update };
    let overall: number;
    if (isGk) {
      overall = computeGkOverall({
        maos: merged.attr_maos, concentracao: merged.attr_concentracao, elasticidade: merged.attr_elasticidade,
      });
    } else {
      overall = computeLineOverall({
        defender: merged.attr_defender, passar: merged.attr_passar, atacar: merged.attr_atacar,
        tecnica: merged.attr_tecnica, forca: merged.attr_forca, pique: merged.attr_pique,
      }, (c.suggested_position as any) ?? "Meio-campo");
    }
    update.overall = overall;
    update.market_value = computeMarketValue(overall, c.age ?? 18);

    const { error } = await supabase
      .from("creatures").update(update as any).eq("id", c.id).eq("owner_trainer_id", trainer.id);
    if (error) throw error;

    return { ok: true, message: "Meia-estrela aplicada!" };
  });

/**
 * §3.1 — Recompensa semanal: 30 💎 a cada 7 dias.
 */
export const claimWeeklyGems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: trainer } = await supabase
      .from("trainers").select("id, last_weekly_gems_at").eq("user_id", userId).maybeSingle();
    if (!trainer) throw new Error("Treinador não encontrado.");

    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const lastAt = trainer.last_weekly_gems_at ? new Date(trainer.last_weekly_gems_at).getTime() : 0;
    const now = Date.now();
    if (lastAt && now - lastAt < WEEK_MS) {
      return { claimed: false, gems: 0, nextAt: new Date(lastAt + WEEK_MS).toISOString() };
    }

    const { data: acad } = await supabase
      .from("academies").select("gems").eq("trainer_id", trainer.id).maybeSingle();
    const current = acad?.gems ?? 0;
    await supabase.from("academies").update({ gems: current + 30 }).eq("trainer_id", trainer.id);
    await supabase.from("trainers").update({ last_weekly_gems_at: new Date(now).toISOString() }).eq("id", trainer.id);
    await supabase.from("financial_transactions").insert({
      trainer_id: trainer.id, transaction_type: "income", amount: 0,
      description: "Recompensa semanal — +30 💎",
    });
    await supabase.from("messages").insert({
      trainer_id: trainer.id, kind: "reward",
      title: "Recompensa semanal", body: "Você recebeu 30 💎 pela sua atividade semanal.",
    });

    return { claimed: true, gems: 30, nextAt: new Date(now + WEEK_MS).toISOString() };
  });
