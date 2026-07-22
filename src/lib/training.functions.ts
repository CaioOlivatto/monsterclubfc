import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { affinityCap, trainingXpMultiplier } from "./buildings.server";
import { computeLineOverall, computeGkOverall, computeMarketValue } from "./bestiary";

const LINE_ATTR_KEYS = ["defender","passar","atacar","tecnica","forca","pique"] as const;
const GK_ATTR_KEYS = ["maos","concentracao","elasticidade"] as const;
const AFF_KEYS = ["fogo","agua","terra","ar","gelo"] as const;

const attrColumn = {
  defender: "attr_defender", passar: "attr_passar", atacar: "attr_atacar",
  tecnica: "attr_tecnica",   forca: "attr_forca",   pique: "attr_pique",
  maos: "attr_maos", concentracao: "attr_concentracao", elasticidade: "attr_elasticidade",
} as const;

const focusSchema = z.union([
  z.object({ kind: z.literal("attribute"), key: z.enum([...LINE_ATTR_KEYS, ...GK_ATTR_KEYS]) }),
  z.object({ kind: z.literal("affinity"),  key: z.enum(AFF_KEYS) }),
]);

const ENERGY_COST = 20;

function levelOf(rows: Array<{ building_type: string; level: number }>, type: string) {
  return rows.find((b) => b.building_type === type)?.level ?? 0;
}

async function loadCreatureAndTrainer(context: { supabase: any; userId: string }, creatureId: string) {
  const { data: trainer, error: tErr } = await context.supabase
    .from("trainers").select("id").eq("user_id", context.userId).maybeSingle();
  if (tErr) throw tErr;
  if (!trainer) throw new Error("Treinador não encontrado");

  const { data: c, error: cErr } = await context.supabase
    .from("creatures").select("*").eq("id", creatureId).eq("owner_trainer_id", trainer.id).maybeSingle();
  if (cErr) throw cErr;
  if (!c) throw new Error("Criatura não encontrada");

  const { data: buildings } = await context.supabase
    .from("buildings").select("building_type, level").eq("trainer_id", trainer.id);

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

    if (creature.retired) throw new Error("Criatura aposentada — não treina mais.");
    if (creature.energy < ENERGY_COST) {
      throw new Error("Energia insuficiente. Descanse a criatura antes de treinar novamente.");
    }

    const ctTreino = levelOf(buildings, "ct_treino");
    const ctElem = levelOf(buildings, "ct_elemental");
    const xpMult = trainingXpMultiplier(ctTreino);
    const gainXp = Math.round(25 * xpMult);
    const newXp = creature.xp + gainXp;

    const update: Record<string, any> = {
      xp: newXp,
      energy: Math.max(0, creature.energy - ENERGY_COST),
    };

    let msg = "";
    const isGk = creature.is_goalkeeper ?? creature.suggested_position === "Goleiro";

    if (data.focus.kind === "attribute") {
      const key = data.focus.key as keyof typeof attrColumn;
      if (isGk && !GK_ATTR_KEYS.includes(key as any)) throw new Error("Goleiro treina só Mãos/Concentração/Elasticidade.");
      if (!isGk && !LINE_ATTR_KEYS.includes(key as any)) throw new Error("Jogador de linha não treina atributos de goleiro.");
      const col = attrColumn[key];
      const before = Math.floor(creature.xp / 100);
      const after = Math.floor(newXp / 100);
      const gain = Math.max(0, after - before);
      const currentAttr = creature[col] as number;
      const newAttr = Math.min(100, currentAttr + gain);
      update[col] = newAttr;

      const merged = { ...creature, [col]: newAttr };
      const overall = isGk
        ? computeGkOverall({ maos: merged.attr_maos, concentracao: merged.attr_concentracao, elasticidade: merged.attr_elasticidade })
        : computeLineOverall({
            defender: merged.attr_defender, passar: merged.attr_passar, atacar: merged.attr_atacar,
            tecnica: merged.attr_tecnica, forca: merged.attr_forca, pique: merged.attr_pique,
          }, (creature.suggested_position as any) ?? "Meio-campo");
      update.overall = overall;
      update.market_value = computeMarketValue(overall, creature.age ?? 18);

      msg = gain > 0
        ? `+${gainXp} XP e +${gain} em ${key}. Novo overall: ${overall}.`
        : `+${gainXp} XP em ${key}. Próximo ponto em ${100 - (newXp % 100)} XP.`;
    } else {
      const key = data.focus.key as (typeof AFF_KEYS)[number];
      const affCol = `aff_${key}`;
      const current = creature[affCol] as number;
      const cap = affinityCap(ctElem);
      if (cap === 0) throw new Error("Construa o CT Elemental para treinar afinidades.");
      if (current >= cap) {
        msg = `+${gainXp} XP. Afinidade ${key} já no teto do CT Elemental (${cap}%).`;
      } else {
        const chance = Math.min(0.9, 0.4 + ctElem * 0.1);
        const success = Math.random() < chance;
        const gain = success ? 1 : 0;
        update[affCol] = current + gain;
        msg = gain > 0
          ? `+${gainXp} XP e +1 de afinidade ${key} (agora ${current + gain}/${cap}).`
          : `+${gainXp} XP. A afinidade ${key} não avançou desta vez.`;
      }
    }

    const { data: updated, error: uErr } = await context.supabase
      .from("creatures").update(update as any).eq("id", creature.id).select("*").single();
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
    const centroMedico = levelOf(buildings, "centro_medico");
    const gain = Math.round(40 * (1 + centroMedico * 0.25));
    const newEnergy = Math.min(100, creature.energy + gain);
    const { data: updated, error } = await context.supabase
      .from("creatures").update({ energy: newEnergy }).eq("id", creature.id).select("*").single();
    if (error) throw error;
    return { creature: updated, message: `Energia recuperada para ${newEnergy}%.` };
  });
