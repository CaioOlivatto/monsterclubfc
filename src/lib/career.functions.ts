import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface CareerEntry {
  id: string;
  team_id: string | null;
  team_name: string;
  division: string;
  season_start: number;
  season_end: number | null;
  final_position: number | null;
  event: "arrived" | "hired" | "promoted" | "relegated" | "champion" | "fired" | "left";
  title: string | null;
  created_at: string;
}

export interface CareerSummary {
  trainer_name: string;
  academy_name: string;
  level: number;
  xp: number;
  current_team_id: string | null;
  current_team_name: string | null;
  current_division: string | null;
  seasons_at_current_club: number;
  consecutive_bad_seasons: number;
  last_final_position: number | null;
  entries: CareerEntry[];
  totals: {
    clubs: number;
    seasons: number;
    titles: number;
    promotions: number;
    relegations: number;
    dismissals: number;
  };
}

export const getCareer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CareerSummary> => {
    const { supabase, userId } = context;

    const { data: trainer, error: tErr } = await supabase
      .from("trainers")
      .select(
        "id, trainer_name, academy_name, level, xp, current_team_id, seasons_at_current_club, consecutive_bad_seasons, last_final_position",
      )
      .eq("user_id", userId)
      .maybeSingle();
    if (tErr) throw tErr;
    if (!trainer) throw new Error("Treinador não encontrado.");

    let currentTeamName: string | null = null;
    let currentDivision: string | null = null;
    if (trainer.current_team_id) {
      const { data: team } = await supabase
        .from("teams")
        .select("name, division")
        .eq("id", trainer.current_team_id)
        .maybeSingle();
      currentTeamName = team?.name ?? null;
      currentDivision = (team?.division as string | null) ?? null;
    }

    const { data: rows, error: cErr } = await supabase
      .from("trainer_career")
      .select("id, team_id, team_name, division, season_start, season_end, final_position, event, title, created_at")
      .eq("trainer_id", trainer.id)
      .order("season_start", { ascending: false })
      .order("created_at", { ascending: false });
    if (cErr) throw cErr;

    const entries = (rows ?? []) as CareerEntry[];
    const clubs = new Set<string>();
    let seasons = 0;
    let titles = 0;
    let promotions = 0;
    let relegations = 0;
    let dismissals = 0;
    for (const e of entries) {
      if (e.team_id) clubs.add(e.team_id);
      if (e.event === "champion") titles++;
      if (e.event === "promoted") promotions++;
      if (e.event === "relegated") relegations++;
      if (e.event === "fired") dismissals++;
      if (e.final_position != null) seasons++;
    }

    return {
      trainer_name: trainer.trainer_name,
      academy_name: trainer.academy_name,
      level: trainer.level,
      xp: trainer.xp,
      current_team_id: trainer.current_team_id,
      current_team_name: currentTeamName,
      current_division: currentDivision,
      seasons_at_current_club: trainer.seasons_at_current_club,
      consecutive_bad_seasons: trainer.consecutive_bad_seasons,
      last_final_position: trainer.last_final_position,
      entries,
      totals: { clubs: clubs.size, seasons, titles, promotions, relegations, dismissals },
    };
  });
