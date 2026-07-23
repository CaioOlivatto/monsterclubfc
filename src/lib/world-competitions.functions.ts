import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  hashSeed,
  mulberry32,
  simulateSummaryScore,
  decideKnockoutWinner,
  drawLeagueGroups,
  groupFixtures,
  LEAGUE_PHASE_NAMES,
  CUP_PHASE_NAMES,
  type Division,
  type PoolTeam,
} from "./world-competitions.server";
import {
  simulate,
  persistableSimulationEvents,
  generateCpuSideFor,
  type EngineBestiary,
  type EngineSide,
} from "./match-engine.server";
import { loadBestiary } from "./bestiary.server";
import { buildPlayerSideFromDb } from "./player-side.server";
import { applyPostMatchXp, insertMessage } from "./xp.server";
import { MATCH_REVENUE, MAINTENANCE_PER_MATCH, matchSalary, type Division as EconDivision } from "./economy";

// Premiação por partida em competições MUNDIAIS — maiores que Campeonato.
// Grupos: V/E/D. Mata-mata (avançar vale mais que a fase de grupos).
const WORLD_LEAGUE_GROUP_PRIZE: [number, number, number] = [80_000, 30_000, 10_000];
const WORLD_LEAGUE_KO_PRIZE:    [number, number, number] = [180_000, 0, 40_000];  // vencer/perder (empate decidido)
const WORLD_CUP_KO_PRIZE:       [number, number, number] = [140_000, 0, 30_000];



/* ------------- helpers ------------- */

async function loadEngineBestiary(supabase: any): Promise<EngineBestiary> {
  const b = await loadBestiary(supabase);
  return {
    species: b.species.map((s: any) => ({
      species: s.species,
      element: s.element,
      is_goalkeeper: s.position === "Goleiro",
    })),
    epithets: b.epithets,
  };
}

async function getTrainer(supabase: any, userId: string) {
  const { data } = await supabase
    .from("trainers")
    .select("id, academy_name")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Treinador não encontrado.");
  return data as { id: string; academy_name: string };
}

async function getCurrentSeason(supabase: any, trainerId: string) {
  const { data } = await supabase
    .from("game_seasons")
    .select("id, season_number")
    .eq("trainer_id", trainerId)
    .eq("is_current", true)
    .maybeSingle();
  if (!data) throw new Error("Sem temporada ativa.");
  return data as { id: string; season_number: number };
}

