// Fase 3 — Carreira do Treinador: registrar temporada, decidir demissão e gerar propostas.
// Chamado do fluxo de fim de temporada em league.functions.ts.
import { insertMessage } from "./xp.server";

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

/**
 * Regras (GDD):
 * - "Temporada ruim" = terminou na metade de baixo da tabela.
 * - Demissão: rebaixado OU 2 temporadas ruins consecutivas OU 3 temporadas ruins acumuladas.
 * - Propostas: Top 6 da mesma divisão (exceto o time atual) + qualquer time de divisão
 *   superior que terminou na metade de baixo (procura por técnico melhor).
 * - Se demitido, gera propostas mais fracas (após demissão) além das normais.
 */
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

  // 1) Carrega treinador
  const { data: trainer } = await supabase
    .from("trainers")
    .select("id, trainer_name, seasons_at_current_club, consecutive_bad_seasons, status")
    .eq("id", trainerId)
    .maybeSingle();
  if (!trainer) return { fired: false, reasonFired: null, offersGenerated: 0, isBadSeason: false };

  const half = Math.ceil(totalTeams / 2);
  const isBadSeason = playerPosition > half;
  const newBadStreak = isBadSeason ? (trainer.consecutive_bad_seasons ?? 0) + 1 : 0;

  // 2) Registra evento(s) de fim de temporada em trainer_career
  const events: any[] = [];
  const teamNameRow = trainerCurrentTeamId
    ? (
        await supabase
          .from("teams")
          .select("name")
          .eq("id", trainerCurrentTeamId)
          .maybeSingle()
      ).data
    : null;
  const currentTeamName = teamNameRow?.name ?? "—";

  if (isChampion) {
    events.push({
      trainer_id: trainerId,
      team_id: trainerCurrentTeamId,
      team_name: currentTeamName,
      division: playerDivision,
      season_start: seasonNumber,
      season_end: seasonNumber,
      final_position: playerPosition,
      event: "champion",
      title: `Campeão da ${playerDivision}`,
    });
  }
  if (promoted) {
    events.push({
      trainer_id: trainerId,
      team_id: trainerCurrentTeamId,
      team_name: currentTeamName,
      division: playerDivision,
      season_start: seasonNumber,
      season_end: seasonNumber,
      final_position: playerPosition,
      event: "promoted",
      title: `Promovido de ${playerDivision}`,
    });
  }
  if (relegated) {
    events.push({
      trainer_id: trainerId,
      team_id: trainerCurrentTeamId,
      team_name: currentTeamName,
      division: playerDivision,
      season_start: seasonNumber,
      season_end: seasonNumber,
      final_position: playerPosition,
      event: "relegated",
      title: `Rebaixado da ${playerDivision}`,
    });
  }

  // 3) Decide demissão
  const fired = relegated || newBadStreak >= 2 || newBadStreak >= 3;
  let reasonFired: string | null = null;
  if (fired) {
    if (relegated) reasonFired = "Rebaixamento da divisão";
    else if (newBadStreak >= 2) reasonFired = `${newBadStreak} temporadas fracas seguidas`;
    events.push({
      trainer_id: trainerId,
      team_id: trainerCurrentTeamId,
      team_name: currentTeamName,
      division: playerDivision,
      season_start: seasonNumber,
      season_end: seasonNumber,
      final_position: playerPosition,
      event: "fired",
      title: reasonFired,
    });
  }

  if (events.length) await supabase.from("trainer_career").insert(events);

  // 4) Atualiza contadores do treinador
  await supabase
    .from("trainers")
    .update({
      last_final_position: playerPosition,
      consecutive_bad_seasons: newBadStreak,
      seasons_at_current_club: fired ? 0 : (trainer.seasons_at_current_club ?? 0) + 1,
      status: fired ? "dismissed" : "employed",
      pending_transition: fired,
    })
    .eq("id", trainerId);

  // 5) Gera propostas
  const offersGenerated = await generateOffers({
    supabase,
    trainerId,
    trainerCurrentTeamId,
    seasonNumber,
    playerDivision,
    fired,
  });

  // 6) Mensagem no inbox
  if (fired) {
    await insertMessage(
      supabase,
      trainerId,
      "career",
      "Você foi demitido",
      `Motivo: ${reasonFired}. ${offersGenerated} clube(s) demonstraram interesse.`,
    );
  } else if (offersGenerated > 0) {
    await insertMessage(
      supabase,
      trainerId,
      "career",
      `${offersGenerated} proposta(s) de clubes recebidas`,
      "Sondagens do mercado de treinadores. Aceite para deixar o clube atual.",
    );
  }

  return { fired, reasonFired, offersGenerated, isBadSeason };
}

interface GenerateOffersInput {
  supabase: any;
  trainerId: string;
  trainerCurrentTeamId: string | null;
  seasonNumber: number;
  playerDivision: Division;
  fired: boolean;
}

async function generateOffers(input: GenerateOffersInput): Promise<number> {
  const { supabase, trainerId, trainerCurrentTeamId, seasonNumber, playerDivision, fired } = input;

  // Marca propostas antigas como expiradas
  await supabase
    .from("job_offers")
    .update({ status: "expired" })
    .eq("trainer_id", trainerId)
    .eq("status", "pending");

  // Carrega standings + times para escolher candidatos
  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, division, is_player");
  const { data: standings } = await supabase
    .from("standings")
    .select("team_id, points, goals_for, goals_against");

  if (!teams || !standings) return 0;

  const teamById = new Map<string, any>(teams.map((t: any) => [t.id, t]));
  // Rankings por divisão
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

  // (a) Top 6 da divisão atual (exceto o próprio time)
  const topDiv = rankedByDiv.get(playerDivision) ?? [];
  for (const teamId of topDiv.slice(0, 6)) {
    if (teamId === trainerCurrentTeamId) continue;
    candidates.push({ teamId, reason: "top_finish", division: playerDivision });
  }

  // (b) Times de divisão superior que ficaram na metade de baixo
  for (let i = playerDivIdx + 1; i < DIVISION_ORDER.length; i++) {
    const div = DIVISION_ORDER[i];
    const ranked = rankedByDiv.get(div) ?? [];
    if (!ranked.length) continue;
    const half = Math.ceil(ranked.length / 2);
    for (let pos = half; pos < ranked.length; pos++) {
      candidates.push({ teamId: ranked[pos], reason: "higher_division", division: div });
    }
  }

  // Se demitido, adiciona clubes fracos como rede de segurança (final da divisão atual + inferior)
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

  // Limita quantidade final (3–6 propostas)
  const maxOffers = fired ? 6 : Math.min(4, 2 + Math.floor(Math.random() * 3));
  // Ordena por prioridade: top_finish > higher_division > after_dismissal
  const priority = { top_finish: 0, higher_division: 1, after_dismissal: 2 } as const;
  candidates.sort((a, b) => priority[a.reason] - priority[b.reason]);
  const selected = candidates.slice(0, maxOffers);

  if (!selected.length) return 0;

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
      signing_bonus: SIGNING_BONUS[c.division] * (c.reason === "after_dismissal" ? 0.5 : 1),
      message: buildOfferMessage(c.reason, team?.name ?? "clube"),
    };
  });

  // Deduplica por (team_id) — mantém a primeira (mais prioritária)
  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    if (seen.has(r.team_id)) return false;
    seen.add(r.team_id);
    return true;
  });

  const { error } = await supabase.from("job_offers").insert(unique);
  if (error) throw error;
  return unique.length;
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
