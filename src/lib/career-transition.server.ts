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

// Bônus de boas-vindas por divisão do NOVO clube: 10× receita fixa por partida
// (TV + Patrocínio + Merchandising, ver MATCH_REVENUE em src/lib/economy.ts).
// Vale tanto para "aceitar proposta" quanto para "reempregar após demissão".
export const WELCOME_BONUS: Record<Division, number> = {
  bronze:      210_000,
  prata:       500_000,
  ouro:      1_030_000,
  diamante:  2_090_000,
  lendaria:  3_980_000,
};

// Alias legado — usa os mesmos valores agora (não duplicar lógica).
const SIGNING_BONUS = WELCOME_BONUS;

// Gatilho adicional de proposta por sequência de vitórias na temporada.
const WIN_STREAK_TRIGGERS: { streak: number; chance: number }[] = [
  { streak: 10, chance: 0.70 },
  { streak: 7,  chance: 0.45 },
];

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
  const trainerPromise = supabase
    .from("trainers")
    .select("id, trainer_name, seasons_at_current_club, consecutive_bad_seasons, status")
    .eq("id", trainerId)
    .maybeSingle();
  const teamNamePromise = trainerCurrentTeamId
    ? supabase.from("teams").select("name").eq("id", trainerCurrentTeamId).maybeSingle()
    : Promise.resolve({ data: null });
  const [{ data: trainer }, { data: teamNameRow }] = await Promise.all([
    trainerPromise,
    teamNamePromise,
  ]);
  if (!trainer) return { fired: false, reasonFired: null, offersGenerated: 0, isBadSeason: false };

  const half = Math.ceil(totalTeams / 2);
  const isBadSeason = playerPosition > half;
  const newBadStreak = isBadSeason ? (trainer.consecutive_bad_seasons ?? 0) + 1 : 0;

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

  // ---- Gatilho de sequência de vitórias na temporada ----
  const bestStreak = await computeBestWinStreak(supabase, trainerCurrentTeamId);
  let streakChance = 0;
  for (const t of WIN_STREAK_TRIGGERS) {
    if (bestStreak >= t.streak) { streakChance = Math.max(streakChance, t.chance); }
  }
  const streakTriggered = streakChance > 0 && Math.random() < streakChance;

  const topFinishTriggered = playerPosition <= 6 || isChampion;
  const shouldGenerateInterestOffers = !fired && (topFinishTriggered || streakTriggered);

  // ---- Buffer: propostas de trabalho ----
  const jobOffers = await buildOffers({
    supabase,
    trainerId,
    trainerCurrentTeamId,
    seasonNumber,
    playerDivision,
    fired,
    generateInterest: shouldGenerateInterestOffers,
    streakTriggered,
    bestStreak,
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
    // Pausa de pré-temporada: energia 100% para todo o mundo do treinador
    // (inclui lesionados; moral NÃO é alterado).
    reset_energy: true,
    // Mesma lógica de recomeço: pool de "Descansar" volta a 3/3 grátis.
    reset_rest_pool: true,
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
  generateInterest: boolean;
  streakTriggered: boolean;
  bestStreak: number;
}

type OfferReason = "top_finish" | "higher_division" | "after_dismissal";

async function buildOffers(input: BuildOffersInput): Promise<any[]> {
  const {
    supabase, trainerId, trainerCurrentTeamId, seasonNumber,
    playerDivision, fired, generateInterest, streakTriggered, bestStreak,
  } = input;

  const [{ data: teams }, { data: standings }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, division, is_player"),
    supabase
      .from("standings")
      .select("team_id, points, goals_for, goals_against"),
  ]);
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

  const playerDivIdx = DIVISION_ORDER.indexOf(playerDivision);

  // ---- Caminho DEMISSÃO: exatamente 2 opções (A e B) ----
  if (fired) {
    const rows: any[] = [];

    // Opção A: mesma divisão, posição 9-12 (intermediário baixo)
    const sameDiv = rankedByDiv.get(playerDivision) ?? [];
    const poolA = sameDiv
      .slice(8, 12)
      .filter((id) => id !== trainerCurrentTeamId);
    const optionA = pickRandom(poolA);
    if (optionA) rows.push(makeOfferRow({
      teamId: optionA,
      teamById,
      division: playerDivision,
      trainerId, seasonNumber,
      reason: "after_dismissal",
      messageKind: "dismissal_same",
    }));

    // Opção B: divisão abaixo, posição 4-7 (intermediário alto)
    if (playerDivIdx > 0) {
      const lowerDiv = DIVISION_ORDER[playerDivIdx - 1];
      const poolB = (rankedByDiv.get(lowerDiv) ?? [])
        .slice(3, 7)
        .filter((id) => id !== trainerCurrentTeamId);
      const optionB = pickRandom(poolB);
      if (optionB) rows.push(makeOfferRow({
        teamId: optionB,
        teamById,
        division: lowerDiv,
        trainerId, seasonNumber,
        reason: "after_dismissal",
        messageKind: "dismissal_lower",
      }));
    }
    return dedupeByTeam(rows);
  }

  // ---- Caminho INTERESSE (top-6/champion ou sequência de vitórias) ----
  if (!generateInterest) return [];

  // Origem: divisão imediatamente acima, clube da metade de baixo.
  // Evita saltos artificiais da Bronze direto para a elite e cria uma carreira
  // legível: Bronze → Prata → Ouro → Diamante → Lendária.
  const candidates: { teamId: string; division: Division; reason: OfferReason }[] = [];
  const nextDivision = DIVISION_ORDER[playerDivIdx + 1];
  if (nextDivision) {
    const div = nextDivision;
    const ranked = rankedByDiv.get(div) ?? [];
    if (ranked.length) {
      const half = Math.ceil(ranked.length / 2);
      for (let pos = half; pos < ranked.length; pos++) {
        candidates.push({
          teamId: ranked[pos],
          division: div,
          reason: streakTriggered ? "higher_division" : "top_finish",
        });
      }
    }
  }
  if (!candidates.length) return [];

  // Embaralha e limita
  const maxOffers = Math.min(4, 2 + Math.floor(Math.random() * 3));
  const shuffled = [...candidates].sort(() => Math.random() - 0.5).slice(0, maxOffers);

  const rows = shuffled.map((c) => makeOfferRow({
    teamId: c.teamId,
    teamById,
    division: c.division,
    trainerId, seasonNumber,
    reason: c.reason,
    messageKind: streakTriggered ? "streak" : "top_finish",
    bestStreak,
  }));
  return dedupeByTeam(rows);
}