async function getPlayerLeagueTeam(supabase: any, trainerId: string) {
  // Pode haver múltiplos times "player" (carreira antiga). Prioriza o que tem
  // divisão definida (o time atual da liga).
  const { data } = await supabase
    .from("teams")
    .select("id, name, division, dominant_element, colors, color, competition_id, created_at")
    .eq("trainer_id", trainerId)
    .eq("is_player", true)
    .not("division", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function computeTeamStrengths(supabase: any, teamIds: string[]): Promise<Map<string, number>> {
  if (!teamIds.length) return new Map();
  const { data } = await supabase
    .from("creatures")
    .select("owner_team_id, overall")
    .in("owner_team_id", teamIds);
  const totals = new Map<string, { sum: number; n: number }>();
  for (const c of (data ?? []) as any[]) {
    const t = totals.get(c.owner_team_id) ?? { sum: 0, n: 0 };
    t.sum += c.overall; t.n++;
    totals.set(c.owner_team_id, t);
  }
  const out = new Map<string, number>();
  for (const [id, t] of totals) out.set(id, t.n ? t.sum / t.n : 45);
  return out;
}

/**
 * BIFURCAÇÃO CRÍTICA — decide qual motor rodar em cada partida da rodada.
 *   - Se o time do jogador está em campo → motor de duelos completo
 *     (mesmo `simulate()` do Campeonato/Amistoso, com narração 3 tempos,
 *     fadiga, moral, elemental, táticas ao vivo, cartões, lesões).
 *   - CPU vs CPU → Poisson resumido (rápido, sem narração).
 */
async function simulatePlayerMatch(
  supabase: any,
  trainerId: string,
  matchRow: { id: string; home_team_id: string; away_team_id: string },
  playerTeamId: string,
  bestiary: EngineBestiary,
): Promise<{ home_score: number; away_score: number }> {
  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, cpu_strength")
    .in("id", [matchRow.home_team_id, matchRow.away_team_id]);
  const home = teams!.find((t: any) => t.id === matchRow.home_team_id) as any;
  const away = teams!.find((t: any) => t.id === matchRow.away_team_id) as any;

  const buildSide = async (t: any) => {
    if (t.id === playerTeamId) {
      return await buildPlayerSideFromDb(supabase, trainerId, t.id, t.name);
    }
    return generateCpuSideFor(hashSeed(t.id), t.id, t.name, t.cpu_strength ?? 45, bestiary);
  };
  const homeSide = await buildSide(home);
  const awaySide = await buildSide(away);
  const seed = hashSeed(matchRow.id);
  const result = simulate(homeSide, awaySide, seed);

  await supabase.from("matches").update({
    home_score: result.home_score,
    away_score: result.away_score,
    status: "finished",
    clima: result.weather,
    played_at: new Date().toISOString(),
  }).eq("id", matchRow.id);

  const ev = persistableSimulationEvents(result).map((e) => ({
    match_id: matchRow.id,
    minute: e.minute,
    event_type: e.event_type,
    description: e.description,
    actor_creature_id:
      e.actor_creature_id && !e.actor_creature_id.startsWith("cpu-") ? e.actor_creature_id : null,
    actor_team_id: e.actor_team_id,
    meta: (e.meta ?? null) as any,
  }));
  if (ev.length) await supabase.from("match_events").insert(ev);

  return { home_score: result.home_score, away_score: result.away_score };
}

async function simulateCpuMatch(
  supabase: any,
  matchRow: { id: string; home_team_id: string; away_team_id: string },
  strengths: Map<string, number>,
  neutral: boolean,
): Promise<{ home_score: number; away_score: number }> {
  const hs = strengths.get(matchRow.home_team_id) ?? 45;
  const as_ = strengths.get(matchRow.away_team_id) ?? 45;
  const seed = hashSeed(matchRow.id);
  const s = simulateSummaryScore(hs, as_, seed, neutral);
  await supabase.from("matches").update({
    home_score: s.home,
    away_score: s.away,
    status: "finished",
    is_summary: true,
    played_at: new Date().toISOString(),
  }).eq("id", matchRow.id);
  return { home_score: s.home, away_score: s.away };
}

export const getWorldCompetitionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const trainer = await getTrainer(supabase, userId);
    const season = await getCurrentSeason(supabase, trainer.id).catch(() => null);
    if (!season) return { seasonNumber: 1, isFirstSeason: true, qualifiedLeague: null, qualifiedCup: null };
    const { data: quals } = await supabase
      .from("qualifications")
      .select("qualifies_for, source_division, source_position")
      .eq("trainer_id", trainer.id)
      .eq("season_number", season.season_number);
    return {
      seasonNumber: season.season_number,
      isFirstSeason: season.season_number === 1,
      qualifiedLeague: (quals ?? []).find((q: any) => q.qualifies_for === "world_league") ?? null,
      qualifiedCup: (quals ?? []).find((q: any) => q.qualifies_for === "world_cup") ?? null,
    };
  });

/* ================================================
 * LIGA MUNDIAL — 20 times, 4 GRUPOS DE 5 + QF/SF/Final
 * Rodadas: 1-5 grupos (5 rodadas, 1 folga/time/rodada); 6=QF, 7=SF, 8=Final
 * ================================================ */

