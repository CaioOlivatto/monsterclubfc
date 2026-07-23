// Fase 3 — Carreira do Treinador: registrar temporada, decidir demissão e gerar propostas.
// Chamado do fluxo de fim de temporada em league.functions.ts.
//
// ATOMICIDADE: todas as escritas deste bloco (trainer_career, qualifications,
// trainers update, job_offers expirar/inserir, messages) são acumuladas em um
// payload e aplicadas via a RPC `apply_end_of_season_block` numa única
// transação Postgres. Se qualquer passo falhar, NADA fica persistido.
// Débito técnico conhecido: as fases 1–2 do handler (standings, promoção,
// calendário) ainda escrevem sem atomicidade. Reavaliar se novas escritas
// forem adicionadas ao fim de temporada.

const DIVISION_ORDER = ["bronze", "prata", "ouro", "diamante", "lendaria"] as const;
type Division = typeof DIVISION_ORDER[number];

// Bônus de contratação por divisão do clube que oferta.
const SIGNING_BONUS: Record<Division, number> = {
  bronze: 20_000,
  prata: 60_000,
  ouro: 150_000,
  diamante: 400_000,
  lendaria: 900_000,
};

export interface SeasonOutcomeInput {
  supabase: any;
  trainerId: string;
  trainerCurrentTeamId: string | null;
  seasonNumber: number;
  playerDivision: Division;
  playerPosition: number; // 1-based
  totalTeams: number;
  promoted: boolean;
  relegated: boolean;
  isChampion: boolean;
}

export interface SeasonOutcomeResult {
  fired: boolean;
  reasonFired: string | null;
  offersGenerated: number;
  isBadSeason: boolean;
}

export async function applySeasonOutcome(input: SeasonOutcomeInput): Promise<SeasonOutcomeResult> {
  const {
    supabase,
    trainerId,
    trainerCurrentTeamId,
    seasonNumber,
    playerDivision,
    playerPosition,
    totalTeams,
    promoted,
    relegated,
    isChampion,
  } = input;

  const logPrefix = "[END_OF_SEASON]";

  // ---- Leituras (fora da transação; apenas coletam dados) ----
  const { data: trainer } = await supabase
    .from("trainers")
    .select("id, trainer_name, seasons_at_current_club, consecutive_bad_seasons, status")
    .eq("id", trainerId)
    .maybeSingle();
  if (!trainer) return { fired: false, reasonFired: null, offersGenerated: 0, isBadSeason: false };

  const half = Math.ceil(totalTeams / 2);
  const isBadSeason = playerPosition > half;
  const newBadStreak = isBadSeason ? (trainer.consecutive_bad_seasons ?? 0) + 1 : 0;

  const teamNameRow = trainerCurrentTeamId
    ? (await supabase.from("teams").select("name").eq("id", trainerCurrentTeamId).maybeSingle()).data
    : null;
  const currentTeamName = teamNameRow?.name ?? "—";

  // ---- Buffer: eventos de carreira ----
  const careerEvents: any[] = [];
  const pushEvent = (event: string, title: string | null) =>
    careerEvents.push({
      trainer_id: trainerId,
      team_id: trainerCurrentTeamId,
      team_name: currentTeamName,
      division: playerDivision,
      season_start: seasonNumber,
      season_end: seasonNumber,
      final_position: playerPosition,
      event,
      title,
    });

  if (isChampion) pushEvent("champion", `Campeão da ${playerDivision}`);
  if (promoted) pushEvent("promoted", `Promovido de ${playerDivision}`);
  if (relegated) pushEvent("relegated", `Rebaixado da ${playerDivision}`);

  // Decisão de demissão
  const fired = relegated || newBadStreak >= 2;
  let reasonFired: string | null = null;
  if (fired) {
    if (relegated) reasonFired = "Rebaixamento da divisão";
    else reasonFired = `${newBadStreak} temporadas fracas seguidas`;
    pushEvent("fired", reasonFired);
  }

  // ---- Buffer: qualificações para próxima temporada ----
  const nextSeason = seasonNumber + 1;
  const qualifications: any[] = [];
  if (playerPosition >= 1 && playerPosition <= 4) {
    qualifications.push({
      trainer_id: trainerId,
      season_number: nextSeason,
      qualifies_for: "world_league",
      source_division: playerDivision,
      source_position: playerPosition,
    });
  }
  if (isChampion) {
    qualifications.push({
      trainer_id: trainerId,
      season_number: nextSeason,
      qualifies_for: "world_cup",
      source_division: playerDivision,
      source_position: 1,
    });
  }

  // ---- Buffer: atualização do treinador ----
  const trainerUpdate = {
    last_final_position: playerPosition,
    consecutive_bad_seasons: newBadStreak,
    seasons_at_current_club: fired ? 0 : (trainer.seasons_at_current_club ?? 0) + 1,
    status: fired ? "dismissed" : "employed",
    pending_transition: fired,
  };

  // ---- Buffer: propostas de trabalho ----
  const jobOffers = await buildOffers({
    supabase,
    trainerId,
    trainerCurrentTeamId,
    seasonNumber,
    playerDivision,
    fired,
  });

  // ---- Buffer: mensagens do inbox ----
  const messages: any[] = [];
  if (fired) {
    messages.push({
      trainer_id: trainerId,
      kind: "career",
      title: "Você foi demitido",
      body: `Motivo: ${reasonFired}. ${jobOffers.length} clube(s) demonstraram interesse.`,
    });
  } else if (jobOffers.length > 0) {
    messages.push({
      trainer_id: trainerId,
      kind: "career",
      title: `${jobOffers.length} proposta(s) de clubes recebidas`,
      body: "Sondagens do mercado de treinadores. Aceite para deixar o clube atual.",
    });
  }

  // ---- Aplicação atômica via RPC ----
  const payload = {
    trainer_id: trainerId,
    next_season: nextSeason,
    expire_old_offers: true,
    trainer_update: trainerUpdate,
    career_events: careerEvents,
    qualifications,
    job_offers: jobOffers,
    messages,
  };

  const { data: applied, error: rpcError } = await supabase.rpc("apply_end_of_season_block", {
    payload,
  });

  if (rpcError) {
    console.error(`${logPrefix} apply_end_of_season_block FAILED`, {
      trainerId,
      seasonNumber,
      error: rpcError.message,
      details: rpcError.details ?? null,
      hint: rpcError.hint ?? null,
    });
    throw new Error(`Falha ao aplicar fim de temporada (bloco de carreira): ${rpcError.message}`);
  }

  console.log(`${logPrefix} block applied`, {
    trainerId,
    seasonNumber,
    fired,
    applied,
  });

  return {
    fired,
    reasonFired,
    offersGenerated: jobOffers.length,
    isBadSeason,
  };
}

