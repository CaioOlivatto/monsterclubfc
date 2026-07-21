import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  STARTER_TEAMS,
  generateStarterRoster,
  getStarterTeam,
  starterTeamSummary,
  type StarterKey,
} from "./starter-teams";
import { generateSchedule, pickCpuTeamNames } from "./league.server";


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

    const { data: creatures } = await supabase
      .from("creatures")
      .select("id, energy, overall, name, element, suggested_position")
      .eq("owner_trainer_id", trainer.id);

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

    // Time do jogador apenas na liga ativa. Times de amistoso/copa não devem afetar o painel.
    const { data: activeLeague } = await supabase
      .from("competitions")
      .select("id")
      .eq("trainer_id", trainer.id)
      .eq("type", "league")
      .eq("status", "active")
      .maybeSingle();

    const { data: playerTeam } = activeLeague
      ? await supabase
          .from("teams")
          .select("id, name, competition_id")
          .eq("competition_id", activeLeague.id)
          .eq("trainer_id", trainer.id)
          .eq("is_player", true)
          .maybeSingle()
      : { data: null };

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
      id: string;
      round: number;
      played_at: string | null;
      home_team: string;
      away_team: string;
      is_home: boolean;
    };

    if (playerTeam && playerTeam.competition_id) {
      const { data: standings } = await supabase
        .from("standings")
        .select("team_id, points, wins, draws, losses, goals_for, goals_against")
        .eq("competition_id", playerTeam.competition_id)
        .order("points", { ascending: false });

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

      const { data: matches } = await supabase
        .from("matches")
        .select("id, round, played_at, status, home_team_id, away_team_id, home_team:teams!matches_home_team_id_fkey(name), away_team:teams!matches_away_team_id_fkey(name)")
        .eq("competition_id", playerTeam.competition_id)
        .eq("status", "scheduled")
        .or(`home_team_id.eq.${playerTeam.id},away_team_id.eq.${playerTeam.id}`)
        .order("round", { ascending: true })
        .limit(1);

      const m = matches?.[0] as
        | {
            id: string;
            round: number;
            played_at: string | null;
            home_team_id: string;
            away_team_id: string;
            home_team: { name: string } | null;
            away_team: { name: string } | null;
          }
        | undefined;
      if (m) {
        nextMatch = {
          id: m.id,
          round: m.round,
          played_at: m.played_at,
          home_team: m.home_team?.name ?? "?",
          away_team: m.away_team?.name ?? "?",
          is_home: m.home_team_id === playerTeam.id,
        };
      }
    }

    return {
      trainer: {
        id: trainer.id,
        trainer_name: trainer.trainer_name,
        academy_name: trainer.academy_name,
        level: trainer.level,
      },
      academy: trainer.academies ?? null,
      roster: { count: rosterCount, avgEnergy, avgOverall, top: topCreatures },
      standing,
      nextMatch,
      hasLeague: !!activeLeague,
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

    // Garante que existe perfil
    await supabase.from("profiles").upsert({ id: userId });

    // Bloqueia duplicidade
    const { data: existing } = await supabase
      .from("trainers")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
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

    // 2. Academy — $400k iniciais (será complementado ao escolher o time)
    const { error: aErr } = await supabase.from("academies").insert({
      trainer_id: trainer.id,
      money: 400000,
      gems: 50,
      builders: 1,
      roster_slots: 24,
    });
    if (aErr) throw aErr;

    // 3. Prédios iniciais (Estádio nv1, CT Treinamento nv1, Centro Médico nv1)
    //    CT Elemental começa não construído (§7).
    await supabase.from("buildings").insert([
      { trainer_id: trainer.id, building_type: "estadio",        level: 1 },
      { trainer_id: trainer.id, building_type: "ct_treino",      level: 1 },
      { trainer_id: trainer.id, building_type: "centro_medico",  level: 1 },
    ]);

    // 4. Itens iniciais (§7): 3 Poção Individual + 1 Poção Coletiva
    await supabase.from("items").insert([
      { trainer_id: trainer.id, item_key: "potion_individual", quantity: 3 },
      { trainer_id: trainer.id, item_key: "potion_collective", quantity: 1 },
    ]);

    // Elenco será criado quando o treinador escolher um dos 6 times iniciais.
    return { trainerId: trainer.id };
  });

// ---------- Times iniciais ----------