async function pickLeaguePool(
  supabase: any, trainerId: string, seasonNumber: number, playerTeamId: string,
): Promise<PoolTeam[]> {
  const DIVS: Division[] = ["lendaria", "diamante", "ouro", "prata", "bronze"];
  const pool: PoolTeam[] = [];
  const { data: lastSeason } = await supabase
    .from("game_seasons").select("id")
    .eq("trainer_id", trainerId).eq("season_number", seasonNumber - 1).maybeSingle();

  const compIdsByDiv: Record<Division, string | null> = {} as any;
  if (lastSeason) {
    const { data: comps } = await supabase
      .from("competitions").select("id, division")
      .eq("trainer_id", trainerId).eq("type", "league").eq("season_id", lastSeason.id);
    for (const d of DIVS) compIdsByDiv[d] = null;
    for (const c of (comps ?? []) as any[]) compIdsByDiv[c.division as Division] = c.id;
  }

  const seenTeamIds = new Set<string>();
  for (const div of DIVS) {
    let topTeamIds: string[] = [];
    const compId = lastSeason ? compIdsByDiv[div] : null;
    if (compId) {
      const { data: st } = await supabase
        .from("standings")
        .select("team_id, points, goals_for, goals_against")
        .eq("competition_id", compId)
        .order("points", { ascending: false })
        .limit(50);
      const rows = (st ?? []).slice();
      rows.sort((a: any, b: any) => (b.points - a.points) || ((b.goals_for - b.goals_against) - (a.goals_for - a.goals_against)));
      topTeamIds = rows.slice(0, 4).map((r: any) => r.team_id);
    }
    if (topTeamIds.length < 4) {
      const { data: divTeams } = await supabase.from("teams").select("id").eq("division", div);
      const ids = ((divTeams ?? []) as any[]).map((t) => t.id);
      const strengths = await computeTeamStrengths(supabase, ids);
      const sorted = ids.slice().sort((a, b) => (strengths.get(b) ?? 0) - (strengths.get(a) ?? 0));
      for (const id of sorted) {
        if (topTeamIds.includes(id)) continue;
        topTeamIds.push(id);
        if (topTeamIds.length === 4) break;
      }
    }
    for (const id of topTeamIds) seenTeamIds.add(id);
  }

  if (!seenTeamIds.has(playerTeamId)) {
    const { data: pTeam } = await supabase.from("teams").select("division").eq("id", playerTeamId).maybeSingle();
    const pdiv = pTeam?.division as Division | undefined;
    if (pdiv) {
      const { data: allDivPool } = await supabase.from("teams").select("id, division").in("id", Array.from(seenTeamIds)).eq("division", pdiv);
      const toRemove = ((allDivPool ?? []) as any[])[3] ?? ((allDivPool ?? []) as any[])[0];
      if (toRemove) seenTeamIds.delete(toRemove.id);
      seenTeamIds.add(playerTeamId);
    }
  }

  const teamIds = Array.from(seenTeamIds);
  const { data: teamsData } = await supabase.from("teams").select("id, name, division").in("id", teamIds);
  const strengths = await computeTeamStrengths(supabase, teamIds);
  for (const t of (teamsData ?? []) as any[]) {
    pool.push({
      id: t.id, name: t.name,
      division: t.division as Division,
      strength: strengths.get(t.id) ?? 45,
      is_player: t.id === playerTeamId,
    });
  }
  return pool;
}

async function ensureWorldLeague(
  supabase: any, trainerId: string, seasonNumber: number, seasonId: string,
): Promise<string | null> {
  const { data: q } = await supabase
    .from("qualifications").select("qualifies_for")
    .eq("trainer_id", trainerId).eq("season_number", seasonNumber)
    .eq("qualifies_for", "world_league").maybeSingle();
  if (!q) return null;

  const { data: existing } = await supabase
    .from("competitions").select("id")
    .eq("trainer_id", trainerId).eq("type", "world_league").eq("season_id", seasonId).maybeSingle();
  if (existing) return existing.id;

  const playerTeam = await getPlayerLeagueTeam(supabase, trainerId);
  if (!playerTeam) return null;

  const pool = await pickLeaguePool(supabase, trainerId, seasonNumber, playerTeam.id);
  if (pool.length !== 20) return null;

  const seed = hashSeed(`WL:${trainerId}:${seasonNumber}`);
  const groups = drawLeagueGroups(pool, seed);

  const { data: comp } = await supabase
    .from("competitions").insert({
      trainer_id: trainerId, season_id: seasonId,
      type: "world_league", status: "active",
      division: playerTeam.division,
      metadata: { seasonNumber, groups: groups.map((g) => ({ group: g.group, teamIds: g.teams.map((t) => t.id) })) },
    }).select("id").single();
  const compId = comp.id;

  const standingsInsert: any[] = [];
  for (const g of groups) {
    for (const t of g.teams) {
      standingsInsert.push({
        competition_id: compId, team_id: t.id,
        points: 0, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0,
        group_key: g.group,
      });
    }
  }
  await supabase.from("standings").insert(standingsInsert);

  const matchesInsert: any[] = [];
  for (const g of groups) {
    const fx = groupFixtures(g.teams);
    for (const f of fx) {
      matchesInsert.push({
        competition_id: compId, round: f.round,
        home_team_id: f.home.id, away_team_id: f.away.id,
        status: "scheduled", phase: `group_${g.group}`,
        division: playerTeam.division,
      });
    }
  }
  await supabase.from("matches").insert(matchesInsert);
  return compId;
}

