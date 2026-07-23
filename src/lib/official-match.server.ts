export type OfficialCompetition = "league" | "cup" | "world_league" | "world_cup";

export type OfficialMatchContext = {
  competition: OfficialCompetition;
  competitionLabel: string;
  sourcePath: "/league" | "/cup" | "/world-league" | "/world-cup";
  matchId: string;
  round: number;
  phase: string | null;
  phaseLabel: string | null;
  homeTeamId: string;
  awayTeamId: string;
  homeTeam: string;
  awayTeam: string;
  playerTeamId: string;
  playerTeam: string;
  opponentTeamId: string;
  opponent: string;
  opponentStrength: number;
  isHome: boolean;
};

export function parseOfficialCompetition(value: unknown): OfficialCompetition | undefined {
  return value === "league" || value === "cup" || value === "world_league" || value === "world_cup"
    ? value
    : undefined;
}

const COMPETITION_LABEL: Record<OfficialCompetition, string> = {
  league: "CAMPEONATO",
  cup: "COPA",
  world_league: "LIGA MUNDIAL",
  world_cup: "COPA MUNDIAL",
};

const SOURCE_PATH: Record<OfficialCompetition, OfficialMatchContext["sourcePath"]> = {
  league: "/league",
  cup: "/cup",
  world_league: "/world-league",
  world_cup: "/world-cup",
};

const WORLD_LEAGUE_PHASE: Record<number, string> = {
  1: "Fase de grupos",
  2: "Fase de grupos",
  3: "Fase de grupos",
  4: "Fase de grupos",
  5: "Fase de grupos",
  6: "Quartas de final",
  7: "Semifinal",
  8: "Final",
};

const WORLD_CUP_PHASE: Record<number, string> = {
  1: "Pré-oitavas",
  2: "Quartas de final",
  3: "Semifinal",
  4: "Final",
};

const CUP_PHASE: Record<number, string> = {
  1: "Quartas de final",
  2: "Semifinal",
  3: "Final",
};

function phaseLabel(competition: OfficialCompetition, round: number): string | null {
  if (competition === "world_league") return WORLD_LEAGUE_PHASE[round] ?? null;
  if (competition === "world_cup") return WORLD_CUP_PHASE[round] ?? null;
  if (competition === "cup") return CUP_PHASE[round] ?? null;
  return null;
}

async function currentSeasonId(supabase: any, trainerId: string): Promise<string | null> {
  const { data } = await supabase
    .from("game_seasons")
    .select("id")
    .eq("trainer_id", trainerId)
    .eq("is_current", true)
    .maybeSingle();
  return data?.id ?? null;
}