interface BuildOffersInput {
  supabase: any;
  trainerId: string;
  trainerCurrentTeamId: string | null;
  seasonNumber: number;
  playerDivision: Division;
  fired: boolean;
}

async function buildOffers(input: BuildOffersInput): Promise<any[]> {
  const { supabase, trainerId, trainerCurrentTeamId, seasonNumber, playerDivision, fired } = input;

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, division, is_player");
  const { data: standings } = await supabase
    .from("standings")
    .select("team_id, points, goals_for, goals_against");

  if (!teams || !standings) return [];

  const teamById = new Map<string, any>(teams.map((t: any) => [t.id, t]));
  const rankedByDiv = new Map<Division, string[]>();
  for (const div of DIVISION_ORDER) {
    const inDiv = standings
      .filter((s: any) => teamById.get(s.team_id)?.division === div)
      .sort((a: any, b: any) => {
        if (b.points !== a.points) return b.points - a.points;
        const gdA = (a.goals_for ?? 0) - (a.goals_against ?? 0);
        const gdB = (b.goals_for ?? 0) - (b.goals_against ?? 0);
        if (gdB !== gdA) return gdB - gdA;
        return (b.goals_for ?? 0) - (a.goals_for ?? 0);
      })
      .map((s: any) => s.team_id);
    rankedByDiv.set(div, inDiv);
  }

  const candidates: { teamId: string; reason: "top_finish" | "higher_division" | "after_dismissal"; division: Division }[] = [];
  const playerDivIdx = DIVISION_ORDER.indexOf(playerDivision);

  const topDiv = rankedByDiv.get(playerDivision) ?? [];
  for (const teamId of topDiv.slice(0, 6)) {
    if (teamId === trainerCurrentTeamId) continue;
    candidates.push({ teamId, reason: "top_finish", division: playerDivision });
  }

  for (let i = playerDivIdx + 1; i < DIVISION_ORDER.length; i++) {
    const div = DIVISION_ORDER[i];
    const ranked = rankedByDiv.get(div) ?? [];
    if (!ranked.length) continue;
    const half = Math.ceil(ranked.length / 2);
    for (let pos = half; pos < ranked.length; pos++) {
      candidates.push({ teamId: ranked[pos], reason: "higher_division", division: div });
    }
  }

  if (fired) {
    const own = rankedByDiv.get(playerDivision) ?? [];
    for (const teamId of own.slice(-4)) {
      if (teamId === trainerCurrentTeamId) continue;
      candidates.push({ teamId, reason: "after_dismissal", division: playerDivision });
    }
    if (playerDivIdx > 0) {
      const lower = DIVISION_ORDER[playerDivIdx - 1];
      for (const teamId of (rankedByDiv.get(lower) ?? []).slice(0, 6)) {
        candidates.push({ teamId, reason: "after_dismissal", division: lower });
      }
    }
  }

  const maxOffers = fired ? 6 : Math.min(4, 2 + Math.floor(Math.random() * 3));
  const priority = { top_finish: 0, higher_division: 1, after_dismissal: 2 } as const;
  candidates.sort((a, b) => priority[a.reason] - priority[b.reason]);
  const selected = candidates.slice(0, maxOffers);
  if (!selected.length) return [];

  const rows = selected.map((c) => {
    const team = teamById.get(c.teamId);
    return {
      trainer_id: trainerId,
      team_id: c.teamId,
      team_name: team?.name ?? "—",
      division: c.division,
      season_offered: seasonNumber,
      reason: c.reason,
      status: "pending" as const,
      signing_bonus: Math.round(SIGNING_BONUS[c.division] * (c.reason === "after_dismissal" ? 0.5 : 1)),
      message: buildOfferMessage(c.reason, team?.name ?? "clube"),
    };
  });

  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.team_id)) return false;
    seen.add(r.team_id);
    return true;
  });
}

function buildOfferMessage(reason: "top_finish" | "higher_division" | "after_dismissal", teamName: string): string {
  switch (reason) {
    case "top_finish":
      return `A diretoria do ${teamName} acompanhou sua boa temporada e quer você no comando.`;
    case "higher_division":
      return `O ${teamName} decepcionou seus torcedores e busca um técnico ambicioso.`;
    case "after_dismissal":
      return `O ${teamName} abre as portas para reconstruir sua carreira.`;
  }
}
