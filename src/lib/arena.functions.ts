import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function trainer(ctx: any) {
  const { data } = await ctx.supabase
    .from("trainers")
    .select("id,level,trainer_name,academy_name")
    .eq("user_id", ctx.userId)
    .single();
  if (!data) throw new Error("Treinador não encontrado.");
  return data;
}

export const getArena = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const t = await trainer(context);
    if ((t.level ?? 0) < 10) return { locked: true, level: t.level ?? 0, unlock_level: 10 };
    const db = context.supabase as any;
    const { data: seasonReward, error: seasonError } = await db.rpc("sync_arena_season", {
      p_trainer: t.id,
    });
    if (seasonError) throw seasonError;
    const { data: profile, error } = await db.rpc("refresh_arena_profile", { p_trainer_id: t.id });
    if (error) throw error;
    const low = Math.floor(profile.power * 0.9),
      high = Math.ceil(profile.power * 1.1);
    const seasonKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
    })
      .format(new Date())
      .slice(0, 7);
    const [
      { data: real },
      { data: bots },
      { data: academy },
      { data: history },
      { data: entitlements },
      { data: membership },
      { data: leaders },
    ] = await Promise.all([
      db
        .from("arena_profiles")
        .select(
          "trainer_id,power,wins,losses,shield_until,trainers!inner(trainer_name,academy_name)",
        )
        .neq("trainer_id", t.id)
        .gte("power", low)
        .lte("power", high)
        .or("shield_until.is.null,shield_until.lt." + new Date().toISOString())
        .limit(6),
      db
        .from("arena_bots")
        .select("id,trainer_name,academy_name,power,personality,wins,losses")
        .eq("active", true)
        .gte("power", low)
        .lte("power", high)
        .limit(12),
      db.from("academies").select("money,gems").eq("trainer_id", t.id).single(),
      db
        .from("arena_duels")
        .select(
          "id,mode,buff_key,buff_gem_cost,wager,attacker_power,effective_attacker_power,difficulty_ratio,attacker_score,defender_score,money_delta,trainer_xp_awarded,rating_delta,stadium_damage_pct,created_at",
        )
        .eq("attacker_id", t.id)
        .order("created_at", { ascending: false })
        .limit(12),
      db
        .from("club_entitlements")
        .select("scout_credits,shield_12h_credits,preparation_credits,insurance_credits")
        .eq("trainer_id", t.id)
        .maybeSingle(),
      db.from("club_memberships").select("active_until").eq("trainer_id", t.id).maybeSingle(),
      db
        .from("arena_profiles")
        .select(
          "trainer_id,arena_rating,arena_title,season_wins,season_duels,trainers!inner(trainer_name,academy_name)",
        )
        .eq("arena_season_key", seasonKey)
        .order("arena_rating", { ascending: false })
        .limit(10),
    ]);
    const realOpponents = (real ?? [])
      .map((r: any) => ({
        kind: "real",
        id: r.trainer_id,
        name: r.trainers?.trainer_name,
        academy: r.trainers?.academy_name,
        power: r.power,
        wins: r.wins,
        losses: r.losses,
      }))
      .sort(() => Math.random() - 0.5);
    const botOpponents = (bots ?? [])
      .map((b: any) => ({
        kind: "bot",
        id: b.id,
        name: b.trainer_name,
        academy: b.academy_name,
        power: b.power,
        wins: b.wins,
        losses: b.losses,
        style: b.personality,
      }))
      .sort(() => Math.random() - 0.5);
    const opponents = [
      ...realOpponents.slice(0, 6),
      ...botOpponents.slice(0, Math.max(0, 6 - realOpponents.length)),
    ];
    const resetAt = new Date(
      new Date(profile.attack_window_started_at).getTime() + 8 * 3600000,
    ).toISOString();
    const clubActive = !!membership && new Date(membership.active_until).getTime() > Date.now();
    const windowStarted = new Date(profile.attack_window_started_at).getTime();
    const windowHistory = (history ?? []).filter(
      (duel: any) => new Date(duel.created_at).getTime() >= windowStarted,
    );
    const competitiveUsed = windowHistory.filter((duel: any) => duel.mode === "competitive").length;
    const riskUsed = windowHistory.filter((duel: any) => duel.mode === "risk").length;
    const competitiveLimit = 3;
    const riskLimit = clubActive ? 6 : 3;
    const strengthBuffsUsed = (history ?? []).filter(
      (duel: any) =>
        ["preparation", "adrenaline", "wall"].includes(duel.buff_key) &&
        new Date(duel.created_at).getTime() >= Date.now() - 86400000,
    ).length;
    const repairBase =
      profile.repair_completes_at && new Date(profile.repair_completes_at).getTime() > Date.now()
        ? Math.max(
            10,
            Math.ceil((new Date(profile.repair_completes_at).getTime() - Date.now()) / 3600000) *
              10,
          )
        : 0;
    const repairCost = clubActive ? Math.max(1, Math.ceil(repairBase * 0.9)) : repairBase;
    return {
      locked: false,
      profile,
      money: Number(academy?.money ?? 0),
      gems: Number(academy?.gems ?? 0),
      club_active: clubActive,
      competitive_limit: competitiveLimit,
      competitive_left: Math.max(0, competitiveLimit - competitiveUsed),
      risk_limit: riskLimit,
      risk_left: Math.max(0, riskLimit - riskUsed),
      reset_at: resetAt,
      repair_cost: repairCost,
      repair_discount: clubActive ? 10 : 0,
      scout_credits: Number(entitlements?.scout_credits ?? 0),
      shield_credits: Number(entitlements?.shield_12h_credits ?? 0),
      preparation_credits: Number(entitlements?.preparation_credits ?? 0),
      insurance_credits: Number(entitlements?.insurance_credits ?? 0),
      strength_buffs_left: Math.max(0, 3 - strengthBuffsUsed),
      season_reward: seasonReward,
      season_leaders: leaders ?? [],
      opponents,
      history: history ?? [],
    };
  });

