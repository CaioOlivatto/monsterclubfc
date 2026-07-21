import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateSchedule, pickCpuTeamNames } from "./league.server";
import {
  simulate,
  generateCpuSideFor,
  type EngineSide,
  type EngineSlot,
  type SlotRole,
  type Element,
} from "./match-engine.server";
import { buildSlots } from "./lineup.server";
import { stadiumIncome } from "./buildings.server";

async function getTrainer(supabase: any, userId: string) {
  const { data: trainer } = await supabase
    .from("trainers")
    .select("id, academy_name")
    .eq("user_id", userId)
    .maybeSingle();
  if (!trainer) throw new Error("Treinador não encontrado.");
  return trainer as { id: string; academy_name: string };
}

async function ensureCurrentSeason(supabase: any, trainerId: string) {
  const { data: existing } = await supabase
    .from("game_seasons")
    .select("id, season_number")
    .eq("trainer_id", trainerId)
    .eq("is_current", true)
    .maybeSingle();
  if (existing) return existing;
  const { data: created, error } = await supabase
    .from("game_seasons")
    .insert({ trainer_id: trainerId, season_number: 1, is_current: true })
    .select("id, season_number")
    .single();
  if (error) throw error;
  return created;
}

async function buildPlayerSide(
  supabase: any,
  trainerId: string,
  teamId: string,
  teamName: string,
): Promise<EngineSide> {
  const { data: lineup } = await supabase
    .from("team_lineups")
    .select("formation, strategy, starters")
    .eq("trainer_id", trainerId)
    .maybeSingle();
  if (!lineup) throw new Error("Você ainda não tem escalação salva. Vá em Escalação primeiro.");
  const savedStarters = (lineup.starters ?? []) as { slot: number; role: SlotRole; creature_id: string | null }[];
  const ids = savedStarters.map((s) => s.creature_id).filter(Boolean) as string[];
  if (ids.length !== 11) throw new Error("Preencha os 11 titulares antes de jogar.");
  const { data: creatures, error } = await supabase
    .from("creatures")
    .select("id, name, element, overall, physical, affinity_fogo, affinity_agua, affinity_terra, affinity_ar, affinity_gelo")
    .in("id", ids);
  if (error) throw error;
  const byId = new Map<string, any>((creatures ?? []).map((c: any) => [c.id, c]));
  const slots = buildSlots(lineup.formation);
  const starters: EngineSlot[] = slots.map((s) => {
    const saved = savedStarters.find((x) => x.slot === s.index);
    const c = saved?.creature_id ? byId.get(saved.creature_id) : null;
    if (!c) throw new Error("Escalação inválida — recomponha os titulares.");
    return {
      role: s.role,
      creature: {
        id: c.id,
        name: c.name,
        element: c.element as Element,
        overall: c.overall,
        physical: c.physical,
        affinity_fogo: c.affinity_fogo ?? 0,
        affinity_agua: c.affinity_agua ?? 0,
        affinity_terra: c.affinity_terra ?? 0,
        affinity_ar: c.affinity_ar ?? 0,
        affinity_gelo: c.affinity_gelo ?? 0,
      },
    };
  });
  return { team_id: teamId, team_name: teamName, starters, strategy: lineup.strategy };
}

async function playerAverage(supabase: any, trainerId: string): Promise<number> {
  const { data } = await supabase.from("creatures").select("overall").eq("trainer_id", trainerId);
  const list = (data ?? []) as { overall: number }[];
  if (!list.length) return 45;
  return Math.round(list.reduce((a, c) => a + c.overall, 0) / list.length);
}

