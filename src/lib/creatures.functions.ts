/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  STARTER_TEAMS,
  generateStarterRoster,
  generateStarterRosterPreview,
  getStarterTeam,
  rosterToDbRows,
  type StarterKey,
} from "./starter-teams";
import { ensureStarterRoster, resolvePlayerCareerTeam } from "./starter-roster-recovery.server";
import { overallToStars } from "./bestiary";
import { generateSchedule } from "./league.server";
import { getNextOfficialMatchForTrainer } from "./official-match.server";
import { buildConfidence } from "./career.functions";
import { divisionalMatchSalary, totalMaintenancePerMatch, type Division } from "./economy";
import { buildSlots, type SlotRole } from "./lineup.server";
import { getDirectSession } from "./direct-session.server";


// ---------- gerador de criatura inicial ----------
const ELEMENTS = ["fogo", "agua", "terra", "ar", "gelo"] as const;
type ElementType = (typeof ELEMENTS)[number];

const PREFIXES = [
  "Vulc", "Aqua", "Petra", "Aero", "Cryo", "Igni", "Hydro", "Terra",
  "Ventus", "Glacia", "Pyro", "Nix", "Silva", "Nimbo", "Frost", "Ember",
  "Rio", "Monte", "Aura", "Neva", "Fulg", "Onda", "Rocha", "Brisa",
];
const SUFFIXES = [
  "ron", "lith", "dorix", "vent", "frim", "tar", "mir", "zeph",
  "gorn", "dus", "phus", "tos", "quir", "nel", "dax", "ram",
  "kur", "phyx", "tan", "vor", "sol", "nix", "mel", "gar",
];

const POSITIONS = ["Goleiro", "Zagueiro", "Meio-campo", "Atacante"] as const;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Escala 0-100 alinhada em meia-estrela (múltiplos de 10).
// Elenco inicial: majoritariamente 0,5★ a 2★, com raros 2,5★.
function starAttr(): number {
  const r = Math.random();
  if (r < 0.35) return 10; // 0.5★
  if (r < 0.7) return 20;  // 1★
  if (r < 0.9) return 30;  // 1.5★
  if (r < 0.98) return 40; // 2★
  return 50;               // 2.5★
}

function genCreature(trainerId: string) {
  const element: ElementType = pick(ELEMENTS);
  const name = pick(PREFIXES) + pick(SUFFIXES);
  const position = pick(POSITIONS);

  const attack = starAttr();
  const defense = starAttr();
  // Goleiro inicial tem afinidade mínima com o atributo Goleiro
  const goalkeeper = position === "Goleiro" ? Math.max(starAttr(), 30) : starAttr();
  const physical = starAttr();
  const strength = starAttr();
  const overall = Math.round((attack + defense + goalkeeper + physical + strength) / 5);
  const market_value = overall * 800;

  return {
    owner_trainer_id: trainerId,
    name,
    element,
    suggested_position: position,
    attack,
    defense,
    goalkeeper,
    physical,
    strength,
    aff_fogo: 0,
    aff_agua: 0,
    aff_terra: 0,
    aff_ar: 0,
    aff_gelo: 0,
    overall,
    xp: 0,
    half_stars_earned: 0,
    energy: 100,
    market_value,
  };
}

function starterRole(position: string | null | undefined): SlotRole {
  if (position === "Goleiro") return "GOL";
  if (position === "Zagueiro") return "DEF";
  if (position === "Atacante") return "ATA";
  return "MEI";
}

function buildInitialLineup(creatures: any[]) {
  const remaining = [...creatures].sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
  const take = (role: SlotRole) => {
    const preferred = remaining.findIndex((creature) => starterRole(creature.suggested_position) === role);
    return remaining.splice(preferred >= 0 ? preferred : 0, 1)[0] ?? null;
  };
  const starters = buildSlots("4-4-2").map((slot) => ({
    slot: slot.index,
    role: slot.role,
    creature_id: take(slot.role)?.id ?? null,
  }));
  const bench = remaining.slice(0, 7).map((creature) => creature.id);
  if (starters.some((slot) => !slot.creature_id) || bench.length !== 7) {
    throw new Error("Nao foi possivel montar a escalacao inicial completa.");
  }
  return { starters, bench };
}