export const playArenaDuel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        opponent_id: z.string().uuid(),
        opponent_kind: z.enum(["real", "bot"]),
        mode: z.enum(["competitive", "risk"]),
        wager: z.number().int(),
        buff: z.enum(["none", "preparation", "adrenaline", "wall", "insurance"]),
      })
      .parse(x),
  )
  .handler(async ({ context, data }) => {
    const t = await trainer(context);
    const { data: r, error } = await (context.supabase as any).rpc("play_arena_duel_v2", {
      p_attacker: t.id,
      p_defender: data.opponent_kind === "real" ? data.opponent_id : null,
      p_bot: data.opponent_kind === "bot" ? data.opponent_id : null,
      p_mode: data.mode,
      p_wager: data.wager,
      p_buff: data.buff,
    });
    if (error) throw error;
    return r;
  });

export const buyArenaShield = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z.object({ hours: z.union([z.literal(12), z.literal(24), z.literal(72)]) }).parse(x),
  )
  .handler(async ({ context, data }) => {
    const t = await trainer(context);
    const { data: r, error } = await (context.supabase as any).rpc("buy_arena_shield", {
      p_trainer: t.id,
      p_hours: data.hours,
    });
    if (error) throw error;
    return { shield_until: r };
  });
export const rushArenaRepair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const t = await trainer(context);
    const { data: r, error } = await (context.supabase as any).rpc("rush_arena_repair", {
      p_trainer: t.id,
    });
    if (error) throw error;
    return { spent: Number(r) };
  });
export const buyArenaScout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z.object({ opponent_id: z.string().uuid(), opponent_kind: z.enum(["real", "bot"]) }).parse(x),
  )
  .handler(async ({ context, data }) => {
    const t = await trainer(context);
    const { data: r, error } = await (context.supabase as any).rpc("buy_arena_scout", {
      p_trainer: t.id,
      p_defender: data.opponent_kind === "real" ? data.opponent_id : null,
      p_bot: data.opponent_kind === "bot" ? data.opponent_id : null,
    });
    if (error) throw error;
    return { chance: Number(r) };
  });