export const startLeague = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const trainer = await getTrainer(supabase, userId);

    // Impede criar duas ligas ativas para o mesmo treinador
    const { data: existingComp } = await supabase
      .from("competitions")
      .select("id")
      .eq("trainer_id", trainer.id)
      .maybeSingle();
    if (existingComp) throw new Error("Você já tem uma liga em andamento.");

    const season = await ensureCurrentSeason(supabase, trainer.id);

    const { data: competition, error: cErr } = await supabase
      .from("competitions")
      .insert({ trainer_id: trainer.id, season_id: season.id, division: "bronze" })
      .select("id")
      .single();
    if (cErr) throw cErr;

    // Time do jogador (dentro da liga)
    const { data: playerTeam, error: ptErr } = await supabase
      .from("teams")
      .insert({
        competition_id: competition.id,
        trainer_id: trainer.id,
        is_player: true,
        name: trainer.academy_name,
      })
      .select("id")
      .single();
    if (ptErr) throw ptErr;

    // 7 times CPU
    const avg = await playerAverage(supabase, trainer.id);
    const cpuNames = pickCpuTeamNames(7, Date.now() & 0xffffffff);
    const cpuRows = cpuNames.map((name, i) => ({
      competition_id: competition.id,
      trainer_id: null,
      is_player: false,
      name,
      cpu_strength: Math.max(20, Math.min(90, avg + (i - 3) * 4)),
    }));
    const { data: cpuTeams, error: ctErr } = await supabase.from("teams").insert(cpuRows).select("id");
    if (ctErr) throw ctErr;

    const teamIds = [playerTeam.id, ...cpuTeams.map((t: any) => t.id)] as string[];

    // Standings iniciais
    const standingsRows = teamIds.map((tid) => ({
      competition_id: competition.id,
      team_id: tid,
      points: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goals_for: 0,
      goals_against: 0,
    }));
    const { error: sErr } = await supabase.from("standings").insert(standingsRows);
    if (sErr) throw sErr;

    // Calendário round-robin duplo → 14 rodadas × 4 jogos
    const schedule = generateSchedule(8, true);
    const matchesRows: any[] = [];
    schedule.forEach((round, rIdx) => {
      round.forEach(([h, a]) => {
        matchesRows.push({
          competition_id: competition.id,
          round: rIdx + 1,
          home_team_id: teamIds[h],
          away_team_id: teamIds[a],
          status: "scheduled",
          is_friendly: false,
        });
      });
    });
    const { error: mErr } = await supabase.from("matches").insert(matchesRows);
    if (mErr) throw mErr;

    return { competition_id: competition.id };
  });

export const getLeague = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const trainer = await getTrainer(supabase, userId);
    const { data: competition } = await supabase
      .from("competitions")
      .select("id, division, season_id")
      .eq("trainer_id", trainer.id)
      .maybeSingle();
    if (!competition) return { competition: null };

    const [teamsRes, standingsRes, matchesRes] = await Promise.all([
      supabase.from("teams").select("id, name, is_player, cpu_strength").eq("competition_id", competition.id),
      supabase
        .from("standings")
        .select("team_id, points, wins, draws, losses, goals_for, goals_against")
        .eq("competition_id", competition.id),
      supabase
        .from("matches")
        .select("id, round, home_team_id, away_team_id, home_score, away_score, status, played_at")
        .eq("competition_id", competition.id)
        .order("round", { ascending: true }),
    ]);

    return {
      competition,
      teams: teamsRes.data ?? [],
      standings: standingsRes.data ?? [],
      matches: matchesRes.data ?? [],
    };
  });

