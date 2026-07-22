import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  analyzeMatchup,
  generateCpuSideFor,
  type EngineSide,
  type EngineBestiary,
  type PrognosticAnalysis,
} from "./match-engine.server";
import { buildPlayerSideFromDb } from "./player-side.server";
import { loadBestiary } from "./bestiary.server";
import { WORLD_TEAMS, type DivisionSlug } from "./world/catalog";

function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

async function getTrainer(supabase: any, userId: string) {
  const { data } = await supabase
    .from("trainers")
    .select("id, academy_name")
    .eq("user_id", userId).maybeSingle();
  if (!data) throw new Error("Treinador não encontrado.");
  return data as { id: string; academy_name: string };
}

async function loadEngineBestiary(supabase: any): Promise<EngineBestiary> {
  const raw = await loadBestiary(supabase);
  return {
    species: raw.species.map((s) => ({ species: s.species, element: s.element, is_goalkeeper: s.position === "Goleiro" })),
    epithets: raw.epithets,
  };
}

export interface PrognosticResponse {
  analysis: PrognosticAnalysis;
  opponent: { name: string; is_next_official: boolean; round?: number | null; is_home: boolean };
}

/**
 * Prognóstico da PRÓXIMA partida do jogador (liga ou copa se agendada);
 * caso contrário, contra um oponente de força média da mesma divisão
 * (proxy para amistoso).
 */
export const getLineupPrognostic = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PrognosticResponse> => {
    const { supabase, userId } = context;
    const trainer = await getTrainer(supabase, userId);
    const bestiary = await loadEngineBestiary(supabase);

    // Time do jogador na liga ativa (para achar próximo jogo).
    const { data: playerLeagueTeam } = await supabase
      .from("teams")
      .select("id, name, division, competition_id")
      .eq("trainer_id", trainer.id)
      .eq("is_player", true)
      .not("competition_id", "is", null)
      .maybeSingle();

    let nextMatch: any = null;
    if (playerLeagueTeam) {
      const { data: nm } = await supabase
        .from("matches")
        .select("id, round, home_team_id, away_team_id")
        .eq("competition_id", playerLeagueTeam.competition_id)
        .eq("status", "scheduled")
        .or(`home_team_id.eq.${playerLeagueTeam.id},away_team_id.eq.${playerLeagueTeam.id}`)
        .order("round", { ascending: true })
        .limit(1)
        .maybeSingle();
      nextMatch = nm;
    }

    const playerName = trainer.academy_name;
    const playerTeamId = playerLeagueTeam?.id ?? `p-${trainer.id}`;

    let opponentSide: EngineSide;
    let opponentInfo: PrognosticResponse["opponent"];
    let playerIsHome = true;

    if (nextMatch && playerLeagueTeam) {
      playerIsHome = nextMatch.home_team_id === playerLeagueTeam.id;
      const oppId = playerIsHome ? nextMatch.away_team_id : nextMatch.home_team_id;
      const { data: opp } = await supabase
        .from("teams").select("id, name, cpu_strength").eq("id", oppId).maybeSingle();
      const strength = opp?.cpu_strength ?? 45;
      opponentSide = generateCpuSideFor(hashSeed(oppId), oppId, opp?.name ?? "Adversário", strength, bestiary);
      opponentInfo = { name: opp?.name ?? "Adversário", is_next_official: true, round: nextMatch.round, is_home: playerIsHome };
    } else {
      // Proxy: adversário aleatório da divisão do jogador (para amistoso)
      const division = ((playerLeagueTeam?.division as DivisionSlug | undefined) ?? "bronze");
      const pool = (WORLD_TEAMS[division] ?? WORLD_TEAMS.bronze).filter((t) => t.name !== playerName);
      const opp = pool[Math.floor(Math.random() * pool.length)] ?? pool[0];
      // força média do elenco do jogador — para amistoso balanceado
      const { data: creatures } = await supabase
        .from("creatures").select("overall").eq("owner_trainer_id", trainer.id);
      const avgOvr = creatures?.length
        ? Math.round(creatures.reduce((a: number, c: any) => a + (c.overall ?? 40), 0) / creatures.length)
        : 45;
      opponentSide = generateCpuSideFor(hashSeed(opp.name), `friendly-${opp.name}`, opp.name, avgOvr, bestiary);
      opponentInfo = { name: opp.name, is_next_official: false, is_home: true };
    }

    // Precisa de escalação salva. Se não houver, retorna erro amigável.
    let playerSide: EngineSide;
    try {
      playerSide = await buildPlayerSideFromDb(supabase, trainer.id, playerTeamId, playerName);
    } catch (e: any) {
      throw new Error(e?.message ?? "Salve a escalação para ver o prognóstico.");
    }

    const home = playerIsHome ? playerSide : opponentSide;
    const away = playerIsHome ? opponentSide : playerSide;
    const seed = hashSeed(playerTeamId + opponentInfo.name);
    const analysis = analyzeMatchup(home, away, seed, 400);

    // Se o jogador é visitante, "trocamos" o rótulo para que "home_win" seja sempre o jogador na UI.
    if (!playerIsHome) {
      const swapped: PrognosticAnalysis = {
        ...analysis,
        odds: {
          ...analysis.odds,
          home_win: analysis.odds.away_win,
          away_win: analysis.odds.home_win,
          avg_home_goals: analysis.odds.avg_away_goals,
          avg_away_goals: analysis.odds.avg_home_goals,
        },
        sector_summary: { home: analysis.sector_summary.away, away: analysis.sector_summary.home },
      };
      return { analysis: swapped, opponent: opponentInfo };
    }
    return { analysis, opponent: opponentInfo };
  });