async function generateKnockoutRound(supabase: any, compId: string, nextRound: number, teams: { id: string; strength: number }[]) {
  const list = teams.slice();
  const matches: any[] = [];
  for (let i = 0; i < list.length / 2; i++) {
    const home = list[i];
    const away = list[list.length - 1 - i];
    matches.push({
      competition_id: compId, round: nextRound,
      home_team_id: home.id, away_team_id: away.id,
      status: "scheduled", phase: `ko_r${nextRound}`,
    });
  }
  await supabase.from("matches").insert(matches);
}

export const getWorldLeague = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const trainer = await getTrainer(supabase, userId);
    const season = await getCurrentSeason(supabase, trainer.id).catch(() => null);
    if (!season) return { competition: null, reason: "no_season" as const };

    const { data: q } = await supabase
      .from("qualifications").select("qualifies_for, source_division, source_position")
      .eq("trainer_id", trainer.id).eq("season_number", season.season_number)
      .eq("qualifies_for", "world_league").maybeSingle();
    if (!q) return { competition: null, reason: "not_qualified" as const, seasonNumber: season.season_number };

    const compId = await ensureWorldLeague(supabase, trainer.id, season.season_number, season.id);
    if (!compId) return { competition: null, reason: "init_failed" as const, seasonNumber: season.season_number };

    const [{ data: comp }, { data: standings }, { data: matches }] = await Promise.all([
      supabase.from("competitions").select("id, status, champion_team_id, metadata").eq("id", compId).single(),
      supabase.from("standings").select("team_id, points, wins, draws, losses, goals_for, goals_against, group_key").eq("competition_id", compId),
      supabase.from("matches").select("id, round, phase, home_team_id, away_team_id, home_score, away_score, status, is_summary, played_at").eq("competition_id", compId).order("round").order("id"),
    ]);
    const teamIds = Array.from(new Set(((standings ?? []) as any[]).map((s: any) => s.team_id)));
    const { data: teamsData } = await supabase.from("teams").select("id, name, division, is_player, trainer_id").in("id", teamIds);
    const playerTeamId = ((teamsData ?? []) as any[]).find((t) => t.is_player)?.id ?? null;

    return {
      competition: comp,
      standings: standings ?? [],
      matches: matches ?? [],
      teams: teamsData ?? [],
      playerTeamId,
      seasonNumber: season.season_number,
    };
  });

/** Insere qualificação wildcard de Copa (idempotente por trainer/season). */
async function upsertCupWildcard(
  supabase: any, trainerId: string, nextSeason: number, sourceDivision: string,
) {
  const { data: existing } = await supabase
    .from("qualifications").select("id")
    .eq("trainer_id", trainerId).eq("season_number", nextSeason)
    .eq("qualifies_for", "world_cup").eq("source_division", "wildcard").maybeSingle();
  if (existing) return;
  await supabase.from("qualifications").insert({
    trainer_id: trainerId, season_number: nextSeason,
    qualifies_for: "world_cup",
    source_division: "wildcard",
    source_position: 0,
  });
  void sourceDivision;

}