async function activateCareer(
  supabase: any,
  trainerId: string,
  team: { id: string; name: string; competition_id: string | null },
) {
  if (!team.competition_id) throw new Error("O campeonato inicial ainda nao foi criado.");
  const [{ data: competition, error: competitionError }, { data: creatures, error: creaturesError }] = await Promise.all([
    supabase.from("competitions").select("season_id").eq("id", team.competition_id).single(),
    supabase.from("creatures").select("id, suggested_position, overall")
      .eq("owner_trainer_id", trainerId).eq("owner_team_id", team.id),
  ]);
  if (competitionError) throw competitionError;
  if (creaturesError) throw creaturesError;
  if ((creatures?.length ?? 0) !== 26) {
    throw new Error(`Elenco incompleto: esperado 26, encontrado ${creatures?.length ?? 0}.`);
  }
  const lineup = buildInitialLineup(creatures ?? []);
  const { data, error } = await supabase.rpc("activate_starter_career", {
    p_team_id: team.id,
    p_season_id: competition.season_id,
    p_team_name: team.name,
    p_starters: lineup.starters,
    p_bench: lineup.bench,
  });
  if (error) throw error;
  if (!data?.ready) throw new Error("A carreira nao passou pela validacao final.");
  return data;
}

// ---------- server functions ----------

export const getMyTrainer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("trainers")
      .select("*, academies(*)")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const { count } = await context.supabase
      .from("creatures")
      .select("id", { count: "exact", head: true })
      .eq("owner_trainer_id", data.id);
    return { ...data, has_roster: (count ?? 0) > 0 };
  });

