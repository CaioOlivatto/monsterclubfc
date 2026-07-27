import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { simulate, persistableSimulationEvents, generateCpuSide, type EngineSide, type EngineBestiary } from "./match-engine.server";
import { loadBestiary } from "./bestiary.server";
import { buildPlayerSideFromDb } from "./player-side.server";
import { applyPostMatchXp, insertMessage } from "./xp.server";
import { SPEED_UNLOCK_COSTS } from "./shop.server";
import { WORLD_TEAMS, type DivisionSlug } from "./world/catalog";


async function getTrainerCtx(supabase: any, userId: string) {
  const { data: trainer } = await supabase
    .from("trainers")
    .select("id, academy_name")
    .eq("user_id", userId)
    .maybeSingle();
  if (!trainer) throw new Error("Treinador não encontrado.");
  return trainer as { id: string; academy_name: string };
}

async function ensurePlayerTeam(supabase: any, trainerId: string, teamName: string): Promise<string> {
  const { data: existing } = await supabase
    .from("teams")
    .select("id")
    .eq("trainer_id", trainerId)
    .eq("is_player", true)
    .is("competition_id", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id;
  const { data: created, error } = await supabase
    .from("teams")
    .insert({ trainer_id: trainerId, is_player: true, name: teamName, competition_id: null })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

async function ensureCpuTeam(supabase: any, trainerId: string, name: string, strength: number): Promise<string> {
  const { data: created, error } = await supabase
    .from("teams")
    .insert({ trainer_id: trainerId, is_player: false, name, competition_id: null, cpu_strength: strength })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

/**
 * Desbloqueio PERMANENTE de velocidade de simulação (4x ou instantâneo).
 * Após comprar, o botão fica disponível em todas as partidas seguintes sem custo.
 */
export const buySpeedUnlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ mode: z.enum(["4x", "instant"]) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const trainer = await getTrainerCtx(supabase, userId);
    const { data: academy } = await supabase
      .from("academies")
      .select("id, gems, paid_4x, paid_instant")
      .eq("trainer_id", trainer.id)
      .maybeSingle();
    if (!academy) throw new Error("Academia não encontrada.");
    const isFourX = data.mode === "4x";
    if (isFourX ? academy.paid_4x : academy.paid_instant) {
      return { ok: true, alreadyUnlocked: true };
    }
    const cost = SPEED_UNLOCK_COSTS[data.mode];
    if (academy.gems < cost) throw new Error("Gemas insuficientes.");
    const patch = isFourX
      ? { gems: academy.gems - cost, paid_4x: true }
      : { gems: academy.gems - cost, paid_instant: true };
    await supabase.from("academies").update(patch).eq("id", academy.id);
    return { ok: true, alreadyUnlocked: false };
  });

// Compat legado: mantém o nome antigo, mas agora sempre desbloqueia permanentemente.
export const payMatchSpeed = buySpeedUnlock;

export const createFriendlyMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const trainer = await getTrainerCtx(supabase, userId);

    const homeTeamId = await ensurePlayerTeam(supabase, trainer.id, trainer.academy_name);
    const homeSide = await buildPlayerSideFromDb(supabase, trainer.id, homeTeamId, trainer.academy_name);
    const playerOverall = Math.round(
      homeSide.starters.reduce((a, s) => a + s.creature.overall, 0) / homeSide.starters.length,
    );

    const seed = Math.floor(Math.random() * 2 ** 31);
    const bestiaryRaw = await loadBestiary(supabase);
    const bestiary: EngineBestiary = {
      species: bestiaryRaw.species.map((s) => ({
        species: s.species,
        element: s.element,
        is_goalkeeper: s.position === "Goleiro",
      })),
      epithets: bestiaryRaw.epithets,
    };

    // Adversário: sorteado entre os times reais da MESMA DIVISÃO do jogador.
    // Nunca inventar nome de time em runtime — usar apenas WORLD_TEAMS.
    const { data: playerLeagueTeam } = await supabase
      .from("teams")
      .select("division, name")
      .eq("trainer_id", trainer.id)
      .eq("is_player", true)
      .not("competition_id", "is", null)
      .maybeSingle();
    const { resolvePlayerDivision } = await import("./division.server");
    const division = (await resolvePlayerDivision(supabase, trainer.id)) as DivisionSlug;

    const pool = (WORLD_TEAMS[division] ?? WORLD_TEAMS.bronze).filter(
      (t) => t.name !== playerLeagueTeam?.name && t.name !== trainer.academy_name,
    );
    const opponentName = pool[Math.floor(Math.random() * pool.length)]?.name ?? "Adversário";

    const cpuSide = generateCpuSide(seed, playerOverall, opponentName, bestiary);
    const cpuOverall = Math.round(
      cpuSide.starters.reduce((a, s) => a + s.creature.overall, 0) / cpuSide.starters.length,
    );
    const awayTeamId = await ensureCpuTeam(supabase, trainer.id, cpuSide.team_name, cpuOverall);


    const finalHome: EngineSide = { ...homeSide, team_id: homeTeamId };
    const finalAway: EngineSide = { ...cpuSide, team_id: awayTeamId };
    const result = simulate(finalHome, finalAway, seed);

    const { data: match, error: mErr } = await supabase
      .from("matches")
      .insert({
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        home_score: result.home_score,
        away_score: result.away_score,
        status: "finished",
        is_friendly: true,
        clima: result.weather,
        played_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (mErr) throw mErr;

    const eventsToInsert = persistableSimulationEvents(result).map((e) => ({
      match_id: match.id,
      minute: e.minute,
      event_type: e.event_type,
      description: e.description,
      actor_creature_id:
        e.actor_creature_id && !e.actor_creature_id.startsWith("cpu-") ? e.actor_creature_id : null,
      actor_team_id: e.actor_team_id,
      meta: (e.meta ?? null) as any,
    }));
    if (eventsToInsert.length) {
      await supabase.from("match_events").insert(eventsToInsert);
    }

    const outcome: "W" | "D" | "L" =
      result.home_score > result.away_score ? "W" : result.home_score < result.away_score ? "L" : "D";
    const starterIds = homeSide.starters.map((s) => s.creature.id);
    const enteredReserveIds = result.used_bench_ids.filter((id: string) =>
      homeSide.bench.some((b) => b.creature.id === id),
    );
    const unusedReserveIds = homeSide.bench
      .map((b) => b.creature.id)
      .filter((id) => !enteredReserveIds.includes(id));
    await applyPostMatchXp(supabase, trainer.id, {
      starterIds,
      enteredReserveIds,
      unusedReserveIds,
      outcome,
      energy_loss: {},
      goalsByCreature: {},
      injuries: [],
      isOfficial: false,
      skipRewards: true, // Amistoso: sem energia, lesão, moral ou XP.
    });

    return { match_id: match.id };
  });

export const getMatch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const trainer = await getTrainerCtx(supabase, userId);

    const { data: match, error } = await supabase
      .from("matches")
      .select("id, home_team_id, away_team_id, home_score, away_score, status, is_friendly, played_at, clima, finance_summary")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!match) throw new Error("Partida não encontrada.");

    const { data: teams } = await supabase
      .from("teams")
      .select("id, name, is_player, trainer_id")
      .in("id", [match.home_team_id, match.away_team_id]);
    const home = teams?.find((t: any) => t.id === match.home_team_id);
    const away = teams?.find((t: any) => t.id === match.away_team_id);

    const isPlayerMatch = home?.trainer_id === trainer.id || away?.trainer_id === trainer.id;
    if (!isPlayerMatch) throw new Error("Você não tem acesso a essa partida.");

    const [{ data: events }, { data: academy }] = await Promise.all([
      supabase
        .from("match_events")
        .select("minute, event_type, description, actor_creature_id, actor_team_id, meta")
        .eq("match_id", match.id)
        .order("minute", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("academies")
        .select("paid_4x, paid_instant, gems")
        .eq("trainer_id", trainer.id)
        .maybeSingle(),
    ]);

    const playerTeamId = home?.trainer_id === trainer.id ? home.id : away?.id ?? null;

    return {
      match,
      home: home ? { id: home.id, name: home.name } : null,
      away: away ? { id: away.id, name: away.name } : null,
      player_team_id: playerTeamId,
      events: events ?? [],
      speed: {
        paid_4x: academy?.paid_4x ?? false,
        paid_instant: academy?.paid_instant ?? false,
        cost_4x: SPEED_UNLOCK_COSTS["4x"],
        cost_instant: SPEED_UNLOCK_COSTS.instant,
        gems: academy?.gems ?? 0,
      },
    };
  });

export { insertMessage };