export const simulateWorldLeagueRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const trainer = await getTrainer(supabase, userId);
    const season = await getCurrentSeason(supabase, trainer.id);
    const { data: comp } = await supabase
      .from("competitions").select("id, status, division, metadata")
      .eq("trainer_id", trainer.id).eq("type", "world_league").eq("season_id", season.id)
      .maybeSingle();
    if (!comp || comp.status !== "active") throw new Error("Sem Liga Mundial ativa.");

    const { data: pending } = await supabase
      .from("matches").select("id, round, phase, home_team_id, away_team_id")
      .eq("competition_id", comp.id).eq("status", "scheduled")
      .order("round", { ascending: true });
    if (!pending || !pending.length) throw new Error("Nenhuma rodada pendente.");
    const nextRound = Number(pending[0].round ?? 1);
    const roundMatches = (pending as any[]).filter((m: any) => m.round === nextRound);

    // Identifica time do jogador nesta competição
    const { data: playerRow } = await supabase
      .from("teams").select("id").eq("trainer_id", trainer.id).eq("is_player", true).not("division", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const playerTeamId = playerRow?.id as string | undefined;

    const teamIds = Array.from(new Set(roundMatches.flatMap((m: any) => [m.home_team_id, m.away_team_id])));
    const strengths = await computeTeamStrengths(supabase, teamIds);
    const bestiary = await loadEngineBestiary(supabase);

    const { data: standRows } = await supabase
      .from("standings").select("team_id, group_key, points, wins, draws, losses, goals_for, goals_against")
      .eq("competition_id", comp.id);
    const standMap = new Map<string, any>(((standRows ?? []) as any[]).map((r) => [r.team_id, r]));

    const isGroupPhase = nextRound <= 5;
    let playerMatchId: string | null = null;
    const winners: string[] = [];

    for (const m of roundMatches) {
      const involvesPlayer = playerTeamId && (m.home_team_id === playerTeamId || m.away_team_id === playerTeamId);
      let hg = 0, ag = 0;
      if (involvesPlayer) {
        const r = await simulatePlayerMatch(supabase, trainer.id, m, playerTeamId!, bestiary);
        hg = r.home_score; ag = r.away_score;
        playerMatchId = m.id;
      } else {
        const r = await simulateCpuMatch(supabase, m, strengths, !isGroupPhase);
        hg = r.home_score; ag = r.away_score;
      }

      if (isGroupPhase) {
        const hRow = standMap.get(m.home_team_id);
        const aRow = standMap.get(m.away_team_id);
        if (hRow) {
          hRow.goals_for += hg; hRow.goals_against += ag;
          if (hg > ag) { hRow.wins++; hRow.points += 3; }
          else if (hg < ag) { hRow.losses++; }
          else { hRow.draws++; hRow.points += 1; }
        }
        if (aRow) {
          aRow.goals_for += ag; aRow.goals_against += hg;
          if (ag > hg) { aRow.wins++; aRow.points += 3; }
          else if (ag < hg) { aRow.losses++; }
          else { aRow.draws++; aRow.points += 1; }
        }
      } else {
        // KO: se empatar, decide vencedor com força (bifurcado: player usa fadiga real via forma? Simples: strength)
        let winnerTeamId: string;
        if (hg > ag) winnerTeamId = m.home_team_id;
        else if (ag > hg) winnerTeamId = m.away_team_id;
        else {
          const hs = strengths.get(m.home_team_id) ?? 45;
          const as_ = strengths.get(m.away_team_id) ?? 45;
          const w = decideKnockoutWinner(hs, as_, hg, ag, hashSeed(m.id));
          winnerTeamId = w === "home" ? m.home_team_id : m.away_team_id;
        }
        winners.push(winnerTeamId);
      }
    }

    if (isGroupPhase) {
      for (const [tid, row] of standMap) {
        await supabase.from("standings").update({
          points: row.points, wins: row.wins, draws: row.draws, losses: row.losses,
          goals_for: row.goals_for, goals_against: row.goals_against,
        }).eq("competition_id", comp.id).eq("team_id", tid);
      }
    }

    // Fim da fase de grupos (rodada 5): monta QF e grava wildcard da Copa (melhor 3º)
    if (isGroupPhase && nextRound === 5) {
      const groupMap = new Map<string, any[]>();
      for (const r of standMap.values()) {
        const arr = groupMap.get(r.group_key) ?? [];
        arr.push(r); groupMap.set(r.group_key, arr);
      }
      const qfTeams: string[] = [];
      const thirdCandidates: any[] = [];
      for (const [, arr] of groupMap) {
        arr.sort((a, b) =>
          (b.points - a.points) ||
          ((b.goals_for - b.goals_against) - (a.goals_for - a.goals_against)) ||
          (b.goals_for - a.goals_for));
        qfTeams.push(arr[0].team_id, arr[1].team_id);
        if (arr[2]) thirdCandidates.push(arr[2]);
      }
      // ordena 3ºs+4ºs de todos os grupos → melhor é wildcard da Copa próxima temporada
      const eliminated: any[] = [];
      for (const [, arr] of groupMap) {
        if (arr[2]) eliminated.push(arr[2]);
        if (arr[3]) eliminated.push(arr[3]);
      }
      eliminated.sort((a, b) =>
        (b.points - a.points) ||
        ((b.goals_for - b.goals_against) - (a.goals_for - a.goals_against)) ||
        (b.goals_for - a.goals_for));
      const wildcard = eliminated[0];
      if (wildcard && playerTeamId && wildcard.team_id === playerTeamId) {
        console.log("[WORLD_LEAGUE] Wildcard Copa concedido ao jogador:", wildcard.team_id);
        await upsertCupWildcard(supabase, trainer.id, season.season_number + 1, comp.division ?? "bronze");
      }

      const strMap = await computeTeamStrengths(supabase, qfTeams);
      const ordered = qfTeams.slice().sort((a, b) => (strMap.get(b) ?? 0) - (strMap.get(a) ?? 0));
      await generateKnockoutRound(supabase, comp.id, 6, ordered.map((id) => ({ id, strength: strMap.get(id) ?? 45 })));
      void thirdCandidates;
    }

    if (!isGroupPhase && nextRound === 6) {
      const strMap = await computeTeamStrengths(supabase, winners);
      const ordered = winners.slice().sort((a, b) => (strMap.get(b) ?? 0) - (strMap.get(a) ?? 0));
      await generateKnockoutRound(supabase, comp.id, 7, ordered.map((id) => ({ id, strength: strMap.get(id) ?? 45 })));
    }
    if (!isGroupPhase && nextRound === 7) {
      const strMap = await computeTeamStrengths(supabase, winners);
      await generateKnockoutRound(supabase, comp.id, 8, winners.map((id) => ({ id, strength: strMap.get(id) ?? 45 })));
    }
    if (!isGroupPhase && nextRound === 8) {
      const champ = winners[0] ?? null;
      await supabase.from("competitions").update({ status: "finished", champion_team_id: champ }).eq("id", comp.id);
    }

    return {
      round: nextRound,
      phase: LEAGUE_PHASE_NAMES[nextRound] ?? `R${nextRound}`,
      matchesPlayed: roundMatches.length,
      playerMatchId,
    };
  });

