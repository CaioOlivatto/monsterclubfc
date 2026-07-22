import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { FORMATIONS, MAX_BENCH } from "./lineup.server";
import { NEUTRAL_TACTICS, type Tactics } from "./match-engine.server";

const TacticAxis = z.number().int().min(-2).max(2);
const TacticsSchema = z.object({
  mentalidade: TacticAxis,
  verticalidade: TacticAxis,
  pressao: TacticAxis,
  cortes: TacticAxis,
});


const StrategyEnum = z.enum(["ofensiva", "equilibrada", "defensiva"]);
const FormationEnum = z.enum(FORMATIONS);

const SlotSchema = z.object({
  slot: z.number().int().min(0).max(10),
  role: z.enum(["GOL", "DEF", "MEI", "ATA"]),
  creature_id: z.string().uuid().nullable(),
});

const SaveInput = z.object({
  formation: FormationEnum,
  strategy: StrategyEnum,
  starters: z.array(SlotSchema).length(11),
  bench: z.array(z.string().uuid()).max(MAX_BENCH),
});

async function getTrainerId(supabase: any, userId: string): Promise<string> {
  const { data: trainer } = await supabase
    .from("trainers")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!trainer) throw new Error("Treinador não encontrado.");
  return trainer.id;
}

export const getMyLineup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const trainerId = await getTrainerId(supabase, userId);

    const { data: lineup } = await supabase
      .from("team_lineups")
      .select("formation, strategy, starters, bench, default_tactics")
      .eq("trainer_id", trainerId)
      .maybeSingle();

    const { data: creatures } = await supabase
      .from("creatures")
      .select("id, name, element, suggested_position, overall, energy, injury_matches_remaining, injury_severity")
      .eq("owner_trainer_id", trainerId)
      .order("overall", { ascending: false });

    return {
      lineup: lineup ?? {
        formation: "4-4-2",
        strategy: "equilibrada",
        starters: [],
        bench: [],
        default_tactics: NEUTRAL_TACTICS,
      },
      creatures: creatures ?? [],
    };
  });

export const getMyTactics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const trainerId = await getTrainerId(supabase, userId);
    const { data } = await supabase
      .from("team_lineups")
      .select("default_tactics")
      .eq("trainer_id", trainerId)
      .maybeSingle();
    return { tactics: (data?.default_tactics as Tactics | null) ?? NEUTRAL_TACTICS };
  });

export const saveTactics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => TacticsSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const trainerId = await getTrainerId(supabase, userId);
    const { error } = await supabase
      .from("team_lineups")
      .update({ default_tactics: data })
      .eq("trainer_id", trainerId);
    if (error) throw error;
    return { ok: true, tactics: data };
  });


export const saveLineup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SaveInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const trainerId = await getTrainerId(supabase, userId);

    // valida que nenhuma criatura está duplicada e todas pertencem ao treinador
    const starterIds = data.starters.map((s) => s.creature_id).filter(Boolean) as string[];
    const allIds = [...starterIds, ...data.bench];
    const uniq = new Set(allIds);
    if (uniq.size !== allIds.length) {
      throw new Error("A mesma criatura não pode ocupar dois lugares.");
    }
    if (allIds.length > 0) {
      const { data: owned } = await supabase
        .from("creatures")
        .select("id, name, injury_matches_remaining")
        .eq("owner_trainer_id", trainerId)
        .in("id", allIds);
      if ((owned?.length ?? 0) !== allIds.length) {
        throw new Error("Uma das criaturas selecionadas não pertence ao seu elenco.");
      }
      const injured = (owned ?? []).find((c: any) => (c.injury_matches_remaining ?? 0) > 0);
      if (injured) {
        throw new Error(`${injured.name} está lesionada e não pode ser escalada.`);
      }
    }

    const { error } = await supabase
      .from("team_lineups")
      .upsert(
        {
          trainer_id: trainerId,
          formation: data.formation,
          strategy: data.strategy,
          starters: data.starters,
          bench: data.bench,
        },
        { onConflict: "trainer_id" },
      );
    if (error) throw error;
    return { ok: true };
  });
