import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  simulate,
  generateCpuSide,
  type EngineSide,
  type EngineSlot,
  type SlotRole,
  type Element,
} from "./match-engine.server";
import { buildSlots } from "./lineup.server";

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

async function buildPlayerSide(supabase: any, trainerId: string, teamId: string, teamName: string): Promise<EngineSide> {
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

  return {
    team_id: teamId,
    team_name: teamName,
    starters,
    strategy: lineup.strategy,
  };
}

export const createFriendlyMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const trainer = await getTrainerCtx(supabase, userId);

    // Garante time do jogador
    const homeTeamId = await ensurePlayerTeam(supabase, trainer.id, trainer.academy_name);

    // Monta escalação do jogador para descobrir força e nome
    const homeSide = await buildPlayerSide(supabase, trainer.id, homeTeamId, trainer.academy_name);
    const playerOverall = Math.round(
      homeSide.starters.reduce((a, s) => a + s.creature.overall, 0) / homeSide.starters.length,
    );

    const seed = Math.floor(Math.random() * 2 ** 31);
    const cpuSide = generateCpuSide(seed, playerOverall);
    const awayTeamId = await ensureCpuTeam(supabase, cpuSide.team_name);

    // Simula
    const finalHome: EngineSide = { ...homeSide, team_id: homeTeamId };
    const finalAway: EngineSide = { ...cpuSide, team_id: awayTeamId };
    const result = simulate(finalHome, finalAway, seed);

    // Cria partida
    const { data: match, error: mErr } = await supabase
      .from("matches")
      .insert({
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        home_score: result.home_score,
        away_score: result.away_score,
        status: "finished",
        is_friendly: true,
        played_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (mErr) throw mErr;

    // Persiste eventos (somente os que têm actor_creature_id do time do jogador; CPU actor_creature_id é fictício)
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
      const { error: eErr } = await supabase.from("match_events").insert(eventsToInsert);
      if (eErr) throw eErr;
    }

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
      .select("id, home_team_id, away_team_id, home_score, away_score, status, is_friendly, played_at")
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

    // Autorização: um dos times deve ser do treinador
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