/* ================================================
 * COPA MUNDIAL — 10 times, KO direto
 * ================================================ */

async function pickCupPool(
  supabase: any, trainerId: string, seasonNumber: number, playerTeamId: string,
): Promise<PoolTeam[]> {
  const DIVS: Division[] = ["lendaria", "diamante", "ouro", "prata", "bronze"];
  const { data: lastSeason } = await supabase
    .from("game_seasons").select("id")
    .eq("trainer_id", trainerId).eq("season_number", seasonNumber - 1).maybeSingle();

  const champions: string[] = [];
  if (lastSeason) {
    const { data: comps } = await supabase
      .from("competitions").select("id, division, champion_team_id")
      .eq("trainer_id", trainerId).eq("type", "league").eq("season_id", lastSeason.id);
    for (const d of DIVS) {
      const c = ((comps ?? []) as any[]).find((x) => x.division === d);
      if (c?.champion_team_id) champions.push(c.champion_team_id);
      else if (c?.id) {
        const { data: st } = await supabase.from("standings").select("team_id, points, goals_for, goals_against").eq("competition_id", c.id).order("points", { ascending: false }).limit(1);
        if (st?.[0]) champions.push(st[0].team_id);
      }
    }
  }
  const seen = new Set<string>(champions);
  seen.add(playerTeamId);
  for (const d of DIVS) {
    if (seen.size >= 10) break;
    const { data: divTeams } = await supabase.from("teams").select("id").eq("division", d);
    const ids = ((divTeams ?? []) as any[]).map((t) => t.id).filter((id) => !seen.has(id));
    const strengths = await computeTeamStrengths(supabase, ids);
    const sorted = ids.sort((a, b) => (strengths.get(b) ?? 0) - (strengths.get(a) ?? 0));
    for (const id of sorted) {
      if (seen.size >= 10) break;
      seen.add(id);
    }
  }

  const teamIds = Array.from(seen).slice(0, 10);
  const { data: teamsData } = await supabase.from("teams").select("id, name, division").in("id", teamIds);
  const strMap = await computeTeamStrengths(supabase, teamIds);
  return ((teamsData ?? []) as any[]).map((t) => ({
    id: t.id, name: t.name, division: t.division as Division,
    strength: strMap.get(t.id) ?? 45, is_player: t.id === playerTeamId,
  }));
}