async function loadDashboard(supabase: any, userId: string) {
    const { data: trainer, error: trainerError } = await supabase
      .from("trainers")
      .select("*, academies(*)")
      .eq("user_id", userId)
      .maybeSingle();

    if (trainerError) throw trainerError;
    if (!trainer) return null;

    // Estas leituras dependem apenas do treinador e podem começar juntas. Antes,
    // a recuperação consultava o elenco e só depois o Dashboard consultava os
    // mesmos 26 registros novamente.
    const playerTeamPromise = resolvePlayerCareerTeam(supabase, trainer);
    const rosterPromise = supabase
      .from("creatures")
      // O painel aceita instalações que ainda estejam concluindo uma migração.
      // Pedir `*` evita que uma coluna opcional nova derrube toda a página.
      .select("*")
      .eq("owner_trainer_id", trainer.id)
      .order("overall", { ascending: false });
    const lineupPromise = supabase
      .from("team_lineups")
      .select("formation, strategy, starters, bench")
      .eq("trainer_id", trainer.id)
      .maybeSingle();
    const buildingsPromise = supabase
      .from("buildings")
      .select("building_type, level")
      .eq("team_id", trainer.current_team_id);

    const [playerTeam, { data: creatures, error: creaturesError }, { data: lineup }, { data: buildings }] = await Promise.all([
      playerTeamPromise,
      rosterPromise,
      lineupPromise,
      buildingsPromise,
    ]);
    if (creaturesError) throw creaturesError;

    let list = creatures ?? [];
    // Recuperação permanece disponível, mas não adiciona uma consulta ao caminho
    // normal. Uma segunda leitura ocorre somente quando a carreira está de fato
    // incompleta ou precisa religar jogadores antigos ao clube.
    const repairedRoster = await ensureStarterRoster(supabase, trainer.id, playerTeam, list);
    if (repairedRoster) {
      const { data: repairedCreatures, error: repairedError } = await supabase
        .from("creatures")
        .select("*")
        .eq("owner_trainer_id", trainer.id)
        .order("overall", { ascending: false });
      if (repairedError) throw repairedError;
      list = repairedCreatures ?? [];
    }
    const rosterCount = list.length;
    const avgEnergy = list.length
      ? Math.round(list.reduce((s: number, c: any) => s + (c.energy ?? 0), 0) / list.length)
      : 0;
    const avgOverall = list.length
      ? Math.round(list.reduce((s: number, c: any) => s + (c.overall ?? 0), 0) / list.length)
      : 0;
    const topCreatures = [...list]
      .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0))
      .slice(0, 3);

    const activeLeaguePromise = playerTeam?.competition_id
      ? supabase
          .from("competitions")
          .select("id")
          .eq("id", playerTeam.competition_id)
          .eq("type", "league")
          .eq("status", "active")
          .maybeSingle()
      : Promise.resolve({ data: null });


    let standing = null as null | {
      points: number;
      wins: number;
      draws: number;
      losses: number;
      goals_for: number;
      goals_against: number;
      position: number;
      total: number;
    };
    let nextMatch = null as null | {
      competition?: "league" | "cup" | "world_league" | "world_cup";
      competitionLabel?: string;
      phaseLabel?: string | null;
      sourcePath?: string;
      id: string;
      round: number;
      played_at: string | null;
      home_team: string;
      away_team: string;
      home_starter_key: string | null;
      away_starter_key: string | null;
      home_element: string | null;
      away_element: string | null;
      is_home: boolean;
    };

    const standingsPromise = playerTeam?.competition_id
      ? supabase
          .from("standings")
          .select("team_id, points, wins, draws, losses, goals_for, goals_against")
          .eq("competition_id", playerTeam.competition_id)
          .order("points", { ascending: false })
      : Promise.resolve({ data: [] });
    const recentMatchesPromise = trainer.current_team_id
      ? supabase
          .from("matches")
          .select("home_team_id, away_team_id, home_score, away_score")
          .or(`home_team_id.eq.${trainer.current_team_id},away_team_id.eq.${trainer.current_team_id}`)
          .eq("status", "finished")
          .eq("is_friendly", false)
          .order("played_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] });

    const [{ data: activeLeague }, officialMatchResult, { data: standings }, { data: recentMatches }] = await Promise.all([
      activeLeaguePromise,
      // Uma competição secundária incompleta não pode tirar o treinador do
      // painel. O contexto da próxima partida é um complemento; o restante do
      // clube continua utilizável enquanto a competição é recuperada.
      getNextOfficialMatchForTrainer(supabase, trainer)
        .then((match) => ({ match, error: null }))
        .catch((error) => ({ match: null, error })),
      standingsPromise,
      recentMatchesPromise,
    ]);
    if (officialMatchResult.error) {
      console.error("[dashboard] Falha ao localizar a próxima partida oficial", officialMatchResult.error);
    }
    const officialMatch = officialMatchResult.match;
    if (officialMatch) {
      nextMatch = {
        competition: officialMatch.competition,
        competitionLabel: officialMatch.competitionLabel,
        phaseLabel: officialMatch.phaseLabel,
        sourcePath: officialMatch.sourcePath,
        id: officialMatch.matchId,
        round: officialMatch.round,
        played_at: null,
        home_team: officialMatch.homeTeam,
        away_team: officialMatch.awayTeam,
        home_starter_key: officialMatch.homeStarterKey,
        away_starter_key: officialMatch.awayStarterKey,
        home_element: officialMatch.homeElement,
        away_element: officialMatch.awayElement,
        is_home: officialMatch.isHome,
      };
    }

    let confidenceStandings: any[] = standings ?? [];
    if (playerTeam && playerTeam.competition_id) {
      if (standings && standings.length) {
        const idx = standings.findIndex((s: any) => s.team_id === playerTeam.id);
        if (idx >= 0) {
          const s = standings[idx];
          standing = {
            points: s.points,
            wins: s.wins,
            draws: s.draws,
            losses: s.losses,
            goals_for: s.goals_for,
            goals_against: s.goals_against,
            position: idx + 1,
            total: standings.length,
          };
        }
      }

    }

    const confidence = buildConfidence(trainer, confidenceStandings, recentMatches ?? []);
    const division = ((playerTeam?.division ?? "bronze") as Division);
    const operatingCostPerMatch = Math.round(
      list.reduce((sum: number, c: any) => sum + Math.round(divisionalMatchSalary(c.overall ?? 40, division) * (c.salary_mult ?? 1)), 0) +
      totalMaintenancePerMatch(division, buildings ?? []),
    );
    const academyState = Array.isArray(trainer.academies) ? trainer.academies[0] : trainer.academies;
    const minimumOperatingReserve = operatingCostPerMatch * 5;
    const cash = Number(academyState?.money ?? 0);

    const { levelProgress } = await import("./trainer-xp.server");
    const prog = levelProgress(trainer.xp ?? 0);

    // Consome pending_level_ups para exibir animação uma única vez.
    const pendingLevelUps = trainer.pending_level_ups ?? 0;
    if (pendingLevelUps > 0) {
      await supabase.from("trainers").update({ pending_level_ups: 0 }).eq("id", trainer.id);
    }

    return {
      trainer: {
        id: trainer.id,
        trainer_name: trainer.trainer_name,
        academy_name: trainer.academy_name,
        level: prog.level,
        xp: trainer.xp ?? 0,
        xpIntoLevel: prog.intoLevel,
        xpForNextLevel: prog.levelNeed,
        xpTotalForNext: prog.totalForNext,
        isMaxLevel: prog.isMax,
        pendingLevelUps,
        seasonXpBreakdown: (trainer.season_xp_breakdown as Record<string, number>) ?? {},
      },
      academy: trainer.academies ?? null,
      roster: { count: rosterCount, avgEnergy, avgOverall, top: topCreatures },
      standing,
      nextMatch,
      hasLeague: !!activeLeague,
      rosterList: list,
      lineupData: { lineup: lineup ?? { starters: [] } },
      confidence,
      financialHealth: {
        division,
        operatingCostPerMatch,
        minimumOperatingReserve,
        coveredMatches: operatingCostPerMatch > 0 ? Math.floor(cash / operatingCostPerMatch) : 99,
        status: cash < minimumOperatingReserve ? "risk" : cash < minimumOperatingReserve * 2 ? "attention" : "healthy",
      },
    };
}

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => loadDashboard(context.supabase, context.userId));

