import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { GEM_PACKAGES } from "@/lib/shop.server";

export const MONTHLY_CLUB_GEM_PRICE = 1050;
export const MONTHLY_CLUB_REAL_PRICE = "R$ 29,90";

const TASKS = [
  { key: "check_in", label: "Entrar no jogo", target: 1, reward: 2 },
  { key: "play_1", label: "Jogar 1 partida", target: 1, reward: 4 },
  { key: "play_3", label: "Jogar 3 partidas", target: 3, reward: 5 },
  { key: "win_1", label: "Vencer 1 partida", target: 1, reward: 4 },
] as const;

function saoPauloDate(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

async function trainerContext(context: { supabase: any; userId: string }) {
  const { data: trainer } = await context.supabase
    .from("trainers")
    .select("id")
    .eq("user_id", context.userId)
    .single();
  if (!trainer) throw new Error("Treinador não encontrado.");
  return trainer as { id: string };
}

export const getMonthlyClubState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const trainer = await trainerContext(context);
    const supabase = context.supabase as any;
    const today = saoPauloDate();
    const localToday = new Date(`${today}T00:00:00Z`);
    const mondayOffset = (localToday.getUTCDay() + 6) % 7;
    localToday.setUTCDate(localToday.getUTCDate() - mondayOffset);
    const weekStart = localToday.toISOString().slice(0, 10);
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const now = new Date().toISOString();
    const [{ data: academy }, { data: membership }, { data: teams }, { data: claims }, { data: cycle }, { data: entitlements }] = await Promise.all([
      supabase.from("academies").select("gems").eq("trainer_id", trainer.id).single(),
      supabase.from("club_memberships").select("active_until, activation_source").eq("trainer_id", trainer.id).maybeSingle(),
      supabase.from("teams").select("id").eq("trainer_id", trainer.id).eq("is_player", true),
      supabase.from("club_daily_claims").select("claim_date, task_key, gems_awarded").eq("trainer_id", trainer.id).gte("claim_date", weekStart),
      supabase.from("club_cycles").select("id, starts_at, ends_at").eq("trainer_id", trainer.id).lte("starts_at", now).gt("ends_at", now).order("starts_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("club_entitlements").select("scout_credits, shield_12h_credits, training_rush_credits").eq("trainer_id", trainer.id).maybeSingle(),
    ]);

    let calendarClaims: any[] = [];
    if (cycle?.id) {
      const { data } = await supabase.from("club_calendar_claims").select("day_number, reward_key").eq("cycle_id", cycle.id).order("day_number");
      calendarClaims = data ?? [];
    }

    const teamIds = (teams ?? []).map((team: any) => team.id);
    let matches: any[] = [];
    if (teamIds.length) {
      const filters = teamIds.flatMap((id: string) => [`home_team_id.eq.${id}`, `away_team_id.eq.${id}`]).join(",");
      const { data } = await supabase
        .from("matches")
        .select("home_team_id, away_team_id, home_score, away_score, played_at")
        .or(filters)
        .gte("played_at", since);
      matches = (data ?? []).filter((match: any) => match.played_at && saoPauloDate(new Date(match.played_at)) === today);
    }

    const teamSet = new Set(teamIds);
    const wins = matches.filter((match: any) =>
      (teamSet.has(match.home_team_id) && match.home_score > match.away_score) ||
      (teamSet.has(match.away_team_id) && match.away_score > match.home_score),
    ).length;
    const claimedToday = new Set((claims ?? []).filter((c: any) => c.claim_date === today).map((c: any) => c.task_key));
    const checkInDays = new Set((claims ?? []).filter((c: any) => c.task_key === "check_in").map((c: any) => c.claim_date)).size;
    const weeklyClaimed = (claims ?? []).some((c: any) => c.task_key === "weekly_bonus" && c.claim_date === weekStart);

    const active = !!membership && new Date(membership.active_until).getTime() > Date.now();
    const rewardMultiplier = active ? 1.5 : 1;
    const currentCalendarDay = cycle ? Math.min(30, Math.floor((Date.now() - new Date(cycle.starts_at).getTime()) / 86400000) + 1) : 0;
    const claimedCalendarDays = calendarClaims.map((claim: any) => Number(claim.day_number));
    const gemDeficit = Math.max(0, MONTHLY_CLUB_GEM_PRICE - Number(academy?.gems ?? 0));
    const recommendedPackage = gemDeficit > 0
      ? GEM_PACKAGES.find((pack) => pack.gems + pack.bonus >= gemDeficit) ?? GEM_PACKAGES.at(-1)
      : null;
    return {
      gems: Number(academy?.gems ?? 0),
      gem_price: MONTHLY_CLUB_GEM_PRICE,
      real_price: MONTHLY_CLUB_REAL_PRICE,
      active,
      active_until: membership?.active_until ?? null,
      activation_source: membership?.activation_source ?? null,
      gem_deficit: gemDeficit,
      recommended_package: recommendedPackage ? { ...recommendedPackage, total_gems: recommendedPackage.gems + recommendedPackage.bonus } : null,
      calendar: {
        current_day: currentCalendarDay,
        claimed_days: claimedCalendarDays,
        claimed_count: claimedCalendarDays.length,
        claimed_today: claimedCalendarDays.includes(currentCalendarDay),
        monthly_goal_complete: claimedCalendarDays.length >= 20,
      },
      entitlements: {
        scout_credits: Number(entitlements?.scout_credits ?? 0),
        shield_12h_credits: Number(entitlements?.shield_12h_credits ?? 0),
        training_rush_credits: Number(entitlements?.training_rush_credits ?? 0),
      },
      tasks: TASKS.map((task) => {
        const current = task.key === "check_in" ? 1 : task.key === "win_1" ? wins : matches.length;
        return { ...task, reward: Math.ceil(task.reward * rewardMultiplier), current: Math.min(task.target, current), complete: current >= task.target, claimed: claimedToday.has(task.key) };
      }),
      weekly: { current: Math.min(5, checkInDays), target: 5, reward: Math.ceil(40 * rewardMultiplier), complete: checkInDays >= 5, claimed: weeklyClaimed },
    };
  });

export const activateMonthlyClubWithGems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const trainer = await trainerContext(context);
    const { data, error } = await (context.supabase as any).rpc("activate_monthly_club_with_gems_v2", { p_trainer_id: trainer.id });
    if (error) throw error;
    return { active_until: data as string };
  });

export const claimClubCalendarDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const trainer = await trainerContext(context);
    const { data, error } = await (context.supabase as any).rpc("claim_club_calendar_day", { p_trainer_id: trainer.id });
    if (error) throw error;
    return data as { day: number; reward: string; claimed_days: number; monthly_bonus: boolean };
  });

export const claimClubTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ task_key: z.enum(["check_in", "play_1", "play_3", "win_1", "weekly_bonus"]) }).parse(input))
  .handler(async ({ context, data }) => {
    const trainer = await trainerContext(context);
    const { data: reward, error } = await (context.supabase as any).rpc("claim_club_task", { p_trainer_id: trainer.id, p_task_key: data.task_key });
    if (error) throw error;
    return { reward: Number(reward) };
  });
