import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Fase A: leituras usadas pelas telas de prévia da Liga/Copa Mundial e pelo
 * dashboard. A simulação/agendamento propriamente ditos ficam para a Fase B.
 */

async function getTrainer(supabase: any, userId: string) {
  const { data } = await supabase
    .from("trainers")
    .select("id, academy_name")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Treinador não encontrado.");
  return data as { id: string; academy_name: string };
}

async function getCurrentSeasonNumber(supabase: any, trainerId: string): Promise<number> {
  const { data } = await supabase
    .from("game_seasons")
    .select("season_number")
    .eq("trainer_id", trainerId)
    .eq("is_current", true)
    .maybeSingle();
  return data?.season_number ?? 1;
}

/**
 * Retorna, para a temporada atual, se o jogador está classificado à competição
 * (via `qualifications` gravadas ao fim da temporada anterior) e o status atual.
 */
export const getWorldCompetitionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const trainer = await getTrainer(supabase, userId);
    const seasonNumber = await getCurrentSeasonNumber(supabase, trainer.id);

    const { data: quals } = await supabase
      .from("qualifications")
      .select("qualifies_for, source_division, source_position")
      .eq("trainer_id", trainer.id)
      .eq("season_number", seasonNumber);

    const qualifiedLeague = (quals ?? []).find((q: any) => q.qualifies_for === "world_league") ?? null;
    const qualifiedCup = (quals ?? []).find((q: any) => q.qualifies_for === "world_cup") ?? null;

    return {
      seasonNumber,
      isFirstSeason: seasonNumber === 1,
      qualifiedLeague,
      qualifiedCup,
    };
  });