const dashboardSessionSchema = z.object({
  access_token: z.string().min(20),
});

// Canal usado pelo site hospedado. O JWT segue no corpo da chamada e é
// validado diretamente no Supabase, sem depender dos cabeçalhos/cookies que o
// proxy do Lovable pode alterar.
export const getDashboardWithSession = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => dashboardSessionSchema.parse(raw))
  .handler(async ({ data }) => {
    const { supabase, userId } = await createOnboardingSupabase(data.access_token);
    return loadDashboard(supabase, userId);
  });

async function loadRosterPage(supabase: any, userId: string) {
  const { data: trainer, error: trainerError } = await supabase
    .from("trainers")
    .select("id, current_team_id, trainer_name, academy_name, xp, academies(id)")
    .eq("user_id", userId)
    .maybeSingle();
  if (trainerError) throw trainerError;
  if (!trainer) return null;

  const [playerTeam, { data: creatures, error: creaturesError }] = await Promise.all([
    resolvePlayerCareerTeam(supabase, trainer),
    supabase
      .from("creatures")
      .select("*")
      .eq("owner_trainer_id", trainer.id)
      .order("overall", { ascending: false }),
  ]);
  if (creaturesError) throw creaturesError;

  let rosterList = creatures ?? [];
  const repaired = await ensureStarterRoster(supabase, trainer.id, playerTeam, rosterList);
  if (repaired) {
    const { data: refreshed, error: refreshError } = await supabase
      .from("creatures")
      .select("*")
      .eq("owner_trainer_id", trainer.id)
      .order("overall", { ascending: false });
    if (refreshError) throw refreshError;
    rosterList = refreshed ?? [];
  }

  const { levelProgress } = await import("./trainer-xp.server");
  const progress = levelProgress(trainer.xp ?? 0);
  return {
    trainer: {
      id: trainer.id,
      trainer_name: trainer.trainer_name,
      academy_name: trainer.academy_name,
      level: progress.level,
      xp: trainer.xp ?? 0,
      xpIntoLevel: progress.intoLevel,
      xpForNextLevel: progress.levelNeed,
      xpTotalForNext: progress.totalForNext,
      isMaxLevel: progress.isMax,
    },
    academy: trainer.academies ?? null,
    rosterList,
  };
}

// O Elenco não precisa carregar partidas, classificação, construções e finanças
// do Dashboard. Esta leitura dedicada reduz payload e consultas sem mudar a UI.
export const getRosterPageWithSession = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => dashboardSessionSchema.parse(raw))
  .handler(async ({ data }) => {
    const { supabase, userId } = await createOnboardingSupabase(data.access_token);
    return loadRosterPage(supabase, userId);
  });

const createSchema = z.object({
  trainer_name: z.string().trim().min(2).max(40),
  academy_name: z.string().trim().min(2).max(40),
  access_token: z.string().min(20),
});

async function createOnboardingSupabase(accessToken: string) {
  return getDirectSession(accessToken);
}

const repairCareerSchema = z.object({ access_token: z.string().min(20) });

