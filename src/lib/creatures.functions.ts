import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

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
    return data;
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

    // Time do jogador (se a liga já foi gerada)
    const { data: playerTeam } = await supabase
      .from("teams")
      .select("id, name, competition_id")
      .eq("trainer_id", trainer.id)
      .maybeSingle();

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

    if (playerTeam) {
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
      hasLeague: !!playerTeam,
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

    // 2. Academy
    const { error: aErr } = await supabase.from("academies").insert({
      trainer_id: trainer.id,
      money: 300000,
      gems: 50,
      builders: 1,
      roster_slots: 24,
    });
    if (aErr) throw aErr;

    // 3. Elenco inicial de 18 criaturas
    const creatures = Array.from({ length: 18 }, () => genCreature(trainer.id));
    const { error: cErr } = await supabase.from("creatures").insert(creatures);
    if (cErr) throw cErr;

    // 4. Prédios iniciais (Estádio nv1, CT Treinamento nv1, Centro Médico nv1)
    //    CT Elemental começa não construído (§7).
    await supabase.from("buildings").insert([
      { trainer_id: trainer.id, building_type: "estadio",        level: 1 },
      { trainer_id: trainer.id, building_type: "ct_treino",      level: 1 },
      { trainer_id: trainer.id, building_type: "centro_medico",  level: 1 },
    ]);

    // 5. Itens iniciais (§7): 3 Poção Individual + 1 Poção Coletiva
    await supabase.from("items").insert([
      { trainer_id: trainer.id, item_key: "potion_individual", quantity: 3 },
      { trainer_id: trainer.id, item_key: "potion_collective", quantity: 1 },
    ]);

    return { trainerId: trainer.id };
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
