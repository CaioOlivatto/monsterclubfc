import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { simulate, generateCpuSide, type EngineSide } from "./match-engine.server";
import { buildPlayerSideFromDb } from "./player-side.server";
import { applyPostMatchXp, insertMessage } from "./xp.server";

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
    .maybeSingle();
  if (existing) return existing.id;
  const { data: created, error } = await supabase
    .from("teams")
    .insert({ trainer_id: trainerId, is_player: true, name: teamName })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

async function ensureCpuTeam(supabase: any, name: string): Promise<string> {
  const { data: created, error } = await supabase
    .from("teams")
    .insert({ trainer_id: null, is_player: false, name })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

const SPEED_COSTS: Record<string, number> = { "4x": 2, instant: 5 };

export const payMatchSpeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ match_id: z.string().uuid(), mode: z.enum(["4x", "instant"]) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const trainer = await getTrainerCtx(supabase, userId);
    const { data: match } = await supabase
      .from("matches")
      .select("id, speed_paid, home_team_id, away_team_id")
      .eq("id", data.match_id)
      .maybeSingle();
    if (!match) throw new Error("Partida não encontrada.");
    const paid: string[] = Array.isArray(match.speed_paid)
      ? (match.speed_paid as any[]).map((x) => String(x))
      : [];
    if (paid.includes(data.mode)) return { ok: true, alreadyPaid: true };

    const { data: academy } = await supabase
      .from("academies")
      .select("id, gems")
      .eq("trainer_id", trainer.id)
      .maybeSingle();
    if (!academy) throw new Error("Academia não encontrada.");
    const cost = SPEED_COSTS[data.mode];
    if (academy.gems < cost) throw new Error("Gemas insuficientes.");

    paid.push(data.mode);
    await supabase.from("academies").update({ gems: academy.gems - cost }).eq("id", academy.id);
    await supabase.from("matches").update({ speed_paid: paid }).eq("id", match.id);
    return { ok: true, alreadyPaid: false, remaining: academy.gems - cost };
  });

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
    const cpuSide = generateCpuSide(seed, playerOverall);
    const awayTeamId = await ensureCpuTeam(supabase, cpuSide.team_name);

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

    const eventsToInsert = result.events.map((e) => ({
      match_id: match.id,
      minute: e.minute,
      event_type: e.event_type,
      description: e.description,
      actor_creature_id:
        e.actor_creature_id && !e.actor_creature_id.startsWith("cpu-") ? e.actor_creature_id : null,
      actor_team_id: e.actor_team_id,
    }));
    if (eventsToInsert.length) {
      await supabase.from("match_events").insert(eventsToInsert);
    }

    // XP + energia pós-partida (mesmo amistoso)
    const outcome: "W" | "D" | "L" =
      result.home_score > result.away_score ? "W" : result.home_score < result.away_score ? "L" : "D";
    const playerStarterIds = homeSide.starters.map((s) => s.creature.id);
    const playerReserveIds = result.used_bench_ids.filter((id) =>
      homeSide.bench.some((b) => b.creature.id === id),
    );
    await applyPostMatchXp(supabase, trainer.id, {
      starterIds: playerStarterIds,
      reserveIds: playerReserveIds,
      outcome,
      energy_loss: result.energy_loss,
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
      .select("id, home_team_id, away_team_id, home_score, away_score, status, is_friendly, played_at, clima, speed_paid")
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

    const { data: events } = await supabase
      .from("match_events")
      .select("minute, event_type, description, actor_creature_id, actor_team_id")
      .eq("match_id", match.id)
      .order("minute", { ascending: true })
      .order("created_at", { ascending: true });

    return {
      match,
      home: home ? { id: home.id, name: home.name } : null,
      away: away ? { id: away.id, name: away.name } : null,
      events: events ?? [],
    };
  });

// Mantido para não quebrar chamadas legadas; reencaminha para o helper compartilhado.
export { insertMessage };
