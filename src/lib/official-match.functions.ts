import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  getNextOfficialMatchForTrainer,
  parseOfficialCompetition,
  type OfficialCompetition,
  type OfficialMatchContext,
} from "./official-match.server";

export type { OfficialCompetition, OfficialMatchContext };

export const getUpcomingOfficialMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        competition: z.enum(["league", "cup", "world_league", "world_cup"]).optional(),
      })
      .optional()
      .parse(raw ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: trainer } = await supabase
      .from("trainers")
      .select("id, current_team_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!trainer) throw new Error("Treinador não encontrado.");

    const competition = parseOfficialCompetition(data?.competition);
    return getNextOfficialMatchForTrainer(supabase, trainer, competition);
  });