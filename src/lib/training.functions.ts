import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ATTR_KEYS = ["attack", "defense", "goalkeeper", "physical", "strength"] as const;
const AFF_KEYS = ["fogo", "agua", "terra", "ar", "gelo"] as const;
type AttrKey = (typeof ATTR_KEYS)[number];
type AffKey = (typeof AFF_KEYS)[number];

const focusSchema = z.union([
  z.object({ kind: z.literal("attribute"), key: z.enum(ATTR_KEYS) }),
  z.object({ kind: z.literal("affinity"), key: z.enum(AFF_KEYS) }),
]);

const ENERGY_COST = 20;

function ctLevel(rows: Array<{ type: string; level: number }>, type: string) {
  return rows.find((b) => b.type === type)?.level ?? 0;
}

async function loadCreatureAndTrainer(context: {
  supabase: any;
  userId: string;
}, creatureId: string) {
  const { data: trainer, error: tErr } = await context.supabase
    .from("trainers")
    .select("id")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (tErr) throw tErr;
  if (!trainer) throw new Error("Treinador não encontrado");

  const { data: c, error: cErr } = await context.supabase
    .from("creatures")
    .select("*")
    .eq("id", creatureId)
    .eq("owner_trainer_id", trainer.id)
    .maybeSingle();
  if (cErr) throw cErr;
  if (!c) throw new Error("Criatura não encontrada");

  const { data: academy } = await context.supabase
    .from("academies")
    .select("id")
    .eq("trainer_id", trainer.id)
    .maybeSingle();
  if (!academy) throw new Error("Academia não encontrada");

  const { data: buildings } = await context.supabase
    .from("buildings")
    .select("type, level")
    .eq("academy_id", academy.id);

  return { trainer, creature: c, buildings: buildings ?? [] };
}

export const trainCreature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { creatureId: string; focus: z.infer<typeof focusSchema> }) => ({
    creatureId: z.string().uuid().parse(data.creatureId),
    focus: focusSchema.parse(data.focus),
  }))
  .handler(async ({ data, context }) => {
    const { creature, buildings } = await loadCreatureAndTrainer(context, data.creatureId);

    if (creature.energy < ENERGY_COST) {
      throw new Error("Energia insuficiente. Descanse a criatura antes de treinar novamente.");
    }

    const ctTreino = ctLevel(buildings, "ct_treino");
    const ctElem = ctLevel(buildings, "ct_elemental");
    const xpMult = 1 + ctTreino * 0.1;
    const affMult = 1 + ctElem * 0.15;

    const gainXp = Math.round(25 * xpMult);
    const newXp = creature.xp + gainXp;

    const update: Record<string, number> = {
      xp: newXp,
      energy: Math.max(0, creature.energy - ENERGY_COST),
    };

    let msg = "";

    if (data.focus.kind === "attribute") {
      const key = data.focus.key as AttrKey;
      // A cada 100 XP investido, +1 no atributo. Aplicamos incremento se cruzou fronteira de 100.
      const before = Math.floor(creature.xp / 100);
      const after = Math.floor(newXp / 100);
      const gain = Math.max(0, after - before);
      const currentAttr = creature[key] as number;
      const newAttr = Math.min(100, currentAttr + gain);
      update[key] = newAttr;
      // half_stars ganhas: a cada 20 de atributo somado = 1 meia-estrela (0.5★)
      const newHalfStars = Math.min(10, creature.half_stars_earned + Math.floor((newAttr - currentAttr) / 10));
      update.half_stars_earned = newHalfStars;

      // Recalcula overall
      const attrs = { attack: creature.attack, defense: creature.defense, goalkeeper: creature.goalkeeper, physical: creature.physical, strength: creature.strength, [key]: newAttr };
      update.overall = Math.round(
        (attrs.attack + attrs.defense + attrs.goalkeeper + attrs.physical + attrs.strength) / 5,
      );
      update.market_value = update.overall * 800;

      msg = gain > 0
        ? `+${gainXp} XP e +${gain} em ${key}. Novo overall: ${update.overall}.`
        : `+${gainXp} XP em ${key}. Próximo ponto em ${100 - (newXp % 100)} XP.`;
    } else {
      const key = data.focus.key as AffKey;
      const affCol = `aff_${key}` as const;
      const current = creature[affCol] as number;
      // Chance por sessão: 40% * affMult, capado em 90%
      const chance = Math.min(0.9, 0.4 * affMult);
      const success = Math.random() < chance;
      const gain = success && current < 15 ? 1 : 0;
      update[affCol] = current + gain;
      msg = gain > 0
        ? `+${gainXp} XP e +1 de afinidade ${key} (agora ${current + gain}/15).`
        : `+${gainXp} XP. A afinidade ${key} não avançou desta vez.`;
    }

    const { data: updated, error: uErr } = await context.supabase
      .from("creatures")
      .update(update)
      .eq("id", creature.id)
      .select("*")
      .single();
    if (uErr) throw uErr;

    return { creature: updated, message: msg };
  });

export const restCreature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { creatureId: string }) => ({
    creatureId: z.string().uuid().parse(data.creatureId),
  }))
  .handler(async ({ data, context }) => {
    const { creature, buildings } = await loadCreatureAndTrainer(context, data.creatureId);
    const centroMedico = ctLevel(buildings, "centro_medico");
    // recupera 40 + 5 por nível de centro médico
    const gain = 40 + centroMedico * 5;
    const newEnergy = Math.min(100, creature.energy + gain);
    const { data: updated, error } = await context.supabase
      .from("creatures")
      .update({ energy: newEnergy })
      .eq("id", creature.id)
      .select("*")
      .single();
    if (error) throw error;
    return { creature: updated, message: `Energia recuperada para ${newEnergy}%.` };
  });
