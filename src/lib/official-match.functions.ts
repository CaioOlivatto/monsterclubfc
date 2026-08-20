import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  getNextOfficialMatchForTrainer,
  parseOfficialCompetition,
  type OfficialCompetition,
  type OfficialMatchContext,
} from "./official-match.server";
import { getDirectSession } from "./direct-session.server";

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
  .handler(async ({ data, context }) => loadUpcomingOfficialMatch(context.supabase, context.userId, data?.competition));

async function loadUpcomingOfficialMatch(supabase: any, userId: string, requestedCompetition?: OfficialCompetition) {
    const { data: trainer } = await supabase
      .from("trainers")
      .select("id, current_team_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!trainer) throw new Error("Treinador não encontrado.");

    const competition = parseOfficialCompetition(requestedCompetition);
    return getNextOfficialMatchForTrainer(supabase, trainer, competition);
}

const directMatchSchema = z.object({
  access_token: z.string().min(20),
  competition: z.enum(["league", "cup", "world_league", "world_cup"]).optional(),
});

export const getUpcomingOfficialMatchWithSession = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => directMatchSchema.parse(raw))
  .handler(async ({ data }) => {
    const { supabase, userId } = await getDirectSession(data.access_token);
    return loadUpcomingOfficialMatch(supabase, userId, data.competition);
  });