export const playNextLeagueMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const trainer = await getTrainer(supabase, userId);

    const { data: competition } = await supabase
      .from("competitions")
      .select("id")
      .eq("trainer_id", trainer.id)
      .maybeSingle();
    if (!competition) throw new Error("Nenhuma liga em andamento.");

    // Time do jogador nessa liga
    const { data: playerTeam } = await supabase
      .from("teams")
      .select("id")
      .eq("competition_id", competition.id)
      .eq("is_player", true)
      .maybeSingle();
    if (!playerTeam) throw new Error("Time do jogador não encontrado nesta liga.");

    // Próxima partida agendada do jogador
    const { data: next } = await supabase
      .from("matches")
      .select("id, round, home_team_id, away_team_id")
      .eq("competition_id", competition.id)
      .eq("status", "scheduled")
      .or(`home_team_id.eq.${playerTeam.id},away_team_id.eq.${playerTeam.id}`)
      .order("round", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!next) throw new Error("Sua liga já foi concluída.");

    // Carrega times envolvidos
    const { data: teams } = await supabase
      .from("teams")
      .select("id, name, is_player, cpu_strength, trainer_id")
      .in("id", [next.home_team_id, next.away_team_id]);
    const home = teams!.find((t: any) => t.id === next.home_team_id) as any;
    const away = teams!.find((t: any) => t.id === next.away_team_id) as any;

    // Constrói os dois lados
    async function buildSide(team: any): Promise<EngineSide> {
      if (team.is_player) return buildPlayerSide(supabase, trainer.id, team.id, team.name);
      const seed = hashSeed(team.id);
      return generateCpuSideFor(seed, team.id, team.name, team.cpu_strength ?? 45);
    }
    const homeSide = await buildSide(home);
    const awaySide = await buildSide(away);
    const seed = hashSeed(next.id);
    const result = simulate(homeSide, awaySide, seed);

    // Atualiza partida
    const { error: uErr } = await supabase
      .from("matches")
      .update({
        home_score: result.home_score,
        away_score: result.away_score,
        status: "finished",
        played_at: new Date().toISOString(),
      })
      .eq("id", next.id);
    if (uErr) throw uErr;

    // Persiste eventos (creature_id dos times CPU vira null)
    const eventsToInsert = result.events.map((e) => ({
      match_id: next.id,
      minute: e.minute,
      event_type: e.event_type,
      description: e.description,
      actor_creature_id:
        e.actor_creature_id && !e.actor_creature_id.startsWith("cpu-") ? e.actor_creature_id : null,
      actor_team_id: e.actor_team_id,
    }));
    if (eventsToInsert.length) {
      const { error: eErr } = await supabase.from("match_events").insert(eventsToInsert);
      if (eErr) throw eErr;
    }

    // Atualiza classificação de ambos os times
    const updates: Array<{ team_id: string; gf: number; ga: number; result: "W" | "D" | "L" }> = [
      {
        team_id: home.id,
        gf: result.home_score,
        ga: result.away_score,
        result: result.home_score > result.away_score ? "W" : result.home_score < result.away_score ? "L" : "D",
      },
      {
        team_id: away.id,
        gf: result.away_score,
        ga: result.home_score,
        result: result.away_score > result.home_score ? "W" : result.away_score < result.home_score ? "L" : "D",
      },
    ];
    for (const u of updates) {
      const { data: row } = await supabase
        .from("standings")
        .select("points, wins, draws, losses, goals_for, goals_against")
        .eq("competition_id", competition.id)
        .eq("team_id", u.team_id)
        .maybeSingle();
      if (!row) continue;
      const wins = row.wins + (u.result === "W" ? 1 : 0);
      const draws = row.draws + (u.result === "D" ? 1 : 0);
      const losses = row.losses + (u.result === "L" ? 1 : 0);
      const points = row.points + (u.result === "W" ? 3 : u.result === "D" ? 1 : 0);
      await supabase
        .from("standings")
        .update({
          wins,
          draws,
          losses,
          points,
          goals_for: row.goals_for + u.gf,
          goals_against: row.goals_against + u.ga,
        })
        .eq("competition_id", competition.id)
        .eq("team_id", u.team_id);
    }

    // Simula rapidamente as outras partidas da mesma rodada (sem eventos detalhados)
    const { data: sameRound } = await supabase
      .from("matches")
      .select("id, home_team_id, away_team_id")
      .eq("competition_id", competition.id)
      .eq("round", next.round as number)
      .eq("status", "scheduled");
    for (const m of sameRound ?? []) {
      const { data: pair } = await supabase
        .from("teams")
        .select("id, cpu_strength, name")
        .in("id", [m.home_team_id, m.away_team_id]);
      const h = pair!.find((t: any) => t.id === m.home_team_id) as any;
      const a = pair!.find((t: any) => t.id === m.away_team_id) as any;
      const hs = generateCpuSideFor(hashSeed(h.id), h.id, h.name, (h.cpu_strength ?? 45) + 4); // pequeno bônus casa
      const as = generateCpuSideFor(hashSeed(a.id), a.id, a.name, a.cpu_strength ?? 45);
      const r = simulate(hs, as, hashSeed(m.id));
      await supabase
        .from("matches")
        .update({
          home_score: r.home_score,
          away_score: r.away_score,
          status: "finished",
          played_at: new Date().toISOString(),
        })
        .eq("id", m.id);
      const upd = [
        {
          team_id: h.id,
          gf: r.home_score,
          ga: r.away_score,
          result: r.home_score > r.away_score ? "W" : r.home_score < r.away_score ? "L" : "D",
        },
        {
          team_id: a.id,
          gf: r.away_score,
          ga: r.home_score,
          result: r.away_score > r.home_score ? "W" : r.away_score < r.home_score ? "L" : "D",
        },
      ];
      for (const u of upd) {
        const { data: row } = await supabase
          .from("standings")
          .select("points, wins, draws, losses, goals_for, goals_against")
          .eq("competition_id", competition.id)
          .eq("team_id", u.team_id)
          .maybeSingle();
        if (!row) continue;
        await supabase
          .from("standings")
          .update({
            wins: row.wins + (u.result === "W" ? 1 : 0),
            draws: row.draws + (u.result === "D" ? 1 : 0),
            losses: row.losses + (u.result === "L" ? 1 : 0),
            points: row.points + (u.result === "W" ? 3 : u.result === "D" ? 1 : 0),
            goals_for: row.goals_for + u.gf,
            goals_against: row.goals_against + u.ga,
          })
          .eq("competition_id", competition.id)
          .eq("team_id", u.team_id);
      }
    }

    return { match_id: next.id };
  });

function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Zod parse não usado, mas mantém import consistente
export const __z = z;
