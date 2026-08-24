import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { computeLineOverall, computeGkOverall, computeMarketValue } from "./bestiary";
import { awardTrainerXp } from "./trainer-xp.server";


const LINE_ATTR_KEYS = ["defender","passar","atacar","tecnica","forca","pique"] as const;
const GK_ATTR_KEYS = ["maos","concentracao","elasticidade"] as const;
type LineAttr = (typeof LINE_ATTR_KEYS)[number];
type GkAttr = (typeof GK_ATTR_KEYS)[number];

const attrColumn = {
  defender: "attr_defender", passar: "attr_passar", atacar: "attr_atacar",
  tecnica: "attr_tecnica",   forca: "attr_forca",   pique: "attr_pique",
  maos: "attr_maos", concentracao: "attr_concentracao", elasticidade: "attr_elasticidade",
} as const;

const SpendSchema = z.object({
  creatureId: z.string().uuid(),
  focus: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("attribute"), key: z.enum([...LINE_ATTR_KEYS, ...GK_ATTR_KEYS]) }),
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
        "id, is_goalkeeper, suggested_position, age, attr_defender, attr_passar, attr_atacar, attr_tecnica, attr_forca, attr_pique, attr_maos, attr_concentracao, attr_elasticidade, pending_half_stars, half_stars_earned",
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

    {
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

    await awardTrainerXp(supabase, trainer.id, "half_star", 1);

    return { ok: true, message: "Meia-estrela aplicada!" };
  });