function pickRandom<T>(arr: T[]): T | null {
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function dedupeByTeam(rows: any[]): any[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.team_id)) return false;
    seen.add(r.team_id);
    return true;
  });
}

function makeOfferRow(args: {
  teamId: string;
  teamById: Map<string, any>;
  division: Division;
  trainerId: string;
  seasonNumber: number;
  reason: OfferReason;
  messageKind: "dismissal_same" | "dismissal_lower" | "top_finish" | "streak";
  bestStreak?: number;
}): any {
  const team = args.teamById.get(args.teamId);
  return {
    trainer_id: args.trainerId,
    team_id: args.teamId,
    team_name: team?.name ?? "—",
    division: args.division,
    season_offered: args.seasonNumber,
    reason: args.reason,
    status: "pending" as const,
    signing_bonus: WELCOME_BONUS[args.division],
    message: buildOfferMessage(args.messageKind, team?.name ?? "clube", args.bestStreak),
  };
}

function buildOfferMessage(
  kind: "dismissal_same" | "dismissal_lower" | "top_finish" | "streak",
  teamName: string,
  bestStreak?: number,
): string {
  switch (kind) {
    case "dismissal_same":
      return `O ${teamName} luta na parte de baixo da tabela e busca um técnico experiente para virar o barco.`;
    case "dismissal_lower":
      return `O ${teamName} tenta subir de divisão e vê em você o técnico ideal para o projeto.`;
    case "top_finish":
      return `A diretoria do ${teamName} acompanhou sua boa temporada e quer você no comando.`;
    case "streak":
      return `O ${teamName} ficou impressionado com sua sequência de ${bestStreak ?? 7} vitórias seguidas nesta temporada.`;
  }
}

/** Maior sequência de vitórias em partidas oficiais da temporada atual do jogador. */
async function computeBestWinStreak(supabase: any, playerTeamId: string | null): Promise<number> {
  if (!playerTeamId) return 0;
  const { data: matches } = await supabase
    .from("matches")
    .select("home_team_id, away_team_id, home_score, away_score, status, is_friendly, played_at")
    .or(`home_team_id.eq.${playerTeamId},away_team_id.eq.${playerTeamId}`)
    .eq("status", "finished")
    .eq("is_friendly", false)
    .order("played_at", { ascending: true })
    .limit(60);
  let best = 0;
  let cur = 0;
  for (const m of matches ?? []) {
    const isHome = m.home_team_id === playerTeamId;
    const my = isHome ? m.home_score : m.away_score;
    const opp = isHome ? m.away_score : m.home_score;
    if (my == null || opp == null) continue;
    if (my > opp) { cur++; if (cur > best) best = cur; }
    else { cur = 0; }
  }
  return best;
}
