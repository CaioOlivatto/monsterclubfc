import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  STARTER_TEAMS,
  generateStarterRoster,
  getStarterTeam,
  rosterToDbRows,
  type StarterKey,
} from "./starter-teams";
import { overallToStars } from "./bestiary";
import { generateSchedule } from "./league.server";
import { getNextOfficialMatchForTrainer } from "./official-match.server";
import { buildConfidence } from "./career.functions";
import { divisionalMatchSalary, totalMaintenancePerMatch, type Division } from "./economy";


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


export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: trainer } = await supabase
      .from("trainers")
      .select("*, academies(*)")
      .eq("user_id", userId)
      .maybeSingle();

    if (!trainer) return null;

    // O Dashboard também alimenta alertas, aposentadoria e titulares cansados.
    // Carregamos o elenco completo uma vez e reutilizamos o resultado para todos
    // esses blocos, em vez de disparar três server functions adicionais.
    const rosterPromise = supabase
      .from("creatures")
      .select(
        "id, name, species, epithet, element, suggested_position, is_goalkeeper, power_key, overall, energy, morale, xp, half_stars_earned, market_value, age, salary_mult, injury_matches_remaining, injury_severity, is_prodigy, morale_session_completes_at, attr_training_key, attr_training_completes_at",
      )
      .eq("owner_trainer_id", trainer.id)
      .order("overall", { ascending: false });
    const lineupPromise = supabase
      .from("team_lineups")
      .select("formation, strategy, starters, bench, default_tactics")
      .eq("trainer_id", trainer.id)
      .maybeSingle();
    const buildingsPromise = supabase
      .from("buildings")
      .select("building_type, level")
      .eq("trainer_id", trainer.id);

    const [{ data: creatures, error: creaturesError }, { data: lineup }, { data: buildings }] = await Promise.all([
      rosterPromise,
      lineupPromise,
      buildingsPromise,
    ]);
    if (creaturesError) throw creaturesError;

    const list = creatures ?? [];
    const rosterCount = list.length;
    const avgEnergy = list.length
      ? Math.round(list.reduce((s, c) => s + (c.energy ?? 0), 0) / list.length)
      : 0;
    const avgOverall = list.length
      ? Math.round(list.reduce((s, c) => s + (c.overall ?? 0), 0) / list.length)
      : 0;
    const topCreatures = [...list]
      .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0))
      .slice(0, 3);

    // Liga ativa do jogador: a fonte canônica do clube atual é trainers.current_team_id.
    // Existem times antigos do jogador com is_player=true e competition_id null; eles não
    // podem decidir o estado do dashboard.
    let playerTeam: null | { id: string; name: string; competition_id: string | null; division: string | null } = null;
    if (trainer.current_team_id) {
      const { data: currentTeam } = await supabase
        .from("teams")
        .select("id, name, competition_id, division")
        .eq("id", trainer.current_team_id)
        .eq("trainer_id", trainer.id)
        .maybeSingle();
      playerTeam = currentTeam ?? null;
    }

    if (!playerTeam) {
      const { data: fallbackTeam } = await supabase
        .from("teams")
        .select("id, name, competition_id, division")
        .eq("trainer_id", trainer.id)
        .eq("is_player", true)
        .not("competition_id", "is", null)
        .limit(1)
        .maybeSingle();
      playerTeam = fallbackTeam ?? null;
    }

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

    const [{ data: activeLeague }, officialMatch] = await Promise.all([
      activeLeaguePromise,
      getNextOfficialMatchForTrainer(supabase, trainer),
    ]);
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

    let confidenceStandings: any[] = [];
    if (playerTeam && playerTeam.competition_id) {
      const { data: standings } = await supabase
        .from("standings")
        .select("team_id, points, wins, draws, losses, goals_for, goals_against")
        .eq("competition_id", playerTeam.competition_id)
        .order("points", { ascending: false });

      confidenceStandings = standings ?? [];
      if (standings && standings.length) {
        const idx = standings.findIndex((s) => s.team_id === playerTeam.id);
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

    const { data: recentMatches } = trainer.current_team_id
      ? await supabase
          .from("matches")
          .select("home_team_id, away_team_id, home_score, away_score")
          .or(`home_team_id.eq.${trainer.current_team_id},away_team_id.eq.${trainer.current_team_id}`)
          .eq("status", "finished")
          .eq("is_friendly", false)
          .order("played_at", { ascending: false })
          .limit(5)
      : { data: [] };
    const confidence = buildConfidence(trainer, confidenceStandings, recentMatches ?? []);
    const division = ((playerTeam?.division ?? "bronze") as Division);
    const operatingCostPerMatch = Math.round(
      list.reduce((sum, c: any) => sum + Math.round(divisionalMatchSalary(c.overall ?? 40, division) * (c.salary_mult ?? 1)), 0) +
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
      lineupData: { lineup: lineup ?? { starters: [] }, creatures: list },
      confidence,
      financialHealth: {
        division,
        operatingCostPerMatch,
        minimumOperatingReserve,
        coveredMatches: operatingCostPerMatch > 0 ? Math.floor(cash / operatingCostPerMatch) : 99,
        status: cash < minimumOperatingReserve ? "risk" : cash < minimumOperatingReserve * 2 ? "attention" : "healthy",
      },
    };
  });