async function ensureWorldCup(
  supabase: any, trainerId: string, seasonNumber: number, seasonId: string,
): Promise<string | null> {
  const { data: q } = await supabase
    .from("qualifications").select("qualifies_for")
    .eq("trainer_id", trainerId).eq("season_number", seasonNumber).eq("qualifies_for", "world_cup").maybeSingle();
  if (!q) return null;

  const { data: existing } = await supabase
    .from("competitions").select("id")
    .eq("trainer_id", trainerId).eq("type", "world_cup").eq("season_id", seasonId).maybeSingle();
  if (existing) return existing.id;

  const playerTeam = await getPlayerLeagueTeam(supabase, trainerId);
  if (!playerTeam) return null;
  const pool = await pickCupPool(supabase, trainerId, seasonNumber, playerTeam.id);
  if (pool.length !== 10) return null;

  const seedRng = mulberry32(hashSeed(`WC:${trainerId}:${seasonNumber}`));
  const sorted = pool.slice().sort((a, b) => b.strength - a.strength);
  const byeTeams = sorted.slice(0, 6);
  const preTeams = sorted.slice(6, 10);
  for (let i = preTeams.length - 1; i > 0; i--) {
    const j = Math.floor(seedRng() * (i + 1));
    [preTeams[i], preTeams[j]] = [preTeams[j], preTeams[i]];
  }

  const { data: comp } = await supabase.from("competitions").insert({
    trainer_id: trainerId, season_id: seasonId, type: "world_cup",
    status: "active", division: playerTeam.division,
    metadata: {
      seasonNumber,
      pool: sorted.map((t) => t.id),
      byes: byeTeams.map((t) => t.id),
      pre: preTeams.map((t) => t.id),
    },
  }).select("id").single();
  const compId = comp.id;

  const preMatches = [
    { competition_id: compId, round: 1, phase: "pre", home_team_id: preTeams[0].id, away_team_id: preTeams[1].id, status: "scheduled" },
    { competition_id: compId, round: 1, phase: "pre", home_team_id: preTeams[2].id, away_team_id: preTeams[3].id, status: "scheduled" },
  ];
  await supabase.from("matches").insert(preMatches);
  return compId;
}

export const getWorldCup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const trainer = await getTrainer(supabase, userId);
    const season = await getCurrentSeason(supabase, trainer.id).catch(() => null);
    if (!season) return { competition: null, reason: "no_season" as const };

    const { data: q } = await supabase
      .from("qualifications").select("qualifies_for, source_division, source_position")
      .eq("trainer_id", trainer.id).eq("season_number", season.season_number)
      .eq("qualifies_for", "world_cup").maybeSingle();
    if (!q) return { competition: null, reason: "not_qualified" as const, seasonNumber: season.season_number };

    const compId = await ensureWorldCup(supabase, trainer.id, season.season_number, season.id);
    if (!compId) return { competition: null, reason: "init_failed" as const, seasonNumber: season.season_number };

    const [{ data: comp }, { data: matches }] = await Promise.all([
      supabase.from("competitions").select("id, status, champion_team_id, metadata").eq("id", compId).single(),
      supabase.from("matches").select("id, round, phase, home_team_id, away_team_id, home_score, away_score, status, is_summary, played_at").eq("competition_id", compId).order("round").order("id"),
    ]);
    const meta = ((comp as any)?.metadata ?? {}) as any;
    const teamIds = (meta.pool ?? []) as string[];
    const { data: teamsData } = await supabase.from("teams").select("id, name, division, is_player").in("id", teamIds);
    const playerTeamId = ((teamsData ?? []) as any[]).find((t) => t.is_player)?.id ?? null;

    return { competition: comp, matches: matches ?? [], teams: teamsData ?? [], playerTeamId, seasonNumber: season.season_number };
  });

