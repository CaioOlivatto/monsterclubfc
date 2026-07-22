import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface CareerEntry {
  id: string;
  team_id: string | null;
  team_name: string;
  division: string;
  season_start: number;
  season_end: number | null;
  final_position: number | null;
  event: "arrived" | "hired" | "promoted" | "relegated" | "champion" | "fired" | "left";
  title: string | null;
  created_at: string;
}

export interface CareerSummary {
  trainer_name: string;
  academy_name: string;
  level: number;
  xp: number;
  current_team_id: string | null;
  current_team_name: string | null;
  current_division: string | null;
  seasons_at_current_club: number;
  consecutive_bad_seasons: number;
  last_final_position: number | null;
  entries: CareerEntry[];
  totals: {
    clubs: number;
    seasons: number;
    titles: number;
    promotions: number;
    relegations: number;
    dismissals: number;
  };
}

export const getCareer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CareerSummary> => {
    const { supabase, userId } = context;

    const { data: trainer, error: tErr } = await supabase
      .from("trainers")
      .select(
        "id, trainer_name, academy_name, level, xp, current_team_id, seasons_at_current_club, consecutive_bad_seasons, last_final_position",
      )
      .eq("user_id", userId)
      .maybeSingle();
    if (tErr) throw tErr;
    if (!trainer) throw new Error("Treinador não encontrado.");

    let currentTeamName: string | null = null;
    let currentDivision: string | null = null;
    if (trainer.current_team_id) {
      const { data: team } = await supabase
        .from("teams")
        .select("name, division")
        .eq("id", trainer.current_team_id)
        .maybeSingle();
      currentTeamName = team?.name ?? null;
      currentDivision = (team?.division as string | null) ?? null;
    }

    const { data: rows, error: cErr } = await supabase
      .from("trainer_career")
      .select("id, team_id, team_name, division, season_start, season_end, final_position, event, title, created_at")
      .eq("trainer_id", trainer.id)
      .order("season_start", { ascending: false })
      .order("created_at", { ascending: false });
    if (cErr) throw cErr;

    const entries = (rows ?? []) as CareerEntry[];
    const clubs = new Set<string>();
    let seasons = 0;
    let titles = 0;
    let promotions = 0;
    let relegations = 0;
    let dismissals = 0;
    for (const e of entries) {
      if (e.team_id) clubs.add(e.team_id);
      if (e.event === "champion") titles++;
      if (e.event === "promoted") promotions++;
      if (e.event === "relegated") relegations++;
      if (e.event === "fired") dismissals++;
      if (e.final_position != null) seasons++;
    }

    return {
      trainer_name: trainer.trainer_name,
      academy_name: trainer.academy_name,
      level: trainer.level,
      xp: trainer.xp,
      current_team_id: trainer.current_team_id,
      current_team_name: currentTeamName,
      current_division: currentDivision,
      seasons_at_current_club: trainer.seasons_at_current_club,
      consecutive_bad_seasons: trainer.consecutive_bad_seasons,
      last_final_position: trainer.last_final_position,
      entries,
      totals: { clubs: clubs.size, seasons, titles, promotions, relegations, dismissals },
    };
  });

export interface ConfidenceInfo {
  score: number; // 0-100
  label: string;
  tone: "danger" | "warn" | "neutral" | "good" | "great";
  factors: { label: string; delta: number }[];
  position: number | null;
  totalTeams: number | null;
  form: ("W" | "D" | "L")[];
  seasonsAtClub: number;
  consecutiveBadSeasons: number;
}

function labelFor(score: number): { label: string; tone: ConfidenceInfo["tone"] } {
  if (score < 20) return { label: "Demissão iminente", tone: "danger" };
  if (score < 40) return { label: "Sob pressão", tone: "warn" };
  if (score < 60) return { label: "Estável", tone: "neutral" };
  if (score < 80) return { label: "Prestigiado", tone: "good" };
  return { label: "Ídolo do clube", tone: "great" };
}