const createSchema = z.object({
  trainer_name: z.string().trim().min(2).max(40),
  academy_name: z.string().trim().min(2).max(40),
});

export const createInitialTrainer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => createSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const [, { data: existing }] = await Promise.all([
      supabase.from("profiles").upsert({ id: userId }),
      supabase
        .from("trainers")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    if (existing) {
      throw new Error("Você já tem um treinador criado.");
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

    const setupResults = await Promise.all([
      supabase.from("academies").insert({
        trainer_id: trainer.id,
        money: 400000,
        gems: 50,
        builders: 1,
        roster_slots: 26,
      }),
      supabase.from("buildings").insert([
        { trainer_id: trainer.id, building_type: "estadio", level: 1, team_id: null as any },
        { trainer_id: trainer.id, building_type: "ct_treino", level: 1, team_id: null as any },
        { trainer_id: trainer.id, building_type: "centro_medico", level: 1, team_id: null as any },
      ]),
      supabase.from("items").insert([
        { trainer_id: trainer.id, item_key: "potion_individual", quantity: 3 },
        { trainer_id: trainer.id, item_key: "potion_collective", quantity: 1 },
      ]),
    ]);
    const setupError = setupResults.find((result) => result.error)?.error;
    if (setupError) throw setupError;

    // Elenco será criado quando o treinador escolher um dos 6 times iniciais.
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

export const getStarterTeamDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => starterKeySchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { loadBestiary } = await import("./bestiary.server");
    const bestiary = await loadBestiary(context.supabase);
    const team = getStarterTeam(data.key)!;
    const roster = generateStarterRoster(data.key as StarterKey, bestiary);
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
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => starterKeySchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const teamDef = getStarterTeam(data.key)!;

    const { data: trainer } = await supabase
      .from("trainers")
      .select("id, academy_name")
      .eq("user_id", userId)
      .maybeSingle();
    if (!trainer) throw new Error("Crie o treinador antes de escolher o time.");

    // Não permite escolher duas vezes
    const { count: creatureCount } = await supabase
      .from("creatures")
      .select("id", { count: "exact", head: true })
      .eq("owner_trainer_id", trainer.id);
    if ((creatureCount ?? 0) > 0) {
      throw new Error("Você já escolheu um time inicial.");
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

    // As construções pertencem ao clube escolhido. O treinador administra os
    // prédios enquanto estiver no comando, mas eles ficam no clube se ele sair.
    const { error: buildingLinkErr } = await supabase
      .from("buildings")
      .update({ team_id: playerTeamId })
      .eq("trainer_id", trainer.id)
      .is("team_id", null);
    if (buildingLinkErr) throw buildingLinkErr;

    // Fonte canônica usada por carreira, partidas, confiança e construções.
    // O time já era marcado como pertencente ao treinador pelo seeder, mas o
    // vínculo direto no treinador também precisa existir desde o onboarding.
    const { error: trainerTeamErr } = await supabase
      .from("trainers")
      .update({ current_team_id: playerTeamId, status: "employed" })
      .eq("id", trainer.id);
    if (trainerTeamErr) throw trainerTeamErr;

    const { error: careerStartErr } = await supabase.from("trainer_career").insert({
      trainer_id: trainer.id,
      team_id: playerTeamId,
      team_name: teamDef.name,
      division: "bronze",
      season_start: 1,
      event: "arrived",
    });
    if (careerStartErr) throw careerStartErr;

    return {
      trainerId: trainer.id,
      competitionId: competitionsByDiv.bronze,
      teamKey: data.key,
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
  const { data: trainer } = await supabase
    .from("trainers").select("id").eq("user_id", userId).maybeSingle();
  if (!trainer) throw new Error("Treinador não encontrado.");
  const { data: c } = await supabase
    .from("creatures")
    .select("id, name, injury_matches_remaining, injury_severity")
    .eq("id", creatureId).eq("owner_trainer_id", trainer.id).maybeSingle();
  if (!c) throw new Error("Criatura não encontrada.");
  const remaining = c.injury_matches_remaining ?? 0;
  if (remaining <= 0) throw new Error(`${c.name} não está lesionada.`);
  const matchesToHeal = mode === "all" ? remaining : 1;
  const cost = matchesToHeal * HEAL_GEMS_PER_MATCH;
  const { data: academy } = await supabase
    .from("academies").select("id, gems").eq("trainer_id", trainer.id).maybeSingle();
  if (!academy) throw new Error("Academia não encontrada.");
  if ((academy.gems ?? 0) < cost) throw new Error(`Gemas insuficientes (precisa ${cost} 💎).`);
  await supabase.from("academies").update({ gems: academy.gems - cost }).eq("id", academy.id);
  const newRemaining = Math.max(0, remaining - matchesToHeal);
  await supabase
    .from("creatures")
    .update({
      injury_matches_remaining: newRemaining,
      injury_severity: newRemaining === 0 ? null : c.injury_severity,
    })
    .eq("id", c.id);
  return { ok: true, spent: cost, remaining: newRemaining };
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