// Ponto único de recuperação usado logo após o login. Ele dá uma garantia
// concreta para qualquer tela: se o clube já foi escolhido, toda a carreira
// (academia, recursos, elenco, escalação, temporada e construções) está ativa.
export const repairCurrentCareerWithSession = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => repairCareerSchema.parse(raw))
  .handler(async ({ data }) => {
    const { supabase, userId } = await createOnboardingSupabase(data.access_token);
    const { data: trainer, error } = await supabase
      .from("trainers")
      .select("id, current_team_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!trainer) return { state: "needs_trainer" as const, rosterCount: 0 };

    const team = await resolvePlayerCareerTeam(supabase, trainer);
    if (!team) return { state: "needs_team" as const, rosterCount: 0 };
    await ensureStarterRoster(supabase, trainer.id, team);

    const { count, error: countError } = await supabase
      .from("creatures")
      .select("id", { count: "exact", head: true })
      .eq("owner_trainer_id", trainer.id);
    if (countError) throw countError;
    if ((count ?? 0) < 26) throw new Error("Não foi possível concluir o elenco inicial. Tente entrar novamente.");

    // Corrige apenas a etiqueta exibida para contas criadas durante uma
    // confirmação interrompida: o clube ativo é sempre a fonte de verdade.
    // Não move jogadores, partidas, dinheiro ou qualquer progresso.
    await supabase
      .from("trainers")
      .update({ academy_name: team.name })
      .eq("id", trainer.id)
      .neq("academy_name", team.name);

    // Uma carreira que já possui clube ativo e elenco completo não deve passar
    // novamente pelo ritual de ativação. Carreiras criadas antes da migração
    // atômica podem não possuir marcadores novos (como world_state.seeded), mas
    // continuam perfeitamente válidas. Reexecutar a ativação nesse caso fazia
    // o login ser bloqueado mesmo com todo o progresso do jogador preservado.
    if (trainer.current_team_id === team.id) {
      return { state: "ready" as const, rosterCount: count ?? 0 };
    }

    await activateCareer(supabase, trainer.id, team);
    return { state: "ready" as const, rosterCount: count ?? 0 };
  });

export const createInitialTrainer = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => createSchema.parse(raw))
  .handler(async ({ data }) => {
    const { supabase, userId } = await createOnboardingSupabase(data.access_token);

    const [, { data: existing }] = await Promise.all([
      supabase.from("profiles").upsert({ id: userId }),
      supabase
        .from("trainers")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    if (existing) {
      return { trainerId: existing.id };
    }

    // 1. Trainer
    const { data: trainer, error: tErr } = await supabase
      .from("trainers")
      .insert({
        user_id: userId,
        trainer_name: data.trainer_name,
        academy_name: data.academy_name,
      })
      .select()
      .single();
    if (tErr) throw tErr;

    // Nenhum recurso nasce parcialmente aqui. A ativação transacional ocorre
    // somente quando o treinador confirma um dos seis clubes iniciais.
    return { trainerId: trainer.id };
  });

// ---------- Times iniciais ----------

export const listStarterTeams = createServerFn({ method: "GET" })
  .handler(async () => {
    // A vitrine inicial não depende do usuário nem muda entre acessos. Mantê-la
    // fora do Supabase evita bloquear o onboarding enquanto a sessão é renovada
    // ou o catálogo de espécies está em cold start. O elenco real continua sendo
    // gerado e validado no servidor quando o usuário confirma a escolha.
    const summaries: Record<StarterKey, { totalStars: number; avgAttack: number; avgDefense: number }> = {
      titas_pedra: { totalStars: 25, avgAttack: 20, avgDefense: 25 },
      furacoes_vento: { totalStars: 25, avgAttack: 25, avgDefense: 20 },
      chamas_rubras: { totalStars: 25, avgAttack: 25, avgDefense: 20 },
      mares_profundas: { totalStars: 25, avgAttack: 23, avgDefense: 23 },
      laminas_gelo: { totalStars: 25, avgAttack: 20, avgDefense: 25 },
      guardioes_mistos: { totalStars: 25, avgAttack: 23, avgDefense: 23 },
    };
    return STARTER_TEAMS.map((t) => ({
      key: t.key,
      name: t.name,
      emblem: t.emblem,
      color: t.color,
      colorClass: t.colorClass,
      dominant: t.dominant,
      style: t.style,
      description: t.description,
      ...summaries[t.key],
    }));
  });

const starterKeySchema = z.object({
  key: z.enum([
    "titas_pedra",
    "furacoes_vento",
    "chamas_rubras",
    "mares_profundas",
    "laminas_gelo",
    "guardioes_mistos",
  ]),
});

const starterChoiceSchema = starterKeySchema.extend({
  access_token: z.string().min(20),
});

export const getStarterTeamDetail = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => starterKeySchema.parse(raw))
  .handler(async ({ data }) => {
    const team = getStarterTeam(data.key)!;
    const roster = generateStarterRosterPreview(data.key as StarterKey);
    return {
      team: {
        key: team.key,
        name: team.name,
        emblem: team.emblem,
        color: team.color,
        colorClass: team.colorClass,
        dominant: team.dominant,
        style: team.style,
        description: team.description,
      },
      roster: roster.map((c) => ({
        name: c.name,
        species: c.species,
        epithet: c.epithet,
        element: c.element,
        position: c.position,
        stars: overallToStars(c.overall),
        overall: c.overall,
        is_goalkeeper: c.is_goalkeeper,
        power_name: c.power_name,
      })),
    };
  });

export const chooseStarterTeam = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => starterChoiceSchema.parse(raw))
  .handler(async ({ data }) => {
    const { supabase, userId } = await createOnboardingSupabase(data.access_token);
    const { data: trainer } = await supabase
      .from("trainers")
      .select("id, academy_name, current_team_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!trainer) throw new Error("Crie o treinador antes de escolher o time.");

    // Uma criação pode ter sido interrompida depois que o mundo foi montado e
    // antes do elenco ser gravado. Retomamos a carreira existente e completamos
    // apenas os 26 jogadores ausentes, sem recriar campeonato, partidas ou saldo.
    const existingCareerTeam = await resolvePlayerCareerTeam(supabase, trainer);
    if (existingCareerTeam?.competition_id) {
      await ensureStarterRoster(supabase, trainer.id, existingCareerTeam);
      const { count: restoredCount, error: restoredCountError } = await supabase
        .from("creatures")
        .select("id", { count: "exact", head: true })
        .eq("owner_trainer_id", trainer.id);
      if (restoredCountError) throw restoredCountError;
      if ((restoredCount ?? 0) < 26) {
        throw new Error("Estamos concluindo seu elenco. Tente novamente em alguns instantes.");
      }
      await activateCareer(supabase, trainer.id, existingCareerTeam);
      await supabase.from("trainers").update({ academy_name: existingCareerTeam.name }).eq("id", trainer.id);
      return {
        trainerId: trainer.id,
        competitionId: existingCareerTeam.competition_id,
        teamKey: existingCareerTeam.starter_key ?? "",
        teamName: existingCareerTeam.name,
        resumed: true,
      };
    }

    // Retomada idempotente: uma tentativa anterior pode ter concluído a
    // criação do clube e perdido apenas a resposta ao navegador. Nesse caso,
    // devolvemos a carreira existente em vez de bloquear o jogador.
    const { count: creatureCount } = await supabase
      .from("creatures")
      .select("id", { count: "exact", head: true })
      .eq("owner_trainer_id", trainer.id);
    if ((creatureCount ?? 0) > 0) {
      let existingTeamId = trainer.current_team_id ?? null;
      let existingCompetitionId: string | null = null;

      if (existingTeamId) {
        const { data: linkedTeam } = await supabase
          .from("teams")
          .select("id, competition_id")
          .eq("id", existingTeamId)
          .maybeSingle();
        existingCompetitionId = linkedTeam?.competition_id ?? null;
      }

      if (!existingTeamId || !existingCompetitionId) {
        const { data: playerTeam } = await supabase
          .from("teams")
          .select("id, name, competition_id, starter_key, division")
          .eq("trainer_id", trainer.id)
          .eq("is_player", true)
          .maybeSingle();
        existingTeamId = playerTeam?.id ?? existingTeamId;
        existingCompetitionId = playerTeam?.competition_id ?? existingCompetitionId;
      }

      if (existingTeamId && existingCompetitionId) {
        const { data: resumableTeam, error: resumableTeamError } = await supabase
          .from("teams")
          .select("id, name, competition_id, starter_key, division")
          .eq("id", existingTeamId)
          .single();
        if (resumableTeamError) throw resumableTeamError;
        await ensureStarterRoster(supabase, trainer.id, resumableTeam);
        await activateCareer(supabase, trainer.id, resumableTeam);
        await supabase.from("trainers").update({ academy_name: resumableTeam.name }).eq("id", trainer.id);
        return {
          trainerId: trainer.id,
          competitionId: existingCompetitionId,
          teamKey: resumableTeam.starter_key ?? "",
          teamName: resumableTeam.name,
          resumed: true,
        };
      }

      // As 26 criaturas podem ter sido gravadas antes de uma queda no meio do
      // primeiro seed. Não há clube jogador, calendário ou progresso para
      // preservar: reaproveitamos o elenco e terminamos a carreira aqui.
      const { data: partialComps, error: partialCompsError } = await supabase
        .from("competitions")
        .select("id")
        .eq("trainer_id", trainer.id)
        .eq("type", "league")
        .eq("status", "active");
      if (partialCompsError) throw partialCompsError;
      const partialIds = (partialComps ?? []).map((competition: any) => competition.id);
      if (partialIds.length) {
        const [{ count: partialTeams }, { count: partialStandings }, { count: partialMatches }] = await Promise.all([
          supabase.from("teams").select("id", { count: "exact", head: true }).in("competition_id", partialIds),
          supabase.from("standings").select("team_id", { count: "exact", head: true }).in("competition_id", partialIds),
          supabase.from("matches").select("id", { count: "exact", head: true }).in("competition_id", partialIds),
        ]);
        if ((partialTeams ?? 0) || (partialStandings ?? 0) || (partialMatches ?? 0)) {
          throw new Error("Encontramos uma criação incompleta com partidas ou classificação. Entre em contato para recuperar esta conta sem perder dados.");
        }
        const { error: removePartialError } = await supabase
          .from("competitions")
          .delete()
          .in("id", partialIds);
        if (removePartialError) throw removePartialError;
      }

      const { data: currentSeason } = await supabase
        .from("game_seasons")
        .select("id")
        .eq("trainer_id", trainer.id)
        .eq("is_current", true)
        .maybeSingle();
      let recoverySeasonId = currentSeason?.id;
      if (!recoverySeasonId) {
        const { data: createdSeason, error: createdSeasonError } = await supabase
          .from("game_seasons")
          .insert({ trainer_id: trainer.id, season_number: 1, is_current: true })
          .select("id")
          .single();
        if (createdSeasonError) throw createdSeasonError;
        recoverySeasonId = createdSeason.id;
      }

      const { seedWorldForTrainer } = await import("./world/seed.server");
      const { competitionsByDiv, playerTeamId } = await seedWorldForTrainer({
        supabase,
        trainerId: trainer.id,
        seasonId: recoverySeasonId,
        playerStarterKey: data.key,
        playerRoster: [],
      });
      const { error: linkRecoveredRosterError } = await supabase
        .from("creatures")
        .update({ owner_team_id: playerTeamId })
        .eq("owner_trainer_id", trainer.id)
        .is("owner_team_id", null);
      if (linkRecoveredRosterError) throw linkRecoveredRosterError;

      const { data: recoveredTeam, error: recoveredTeamError } = await supabase
        .from("teams")
        .select("id, name, competition_id, starter_key")
        .eq("id", playerTeamId)
        .eq("trainer_id", trainer.id)
        .eq("is_player", true)
        .single();
      if (recoveredTeamError) throw recoveredTeamError;
      if (recoveredTeam.starter_key !== data.key) throw new Error("Não foi possível confirmar o time escolhido. Tente novamente.");
      await activateCareer(supabase, trainer.id, recoveredTeam);
      await supabase.from("trainers").update({ academy_name: recoveredTeam.name }).eq("id", trainer.id);
      return {
        trainerId: trainer.id,
        competitionId: recoveredTeam.competition_id ?? competitionsByDiv.bronze,
        teamKey: recoveredTeam.starter_key,
        teamName: recoveredTeam.name,
        resumed: true,
      };
    }

    // 1. Elenco do jogador (26 criaturas, via Bestiário)
    const { loadBestiary } = await import("./bestiary.server");
    const bestiary = await loadBestiary(supabase);
    const roster = generateStarterRoster(data.key as StarterKey, bestiary);
    const creatureRows = rosterToDbRows(trainer.id, roster);
    // Insere criaturas sem owner_team_id ainda (será atualizado depois)
    const { data: createdCreatures, error: cErr } = await supabase
      .from("creatures")
      .insert(creatureRows as any)
      .select("id");
    if (cErr) throw cErr;

    // 2. Temporada corrente
    let seasonId: string;
    const { data: existingSeason } = await supabase
      .from("game_seasons")
      .select("id")
      .eq("trainer_id", trainer.id)
      .eq("is_current", true)
      .maybeSingle();
    if (existingSeason) {
      seasonId = existingSeason.id;
    } else {
      const { data: s, error: sErr } = await supabase
        .from("game_seasons")
        .insert({ trainer_id: trainer.id, season_number: 1, is_current: true })
        .select("id")
        .single();
      if (sErr) throw sErr;
      seasonId = s.id;
    }

    // 3. Popular o MUNDO (70 times, 5 divisões, 1820 criaturas, 5 calendários)
    const { seedWorldForTrainer } = await import("./world/seed.server");
    // Buscamos os rows para passar ao seeder (com IDs para vincular ao time do jogador)
    const playerCreatureFullRows = creatureRows.map((r, i) => ({
      ...r,
      // id não vai ser reutilizado — o seeder ignora, mas mantém o shape
    }));
    // O seeder recebe o elenco do jogador só para "reservar" o slot e vincular owner_team_id.
    // Como as criaturas já existem, vamos ATUALIZAR seu owner_team_id ao invés de inserir de novo.
    const { competitionsByDiv, playerTeamId } = await seedWorldForTrainer({
      supabase,
      trainerId: trainer.id,
      seasonId,
      playerStarterKey: data.key,
      // passa lista vazia: o seeder cria os slots dos outros 69 times e nós vinculamos as criaturas do jogador manualmente logo abaixo
      playerRoster: [],
    });

    // Vincula as criaturas do jogador ao seu time recém-criado
    if (createdCreatures && createdCreatures.length) {
      const ids = createdCreatures.map((c: any) => c.id);
      const { error: linkErr } = await supabase
        .from("creatures")
        .update({ owner_team_id: playerTeamId })
        .in("id", ids);
      if (linkErr) throw linkErr;
    }

    // Trava de ativação: o cliente não recebe uma carreira utilizável antes de
    // o servidor confirmar os 26 jogadores e o vínculo com o clube.
    const { count: readyRosterCount, error: readyRosterError } = await supabase
      .from("creatures")
      .select("id", { count: "exact", head: true })
      .eq("owner_trainer_id", trainer.id)
      .eq("owner_team_id", playerTeamId);
    if (readyRosterError) throw readyRosterError;
    if ((readyRosterCount ?? 0) !== 26) {
      throw new Error("A criação do elenco não foi concluída. Tente novamente para finalizar seu clube.");
    }

    // O catálogo é a intenção enviada pelo cliente; o registro recém-criado é
    // a fonte de verdade. Nunca ativamos a carreira com o nome da prévia caso
    // uma tentativa anterior, cache ou falha de rede tenha apontado para outro
    // slot do mundo.
    const { data: selectedTeam, error: selectedTeamError } = await supabase
      .from("teams")
      .select("id, name, competition_id, starter_key")
      .eq("id", playerTeamId)
      .eq("trainer_id", trainer.id)
      .eq("is_player", true)
      .single();
    if (selectedTeamError) throw selectedTeamError;
    if (selectedTeam.starter_key !== data.key) {
      throw new Error("Não foi possível confirmar o time escolhido. Volte e escolha o clube novamente.");
    }

    // Ultimo passo e uma unica transacao no banco. Clube, recursos,
    // construcoes, escalacao e carreira so ficam ativos juntos.
    await activateCareer(supabase, trainer.id, {
      id: selectedTeam.id,
      name: selectedTeam.name,
      competition_id: selectedTeam.competition_id,
    });
    await supabase.from("trainers").update({ academy_name: selectedTeam.name }).eq("id", trainer.id);

    return {
      trainerId: trainer.id,
      competitionId: selectedTeam.competition_id ?? competitionsByDiv.bronze,
      teamKey: selectedTeam.starter_key,
      teamName: selectedTeam.name,
    };
  });



// ---------- roster ----------

export const listMyCreatures = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: trainer } = await supabase
      .from("trainers")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!trainer) return [];
    const [{ sweepMoraleSessions }, { sweepAttributeTrainings }] = await Promise.all([
      import("./morale-training.functions"),
      import("./training.functions"),
    ]);
    await Promise.all([
      sweepMoraleSessions(supabase, trainer.id),
      sweepAttributeTrainings(supabase, trainer.id),
    ]);
    const { data, error } = await supabase
      .from("creatures")
      .select(
        "id, name, species, epithet, element, suggested_position, is_goalkeeper, power_key, overall, energy, morale, xp, xp_spent_training, career_baseline_xp, pending_half_stars, half_stars_earned, market_value, age, salary_mult, injury_matches_remaining, injury_severity, is_prodigy, morale_session_completes_at, attr_training_key, attr_training_completes_at, attr_atacar, attr_defender, attr_forca, attr_pique, attr_tecnica, attr_passar, attr_concentracao, attr_elasticidade, attr_maos",
      )
      .eq("owner_trainer_id", trainer.id)
      .order("overall", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const getCreature = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: trainer } = await supabase
      .from("trainers")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!trainer) throw new Error("Treinador não encontrado.");
    const [{ sweepMoraleSessions }, { sweepAttributeTrainings }] = await Promise.all([
      import("./morale-training.functions"),
      import("./training.functions"),
    ]);
    await Promise.all([
      sweepMoraleSessions(supabase, trainer.id),
      sweepAttributeTrainings(supabase, trainer.id),
    ]);
    const { data: creature, error } = await supabase
      .from("creatures")
      .select("*")
      .eq("id", data.id)
      .eq("owner_trainer_id", trainer.id)
      .maybeSingle();
    if (error) throw error;
    if (!creature) throw new Error("Criatura não encontrada.");
    return creature;
  });

// Cura acelerada com gemas (§Lesões): 40 gemas por partida restante.
export const HEAL_GEMS_PER_MATCH = 40;

async function chargeHeal(
  supabase: any,
  userId: string,
  creatureId: string,
  mode: "one" | "all",
) {
  void userId;
  const { data, error } = await supabase.rpc("heal_creature_with_gems_atomic", {
    p_creature: creatureId, p_mode: mode,
    p_idempotency_key: `heal:${creatureId}:${mode}:${crypto.randomUUID()}`,
  });
  if (error) throw error;
  return { ok: true, ...data };
}

export const healCreatureWithGems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) =>
    chargeHeal(context.supabase, context.userId, data.id, "all"),
  );

export const reduceInjuryWithGems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) =>
    chargeHeal(context.supabase, context.userId, data.id, "one"),
  );
