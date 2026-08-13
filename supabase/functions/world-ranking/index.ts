import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import {
  evolveCpuAcademies,
  seedWorldAcademiesIfNeeded,
  upsertPlayerAcademy,
  type SortKey,
} from "../../../src/lib/ranking/logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const selectColumns =
  "id, trainer_id, academy_name, trainer_name, division, level, wins, patrimony, primary_color, secondary_color, is_player, last_position";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sortRows(rows: any[], sort: SortKey) {
  return [...rows].sort((a, b) => {
    if (b[sort] !== a[sort]) return (b[sort] ?? 0) - (a[sort] ?? 0);
    if (b.level !== a.level) return (b.level ?? 0) - (a.level ?? 0);
    if (b.patrimony !== a.patrimony) return (b.patrimony ?? 0) - (a.patrimony ?? 0);
    return String(a.id).localeCompare(String(b.id));
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authorization = request.headers.get("authorization");
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
    if (!token) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase function environment is incomplete");

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Unauthorized" }, 401);

    const body = await request.json().catch(() => ({}));
    const action = body?.action === "recompute" ? "recompute" : "get";
    const sort: SortKey = ["level", "wins", "patrimony"].includes(body?.sort)
      ? body.sort
      : "level";

    const { data: trainer, error: trainerError } = await admin
      .from("trainers")
      .select("id")
      .eq("user_id", authData.user.id)
      .maybeSingle();
    if (trainerError) throw trainerError;
    if (!trainer) return json({ error: "Trainer not found" }, 404);

    await seedWorldAcademiesIfNeeded(admin);

    if (action === "recompute") {
      const { data: season, error: seasonError } = await admin
        .from("game_seasons")
        .select("season_number")
        .eq("trainer_id", trainer.id)
        .eq("is_current", true)
        .maybeSingle();
      if (seasonError) throw seasonError;
      if (!season) return json({ error: "Current season not found" }, 409);

      const marker = {
        user_id: authData.user.id,
        trainer_id: trainer.id,
        season_number: season.season_number,
      };
      const { error: lockError } = await admin.from("world_ranking_evolutions").insert(marker);
      if (lockError?.code === "23505") {
        await upsertPlayerAcademy(admin, trainer.id);
        return json({ updated: 0, already_evolved: true });
      }
      if (lockError) throw lockError;

      try {
        const updated = await evolveCpuAcademies(admin);
        await upsertPlayerAcademy(admin, trainer.id);
        return json({ updated, already_evolved: false });
      } catch (error) {
        await admin
          .from("world_ranking_evolutions")
          .delete()
          .eq("user_id", authData.user.id)
          .eq("season_number", season.season_number);
        throw error;
      }
    }

    await upsertPlayerAcademy(admin, trainer.id);
    const all: any[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data: rows, error } = await admin
        .from("world_academies")
        .select(selectColumns)
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!rows?.length) break;
      all.push(...rows);
      if (rows.length < pageSize) break;
    }

    const ranked = sortRows(all, sort).map((row, index) => ({
      ...row,
      current_position: index + 1,
    }));
    const player = ranked.find((row) => row.trainer_id === trainer.id) ?? null;
    const context5 = player
      ? ranked.filter(
          (row) =>
            row.current_position >= Math.max(1, player.current_position - 2) &&
            row.current_position <= player.current_position + 2,
        )
      : [];

    return json({ sort, total: ranked.length, top: ranked.slice(0, 50), player, context5 });
  } catch (error) {
    console.error("world-ranking", error);
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});