async function resolveCurrentTeam(supabase: any, trainerId: string, currentTeamId?: string | null) {
  if (currentTeamId) {
    const { data } = await supabase
      .from("teams")
      .select("id, name, competition_id, division")
      .eq("id", currentTeamId)
      .eq("trainer_id", trainerId)
      .maybeSingle();
    if (data) return data;
  }

  const { data } = await supabase
    .from("teams")
    .select("id, name, competition_id, division")
    .eq("trainer_id", trainerId)
    .eq("is_player", true)
    .not("competition_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function buildContext(
  supabase: any,
  competition: OfficialCompetition,
  match: any,
  playerTeamId: string,
): Promise<OfficialMatchContext | null> {
  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, cpu_strength")
    .in("id", [match.home_team_id, match.away_team_id]);
  const home = (teams ?? []).find((team: any) => team.id === match.home_team_id);
  const away = (teams ?? []).find((team: any) => team.id === match.away_team_id);
  if (!home || !away) return null;

  const isHome = match.home_team_id === playerTeamId;
  const player = isHome ? home : away;
  const opponent = isHome ? away : home;
  const round = Number(match.round ?? 1);

  return {
    competition,
    competitionLabel: COMPETITION_LABEL[competition],
    sourcePath: SOURCE_PATH[competition],
    matchId: match.id,
    round,
    phase: match.phase ?? null,
    phaseLabel: phaseLabel(competition, round),
    homeTeamId: home.id,
    awayTeamId: away.id,
    homeTeam: home.name ?? "?",
    awayTeam: away.name ?? "?",
    playerTeamId,
    playerTeam: player.name ?? "Seu time",
    opponentTeamId: opponent.id,
    opponent: opponent.name ?? "Adversário",
    opponentStrength: opponent.cpu_strength ?? 45,
    isHome,
  };
}

async function nextMatchForTeam(
  supabase: any,
  competitionId: string,
  playerTeamId: string,
) {
  const { data } = await supabase
    .from("matches")
    .select("id, round, phase, home_team_id, away_team_id")
    .eq("competition_id", competitionId)
    .eq("status", "scheduled")
    .or(`home_team_id.eq.${playerTeamId},away_team_id.eq.${playerTeamId}`)
    .order("round", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function findLeagueMatch(supabase: any, trainerId: string, currentTeamId?: string | null) {
  const playerTeam = await resolveCurrentTeam(supabase, trainerId, currentTeamId);
  if (!playerTeam?.competition_id) return null;

  const { data: competition } = await supabase
    .from("competitions")
    .select("id")
    .eq("id", playerTeam.competition_id)
    .eq("trainer_id", trainerId)
    .eq("type", "league")
    .eq("status", "active")
    .maybeSingle();
  if (!competition) return null;

  const match = await nextMatchForTeam(supabase, competition.id, playerTeam.id);
  return match ? buildContext(supabase, "league", match, playerTeam.id) : null;
}

async function findDomesticCupMatch(supabase: any, trainerId: string) {
  const { data: competition } = await supabase
    .from("competitions")
    .select("id")
    .eq("trainer_id", trainerId)
    .eq("type", "cup")
    .eq("status", "active")
    .maybeSingle();
  if (!competition) return null;

  const { data: playerTeam } = await supabase
    .from("teams")
    .select("id")
    .eq("competition_id", competition.id)
    .eq("is_player", true)
    .maybeSingle();
  if (!playerTeam) return null;

  const match = await nextMatchForTeam(supabase, competition.id, playerTeam.id);
  return match ? buildContext(supabase, "cup", match, playerTeam.id) : null;
}

async function findWorldMatch(
  supabase: any,
  trainerId: string,
  currentTeamId: string | null | undefined,
  competition: "world_league" | "world_cup",
) {
  const seasonId = await currentSeasonId(supabase, trainerId);
  if (!seasonId) return null;

  const { data: comp } = await supabase
    .from("competitions")
    .select("id")
    .eq("trainer_id", trainerId)
    .eq("type", competition)
    .eq("season_id", seasonId)
    .eq("status", "active")
    .maybeSingle();
  if (!comp) return null;

  const playerTeam = await resolveCurrentTeam(supabase, trainerId, currentTeamId);
  if (!playerTeam) return null;

  const match = await nextMatchForTeam(supabase, comp.id, playerTeam.id);
  return match ? buildContext(supabase, competition, match, playerTeam.id) : null;
}

export async function getNextOfficialMatchForTrainer(
  supabase: any,
  trainer: { id: string; current_team_id?: string | null },
  requested?: OfficialCompetition,
): Promise<OfficialMatchContext | null> {
  const finders: Record<OfficialCompetition, () => Promise<OfficialMatchContext | null>> = {
    league: () => findLeagueMatch(supabase, trainer.id, trainer.current_team_id),
    cup: () => findDomesticCupMatch(supabase, trainer.id),
    world_league: () => findWorldMatch(supabase, trainer.id, trainer.current_team_id, "world_league"),
    world_cup: () => findWorldMatch(supabase, trainer.id, trainer.current_team_id, "world_cup"),
  };

  if (requested) return finders[requested]();

  for (const competition of ["world_cup", "world_league", "league", "cup"] as const) {
    const match = await finders[competition]();
    if (match) return match;
  }
  return null;
}