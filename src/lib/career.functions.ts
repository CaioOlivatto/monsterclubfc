import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateStarterRoster, rosterToDbRows, type StarterKey } from "./starter-teams";


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

const STARTING_CASH_BY_DIVISION: Record<string, number> = {
  lendaria: 2_000_000,
  diamante: 1_200_000,
  ouro: 700_000,
  prata: 400_000,
  bronze: 200_000,
};


export interface AcceptOfferResult {
  ok: true;
  new_team_name: string;
  new_division: string;
  signing_bonus: number;
  brought_creatures: number;
}

export const acceptOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { offerId: string; keepCreatureIds: string[] }) => {
    if (!Array.isArray(input.keepCreatureIds) || input.keepCreatureIds.length !== 2) {
      throw new Error("Você deve escolher exatamente 2 criaturas para levar.");
    }
    if (input.keepCreatureIds[0] === input.keepCreatureIds[1]) {
      throw new Error("Escolha duas criaturas diferentes.");
    }
    return input;
  })
  .handler(async ({ data, context }): Promise<AcceptOfferResult> => {
    const { supabase, userId } = context;

    // 1) Treinador
    const { data: trainer } = await supabase
      .from("trainers")
      .select("id, current_team_id, status, trainer_name")
      .eq("user_id", userId)
      .maybeSingle();
    if (!trainer) throw new Error("Treinador não encontrado.");

    // 2) Proposta
    const { data: offer } = await supabase
      .from("job_offers")
      .select("id, team_id, team_name, division, signing_bonus, status")
      .eq("id", data.offerId)
      .eq("trainer_id", trainer.id)
      .maybeSingle();
    if (!offer) throw new Error("Proposta não encontrada.");
    if (offer.status !== "pending") throw new Error("Esta proposta não está mais disponível.");

    // 3) Novo time (verifica que está livre)
    const { data: newTeam } = await supabase
      .from("teams")
      .select("id, name, division, dominant_element, style, trainer_id")
      .eq("id", offer.team_id)
      .maybeSingle();
    if (!newTeam) throw new Error("Clube não encontrado.");
    if (newTeam.trainer_id && newTeam.trainer_id !== trainer.id) {
      throw new Error("Este clube já contratou outro treinador.");
    }

    // 4) Valida as 2 criaturas escolhidas
    const { data: kept } = await supabase
      .from("creatures")
      .select("id, name, owner_trainer_id, retired")
      .in("id", data.keepCreatureIds)
      .eq("owner_trainer_id", trainer.id);
    if (!kept || kept.length !== 2) {
      throw new Error("Criaturas inválidas. Escolha duas do seu elenco atual.");
    }
    if (kept.some((c: any) => c.retired)) {
      throw new Error("Criaturas aposentadas não podem ser levadas.");
    }

    // 5) Absorve o elenco EXISTENTE do novo clube (CPU): assume owner_trainer_id
    //    e descarta as 2 criaturas mais fracas para dar espaço às 2 trazidas.
    const { data: existingRoster } = await supabase
      .from("creatures")
      .select("id, overall, retired")
      .eq("owner_team_id", newTeam.id);
    const activeRoster = (existingRoster ?? []).filter((c: any) => !c.retired);
    const sortedByOvr = [...activeRoster].sort((a: any, b: any) => (a.overall ?? 0) - (b.overall ?? 0));
    const dropIds = sortedByOvr.slice(0, 2).map((c: any) => c.id);
    const keepFromNewClubIds = sortedByOvr.slice(2).map((c: any) => c.id);

    // 6) Solta o elenco antigo (menos as 2 escolhidas): owner_trainer_id → null
    if (trainer.current_team_id) {
      const keepSet = new Set(data.keepCreatureIds);
      const { data: allOld } = await supabase
        .from("creatures")
        .select("id")
        .eq("owner_trainer_id", trainer.id)
        .eq("owner_team_id", trainer.current_team_id);
      const releaseIds = (allOld ?? []).map((c: any) => c.id).filter((id: string) => !keepSet.has(id));
      if (releaseIds.length) {
        await supabase
          .from("creatures")
          .update({ owner_trainer_id: null })
          .in("id", releaseIds);
      }

      // Libera clube antigo
      await supabase
        .from("teams")
        .update({ trainer_id: null, is_player: false, is_cpu: true })
        .eq("id", trainer.current_team_id);
    }

    // 7) Descarta os 2 mais fracos do novo clube (liberados para nada — sumiram)
    if (dropIds.length) {
      await supabase.from("creatures").delete().in("id", dropIds);
    }

    // 8) Assume o elenco remanescente do novo clube
    if (keepFromNewClubIds.length) {
      await supabase
        .from("creatures")
        .update({ owner_trainer_id: trainer.id })
        .in("id", keepFromNewClubIds);
    }

    // 9) Reassinala as 2 mantidas do treinador ao novo clube
    await supabase
      .from("creatures")
      .update({ owner_team_id: newTeam.id })
      .in("id", data.keepCreatureIds);


    // 9) Novo clube passa a ser do jogador
    await supabase
      .from("teams")
      .update({ trainer_id: trainer.id, is_player: true, is_cpu: false })
      .eq("id", newTeam.id);

    // 10) Trainer: novos vínculos e reset de contadores
    await supabase
      .from("trainers")
      .update({
        current_team_id: newTeam.id,
        seasons_at_current_club: 0,
        consecutive_bad_seasons: 0,
        last_final_position: null,
        status: "employed",
        pending_transition: false,
      })
      .eq("id", trainer.id);

    // 11) Ofertas: aceita esta, expira as demais
    await supabase
      .from("job_offers")
      .update({ status: "accepted" })
      .eq("id", offer.id);
    await supabase
      .from("job_offers")
      .update({ status: "expired" })
      .eq("trainer_id", trainer.id)
      .eq("status", "pending");

    // 12) Finanças: zera o caixa antigo e credita o caixa do novo clube + bônus.
    //     O dinheiro NÃO viaja com o treinador — fica no clube que ele deixou.
    const { data: allTx } = await supabase
      .from("financial_transactions")
      .select("transaction_type, amount")
      .eq("trainer_id", trainer.id);
    const currentBalance = (allTx ?? []).reduce((acc: number, t: any) => {
      const amt = Number(t.amount) || 0;
      return t.transaction_type === "income" ? acc + amt : acc - amt;
    }, 0);
    if (currentBalance > 0) {
      await supabase.from("financial_transactions").insert({
        trainer_id: trainer.id,
        transaction_type: "expense",
        category: "club_transfer",
        amount: currentBalance,
        description: `Caixa deixado no clube anterior`,
      });
    } else if (currentBalance < 0) {
      // dívida também fica com o clube antigo
      await supabase.from("financial_transactions").insert({
        trainer_id: trainer.id,
        transaction_type: "income",
        category: "club_transfer",
        amount: -currentBalance,
        description: `Dívida deixada no clube anterior`,
      });
    }

    const startingCash = STARTING_CASH_BY_DIVISION[newTeam.division ?? "bronze"] ?? 200_000;
    await supabase.from("financial_transactions").insert({
      trainer_id: trainer.id,
      transaction_type: "income",
      category: "club_transfer",
      amount: startingCash,
      description: `Caixa do ${newTeam.name}`,
    });

    if (offer.signing_bonus > 0) {
      await supabase.from("financial_transactions").insert({
        trainer_id: trainer.id,
        transaction_type: "income",
        category: "signing_bonus",
        amount: offer.signing_bonus,
        description: `Bônus de contratação — ${offer.team_name}`,
      });
    }


    // 13) Reseta escalação (será regerada pelo botão "Auto definir")
    await supabase.from("team_lineups").delete().eq("trainer_id", trainer.id);

    // 14) Histórico de carreira: chegou ao novo clube
    const { data: currentSeason } = await supabase
      .from("game_seasons")
      .select("season_number")
      .eq("trainer_id", trainer.id)
      .eq("is_current", true)
      .maybeSingle();
    const seasonNum = currentSeason?.season_number ?? 1;

    await supabase.from("trainer_career").insert({
      trainer_id: trainer.id,
      team_id: newTeam.id,
      team_name: newTeam.name,
      division: newTeam.division ?? "bronze",

      season_start: seasonNum,
      season_end: seasonNum,
      final_position: null,
      event: "hired",
      title: `Contratado pelo ${newTeam.name}`,
    });

    return {
      ok: true,
      new_team_name: newTeam.name,
      new_division: newTeam.division ?? "bronze",
      signing_bonus: offer.signing_bonus,
      brought_creatures: 2,
    };
  });