export const getConfidence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ConfidenceInfo> => {
    const { supabase, userId } = context;
    const { data: trainer } = await supabase
      .from("trainers")
      .select("id, current_team_id, seasons_at_current_club, consecutive_bad_seasons, last_final_position")
      .eq("user_id", userId)
      .maybeSingle();
    if (!trainer) throw new Error("Treinador não encontrado.");

    const factors: { label: string; delta: number }[] = [];
    let score = 50;
    factors.push({ label: "Base", delta: 50 });

    let position: number | null = null;
    let totalTeams: number | null = null;
    if (trainer.current_team_id) {
      const { data: standings } = await supabase
        .from("standings")
        .select("team_id, points, goals_for, goals_against")
        .order("points", { ascending: false });
      if (standings && standings.length) {
        totalTeams = standings.length;
        const idx = standings.findIndex((s: any) => s.team_id === trainer.current_team_id);
        if (idx >= 0) {
          position = idx + 1;
          const expected = (totalTeams + 1) / 2;
          const delta = Math.round((expected - position) * 5);
          if (delta !== 0) {
            factors.push({ label: `Posição ${position}º/${totalTeams}`, delta });
            score += delta;
          }
        }
      }
    }

    const form: ("W" | "D" | "L")[] = [];
    if (trainer.current_team_id) {
      const { data: matches } = await supabase
        .from("matches")
        .select("home_team_id, away_team_id, home_score, away_score, status, is_friendly, played_at")
        .or(`home_team_id.eq.${trainer.current_team_id},away_team_id.eq.${trainer.current_team_id}`)
        .eq("status", "finished")
        .eq("is_friendly", false)
        .order("played_at", { ascending: false })
        .limit(5);
      let formDelta = 0;
      for (const m of matches ?? []) {
        const isHome = m.home_team_id === trainer.current_team_id;
        const my = isHome ? m.home_score : m.away_score;
        const opp = isHome ? m.away_score : m.home_score;
        if (my == null || opp == null) continue;
        if (my > opp) { form.push("W"); formDelta += 6; }
        else if (my < opp) { form.push("L"); formDelta -= 6; }
        else { form.push("D"); }
      }
      if (formDelta !== 0) {
        factors.push({ label: `Últimos ${form.length} jogos`, delta: formDelta });
        score += formDelta;
      }
    }

    const bad = trainer.consecutive_bad_seasons ?? 0;
    if (bad > 0) {
      const delta = -15 * bad;
      factors.push({ label: `${bad} temporada(s) ruim(ns) seguidas`, delta });
      score += delta;
    }

    const last = trainer.last_final_position;
    if (last != null && totalTeams) {
      if (last <= 3) {
        factors.push({ label: `Temporada passada: ${last}º`, delta: 10 });
        score += 10;
      } else if (last >= totalTeams - 2) {
        factors.push({ label: `Temporada passada: ${last}º`, delta: -10 });
        score -= 10;
      }
    }

    score = Math.max(0, Math.min(100, score));
    const { label, tone } = labelFor(score);
    return {
      score,
      label,
      tone,
      factors,
      position,
      totalTeams,
      form,
      seasonsAtClub: trainer.seasons_at_current_club ?? 0,
      consecutiveBadSeasons: bad,
    };
  });

// ---------- Propostas de clubes (Fase 3) ----------

export interface JobOffer {
  id: string;
  team_id: string;
  team_name: string;
  division: string;
  season_offered: number;
  reason: "top_finish" | "higher_division" | "after_dismissal";
  status: "pending" | "accepted" | "declined" | "expired";
  signing_bonus: number;
  message: string | null;
  created_at: string;
}

export interface OffersOverview {
  status: "employed" | "dismissed";
  pending_transition: boolean;
  current_team_id: string | null;
  current_team_name: string | null;
  offers: JobOffer[];
}

export const listOffers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OffersOverview> => {
    const { supabase, userId } = context;
    const { data: trainer } = await supabase
      .from("trainers")
      .select("id, current_team_id, status, pending_transition")
      .eq("user_id", userId)
      .maybeSingle();
    if (!trainer) throw new Error("Treinador não encontrado.");

    let currentTeamName: string | null = null;
    if (trainer.current_team_id) {
      const { data: t } = await supabase
        .from("teams")
        .select("name")
        .eq("id", trainer.current_team_id)
        .maybeSingle();
      currentTeamName = t?.name ?? null;
    }

    const { data: offers } = await supabase
      .from("job_offers")
      .select("id, team_id, team_name, division, season_offered, reason, status, signing_bonus, message, created_at")
      .eq("trainer_id", trainer.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    return {
      status: (trainer.status as "employed" | "dismissed") ?? "employed",
      pending_transition: !!trainer.pending_transition,
      current_team_id: trainer.current_team_id,
      current_team_name: currentTeamName,
      offers: (offers ?? []) as JobOffer[],
    };
  });

export const declineOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { offerId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: trainer } = await supabase
      .from("trainers")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!trainer) throw new Error("Treinador não encontrado.");
    const { error } = await supabase
      .from("job_offers")
      .update({ status: "declined" })
      .eq("id", data.offerId)
      .eq("trainer_id", trainer.id);
    if (error) throw error;
    return { ok: true };
  });