export const listStarterTeams = createServerFn({ method: "GET" }).handler(async () => {
  return STARTER_TEAMS.map((t) => ({
    key: t.key,
    name: t.name,
    emblem: t.emblem,
    color: t.color,
    colorClass: t.colorClass,
    dominant: t.dominant,
    style: t.style,
    description: t.description,
    ...starterTeamSummary(t.key),
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
  .inputValidator((raw: unknown) => starterKeySchema.parse(raw))
  .handler(async ({ data }) => {
    const team = getStarterTeam(data.key)!;
    const roster = generateStarterRoster(data.key as StarterKey);
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
        element: c.element,
        position: c.suggested_position,
        stars: c.stars,
        overall: c.overall,
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

    // 1. Insere as 22 criaturas do time escolhido
    const roster = generateStarterRoster(data.key as StarterKey);
    const creatureRows = roster.map((c) => ({
      owner_trainer_id: trainer.id,
      name: c.name,
      element: c.element,
      suggested_position: c.suggested_position,
      attack: c.attack,
      defense: c.defense,
      goalkeeper: c.goalkeeper,
      physical: c.physical,
      strength: c.strength,
      aff_fogo: c.aff_fogo,
      aff_agua: c.aff_agua,
      aff_terra: c.aff_terra,
      aff_ar: c.aff_ar,
      aff_gelo: c.aff_gelo,
      overall: c.overall,
      xp: c.xp,
      half_stars_earned: c.half_stars_earned,
      energy: c.energy,
      market_value: c.market_value,
    }));
    const { error: cErr } = await supabase.from("creatures").insert(creatureRows);
    if (cErr) throw cErr;

    // 2. Cria temporada + competição (5ª Divisão – Liga Bronze)
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

    // Evita liga duplicada
    const { data: existingComp } = await supabase
      .from("competitions")
      .select("id")
      .eq("trainer_id", trainer.id)
      .eq("type", "league")
      .eq("status", "active")
      .maybeSingle();
    if (existingComp) {
      return { trainerId: trainer.id, competitionId: existingComp.id, teamKey: data.key };
    }

    const { data: competition, error: compErr } = await supabase
      .from("competitions")
      .insert({
        trainer_id: trainer.id,
        season_id: seasonId,
        division: "bronze",
        type: "league",
        status: "active",
      })
      .select("id")
      .single();
    if (compErr) throw compErr;

    // 3. Time do jogador
    const playerAvg = Math.round(
      roster.reduce((s, c) => s + c.overall, 0) / roster.length,
    );
    const { data: playerTeam, error: ptErr } = await supabase
      .from("teams")
      .insert({
        competition_id: competition.id,
        trainer_id: trainer.id,
        is_player: true,
        name: teamDef.name,
        color: teamDef.color,
        emblem: teamDef.emblem,
        dominant_element: teamDef.dominant === "mesclado" ? null : teamDef.dominant,
        style: teamDef.style,
        starter_key: teamDef.key,
        cpu_strength: playerAvg,
      })
      .select("id")
      .single();
    if (ptErr) throw ptErr;

    // 4. Os outros 5 times fixos como adversários da divisão
    const rivals = STARTER_TEAMS.filter((t) => t.key !== data.key);
    const rivalRows = rivals.map((t) => {
      const sum = starterTeamSummary(t.key);
      // Força CPU aproximada pelo overall médio (avg atk+def sobre 2 é grosseiro; usa overall reconstruído)
      const avg = Math.round((sum.avgAttack + sum.avgDefense) / 2);
      return {
        competition_id: competition.id,
        trainer_id: null,
        is_player: false,
        name: t.name,
        color: t.color,
        emblem: t.emblem,
        dominant_element: t.dominant === "mesclado" ? null : t.dominant,
        style: t.style,
        starter_key: t.key,
        cpu_strength: Math.max(30, Math.min(80, avg)),
      };
    });

    // 5. Mais 2 CPUs genéricos pra fechar 8
    const extraNames = pickCpuTeamNames(2, Date.now() & 0xffffffff);
    const extraRows = extraNames.map((name) => ({
      competition_id: competition.id,
      trainer_id: null,
      is_player: false,
      name,
      cpu_strength: Math.max(30, Math.min(80, playerAvg + (Math.random() > 0.5 ? 3 : -3))),
    }));

    const { data: cpuTeams, error: ctErr } = await supabase
      .from("teams")
      .insert([...rivalRows, ...extraRows])
      .select("id");
    if (ctErr) throw ctErr;

    const teamIds = [playerTeam.id, ...cpuTeams.map((t: any) => t.id)] as string[];

    // 6. Standings
    const standingsRows = teamIds.map((tid) => ({
      competition_id: competition.id,
      team_id: tid,
      points: 0, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0,
    }));
    const { error: stErr } = await supabase.from("standings").insert(standingsRows);
    if (stErr) throw stErr;

    // 7. Calendário round-robin duplo (14 rodadas)
    const schedule = generateSchedule(8, true);
    const matchesRows: any[] = [];
    schedule.forEach((round, rIdx) => {
      round.forEach(([h, a]) => {
        matchesRows.push({
          competition_id: competition.id,
          round: rIdx + 1,
          home_team_id: teamIds[h],
          away_team_id: teamIds[a],
          status: "scheduled",
          is_friendly: false,
        });
      });
    });
    const { error: mErr } = await supabase.from("matches").insert(matchesRows);
    if (mErr) throw mErr;

    return { trainerId: trainer.id, competitionId: competition.id, teamKey: data.key };
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
    const { data, error } = await supabase
      .from("creatures")
      .select(
        "id, name, element, suggested_position, attack, defense, goalkeeper, physical, strength, overall, energy, xp, half_stars_earned, market_value",
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