export const simulateWorldCupRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const trainer = await getTrainer(supabase, userId);
    const season = await getCurrentSeason(supabase, trainer.id);
    const { data: comp } = await supabase.from("competitions")
      .select("id, status, metadata")
      .eq("trainer_id", trainer.id).eq("type", "world_cup").eq("season_id", season.id).maybeSingle();
    if (!comp || comp.status !== "active") throw new Error("Sem Copa Mundial ativa.");

    const { data: pending } = await supabase.from("matches")
      .select("id, round, phase, home_team_id, away_team_id")
      .eq("competition_id", comp.id).eq("status", "scheduled")
      .order("round", { ascending: true });
    if (!pending || !pending.length) throw new Error("Nenhuma rodada pendente.");
    const nextRound = Number(pending[0].round ?? 1);
    const roundMatches = (pending as any[]).filter((m: any) => m.round === nextRound);

    const { data: playerRow } = await supabase
      .from("teams").select("id").eq("trainer_id", trainer.id).eq("is_player", true).not("division", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const playerTeamId = playerRow?.id as string | undefined;

    const teamIds = Array.from(new Set(roundMatches.flatMap((m: any) => [m.home_team_id, m.away_team_id])));
    const strengths = await computeTeamStrengths(supabase, teamIds);
    const bestiary = await loadEngineBestiary(supabase);

    const winners: string[] = [];
    let playerMatchId: string | null = null;
    for (const m of roundMatches) {
      const involvesPlayer = playerTeamId && (m.home_team_id === playerTeamId || m.away_team_id === playerTeamId);
      let hg = 0, ag = 0;
      if (involvesPlayer) {
        const r = await simulatePlayerMatch(supabase, trainer.id, m, playerTeamId!, bestiary);
        hg = r.home_score; ag = r.away_score;
        playerMatchId = m.id;
      } else {
        const r = await simulateCpuMatch(supabase, m, strengths, true);
        hg = r.home_score; ag = r.away_score;
      }
      let winner: string;
      if (hg > ag) winner = m.home_team_id;
      else if (ag > hg) winner = m.away_team_id;
      else {
        const hs = strengths.get(m.home_team_id) ?? 45;
        const as_ = strengths.get(m.away_team_id) ?? 45;
        const w = decideKnockoutWinner(hs, as_, hg, ag, hashSeed(m.id));
        winner = w === "home" ? m.home_team_id : m.away_team_id;
      }
      winners.push(winner);
    }

    const meta = (comp.metadata ?? {}) as any;
    if (nextRound === 1) {
      const byes = (meta.byes ?? []) as string[];
      const qfTeams = [...byes, ...winners];
      const strMap = await computeTeamStrengths(supabase, qfTeams);
      const ordered = qfTeams.slice().sort((a, b) => (strMap.get(b) ?? 0) - (strMap.get(a) ?? 0));
      await generateKnockoutRound(supabase, comp.id, 2, ordered.map((id) => ({ id, strength: strMap.get(id) ?? 45 })));
    }
    if (nextRound === 2) {
      const strMap = await computeTeamStrengths(supabase, winners);
      const ordered = winners.slice().sort((a, b) => (strMap.get(b) ?? 0) - (strMap.get(a) ?? 0));
      await generateKnockoutRound(supabase, comp.id, 3, ordered.map((id) => ({ id, strength: strMap.get(id) ?? 45 })));
    }
    if (nextRound === 3) {
      const strMap = await computeTeamStrengths(supabase, winners);
      await generateKnockoutRound(supabase, comp.id, 4, winners.map((id) => ({ id, strength: strMap.get(id) ?? 45 })));
    }
    if (nextRound === 4) {
      const champ = winners[0] ?? null;
      await supabase.from("competitions").update({ status: "finished", champion_team_id: champ }).eq("id", comp.id);
    }

    return {
      round: nextRound,
      phase: CUP_PHASE_NAMES[nextRound] ?? `R${nextRound}`,
      matchesPlayed: roundMatches.length,
      playerMatchId,
    };
  });
