import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { GEM_PACKAGES } from "@/lib/shop.server";

export const MONTHLY_CLUB_GEM_PRICE = 1050;
export const MONTHLY_CLUB_REAL_PRICE = "R$ 29,90";

const WEEKLY_MISSIONS: Record<string, { label: string; target: number; reward: number }> = {
  active_days_5: { label: "Entrar em 5 dias diferentes", target: 5, reward: 3 },
  play_matches_3: { label: "Jogar 3 partidas", target: 3, reward: 3 },
  win_matches_2: { label: "Vencer 2 partidas", target: 2, reward: 3 },
  score_goals_5: { label: "Marcar 5 gols", target: 5, reward: 2 },
  training_1: { label: "Concluir 1 treinamento", target: 1, reward: 2 },
  market_visit_1: { label: "Visitar o Mercado", target: 1, reward: 1 },
  sign_player_1: { label: "Contratar 1 jogador", target: 1, reward: 1 },
};

async function trainerContext(context: { supabase: any; userId: string }) {
  const { data: trainer } = await context.supabase.from("trainers").select("id").eq("user_id", context.userId).single();
  if (!trainer) throw new Error("Treinador não encontrado.");
  return trainer as { id: string };
}

export const getMonthlyClubState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const trainer = await trainerContext(context);
    const supabase = context.supabase as any;
    const now = new Date().toISOString();
    const [{ data: academy }, { data: membership }, { data: cycle }, { data: entitlements }, weeklyResult] = await Promise.all([
      supabase.from("academies").select("gems").eq("trainer_id", trainer.id).single(),
      supabase.from("club_memberships").select("active_until, activation_source").eq("trainer_id", trainer.id).maybeSingle(),
      supabase.from("club_cycles").select("id, starts_at, ends_at").eq("trainer_id", trainer.id).lte("starts_at", now).gt("ends_at", now).order("starts_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("club_entitlements").select("scout_credits, shield_12h_credits, training_rush_credits").eq("trainer_id", trainer.id).maybeSingle(),
      supabase.rpc("get_weekly_mission_state"),
    ]);

    if (weeklyResult.error) throw weeklyResult.error;
    let calendarClaims: any[] = [];
    if (cycle?.id) {
      const { data } = await supabase.from("club_calendar_claims").select("day_number, reward_key").eq("cycle_id", cycle.id).order("day_number");
      calendarClaims = data ?? [];
    }

    const active = !!membership && new Date(membership.active_until).getTime() > Date.now();
    const currentCalendarDay = cycle ? Math.min(30, Math.floor((Date.now() - new Date(cycle.starts_at).getTime()) / 86400000) + 1) : 0;
    const claimedCalendarDays = calendarClaims.map((claim: any) => Number(claim.day_number));
    const gemDeficit = Math.max(0, MONTHLY_CLUB_GEM_PRICE - Number(academy?.gems ?? 0));
    const recommendedPackage = gemDeficit > 0 ? GEM_PACKAGES.find((pack) => pack.gems + pack.bonus >= gemDeficit) ?? GEM_PACKAGES.at(-1) : null;
    const weekly = weeklyResult.data ?? { missions: [], completed: 0, total: 0, claimed: false };

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
      tasks: (weekly.missions ?? []).map((mission: any) => ({
        key: mission.key,
        label: WEEKLY_MISSIONS[mission.key]?.label ?? mission.key,
        target: Number(mission.target ?? WEEKLY_MISSIONS[mission.key]?.target ?? 1),
        reward: Number(mission.reward ?? WEEKLY_MISSIONS[mission.key]?.reward ?? 1),
        current: Number(mission.progress ?? 0),
        complete: Boolean(mission.complete),
        claimed: Boolean(mission.claimed),
      })),
      weekly: {
        current: Number(weekly.completed ?? 0),
        target: Number(weekly.total ?? 7),
        reward: 5,
        complete: Number(weekly.completed ?? 0) >= Number(weekly.total ?? 7),
        claimed: Boolean(weekly.completion_claimed),
      },
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
  .inputValidator((input: unknown) => z.object({ task_key: z.string().min(1).max(64) }).parse(input))
  .handler(async ({ context, data }) => {
    const rpc = data.task_key === "weekly_bonus" ? "claim_weekly_completion_atomic" : "claim_weekly_mission_atomic";
    const params = data.task_key === "weekly_bonus"
      ? { p_idempotency_key: crypto.randomUUID() }
      : { p_mission_key: data.task_key, p_idempotency_key: crypto.randomUUID() };
    const { data: reward, error } = await (context.supabase as any).rpc(rpc, params);
    if (error) throw error;
    return { reward: Number(reward) };
  });
