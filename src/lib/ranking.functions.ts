import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateAmateurAcademies } from "./ranking/names";
import { WORLD_TEAMS, DIVISION_ORDER } from "./world/catalog";

const TOTAL_ACADEMIES = 1200;
const AMATEUR_COUNT = TOTAL_ACADEMIES - 70; // 1130

export type SortKey = "level" | "wins" | "patrimony";

type Div = "lendaria" | "diamante" | "ouro" | "prata" | "bronze" | "amador";

// Perfil por divisão para gerar métricas base das CPUs profissionais
const PRO_PROFILE: Record<Exclude<Div, "amador">, { level: [number, number]; wins: [number, number]; patrimony: [number, number] }> = {
  lendaria: { level: [40, 55], wins: [800, 1600], patrimony: [8_000_000, 20_000_000] },
  diamante: { level: [30, 42], wins: [500, 950], patrimony: [4_000_000, 10_000_000] },
  ouro:     { level: [22, 34], wins: [280, 620], patrimony: [1_800_000, 5_000_000] },
  prata:    { level: [15, 26], wins: [140, 360], patrimony: [700_000, 2_500_000] },
  bronze:   { level: [10, 18], wins: [50, 200], patrimony: [250_000, 900_000] },
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = (rng: () => number, min: number, max: number) => Math.floor(min + rng() * (max - min + 1));

async function seedWorldAcademiesIfNeeded(supabase: any) {
  const { count } = await supabase
    .from("world_academies")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) >= TOTAL_ACADEMIES - 5) return;

  const rng = mulberry32(1337);
  const rows: any[] = [];

  // 1) 70 profissionais (não vinculadas a team_id — pode ser feito depois; nomes vêm do catálogo)
  for (const div of DIVISION_ORDER) {
    const profile = PRO_PROFILE[div];
    for (const team of WORLD_TEAMS[div]) {
      rows.push({
        academy_name: `Academia ${team.name}`,
        trainer_name: syntheticTrainerName(rng),
        division: div,
        level: rand(rng, profile.level[0], profile.level[1]),
        wins: rand(rng, profile.wins[0], profile.wins[1]),
        patrimony: rand(rng, profile.patrimony[0], profile.patrimony[1]),
        primary_color: team.primary,
        secondary_color: team.secondary,
        is_player: false,
      });
    }
  }

  // 2) ~1130 amadoras — força decrescente
  const amateurs = generateAmateurAcademies(AMATEUR_COUNT, 20260722);
  amateurs.forEach((a, idx) => {
    // Curva: as primeiras ~200 amadoras são fortes (nível 15-8), as últimas fracas (nível 1-3).
    const t = idx / AMATEUR_COUNT; // 0..1
    const baseLevel = Math.max(1, Math.round(18 - t * 17 + (rng() * 4 - 2)));
    const baseWins = Math.max(0, Math.round((1 - t) * 180 + rng() * 40 - 15));
    const basePat = Math.max(
      30_000,
      Math.round((1 - t) * 700_000 + rng() * 120_000 + 40_000),
    );
    rows.push({
      academy_name: a.academy_name,
      trainer_name: a.trainer_name,
      division: "amador",
      level: baseLevel,
      wins: baseWins,
      patrimony: basePat,
      primary_color: a.primary_color,
      secondary_color: a.secondary_color,
      is_player: false,
    });
  });

  // Inserção em batch
  const CHUNK = 300;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from("world_academies").insert(rows.slice(i, i + CHUNK));
    if (error) throw error;
  }
}

function syntheticTrainerName(rng: () => number): string {
  const first = ["Alaric", "Bruno", "Cassian", "Diogo", "Élio", "Fábio", "Gaia", "Helena", "Ícaro", "Júlia",
    "Kira", "Léo", "Márcio", "Nuno", "Otávia", "Píer", "Quim", "Rui", "Salma", "Tarso",
    "Ulisses", "Vera", "Wanda", "Ximena", "Yago", "Zaira", "Aurora", "Bento", "Célia", "Dalva"];
  const last = ["Aragão", "Bezerra", "Cordeiro", "Drummond", "Estrela", "Falcão", "Guerra", "Hermes",
    "Iglesias", "Junqueira", "Kappler", "Loureiro", "Montenegro", "Nascimento", "Ozório",
    "Pontes", "Quaresma", "Ramires", "Sarmento", "Tavares", "Ulhôa", "Valente", "Whitaker",
    "Xisto", "Yepes", "Zamora"];
  return `${first[Math.floor(rng() * first.length)]} ${last[Math.floor(rng() * last.length)]}`;
}

async function upsertPlayer(supabase: any, trainerId: string) {
  const { data: trainer } = await supabase
    .from("trainers")
    .select("id, trainer_name, academy_name, level")
    .eq("id", trainerId)
    .maybeSingle();
  if (!trainer) return null;

  const { data: acad } = await supabase
    .from("academies")
    .select("money")
    .eq("trainer_id", trainerId)
    .maybeSingle();

  const { data: playerTeam } = await supabase
    .from("teams")
    .select("id, division, color, colors")
    .eq("trainer_id", trainerId)
    .maybeSingle();

  const { data: creatures } = await supabase
    .from("creatures")
    .select("overall")
    .eq("owner_trainer_id", trainerId);
  const cList = (creatures ?? []) as { overall: number }[];
  // valor estimado: cada criatura ≈ overall² × 8
  const creatureValue = cList.reduce((s, c) => s + Math.round((c.overall ?? 40) ** 2 * 8), 0);

  const patrimony = Math.round((acad?.money ?? 0) + creatureValue);

  // Vitórias: soma de wins em standings do jogador
  const { data: standings } = await supabase
    .from("standings")
    .select("wins, team_id")
    .in("team_id", playerTeam ? [playerTeam.id] : []);
  const totalWins = (standings ?? []).reduce((s: number, r: any) => s + (r.wins ?? 0), 0);

  const division = (playerTeam?.division as Div | undefined) ?? "amador";
  const colors = (playerTeam?.colors as any) ?? {};
  const primary = colors?.primary ?? playerTeam?.color ?? "#2563EB";
  const secondary = colors?.secondary ?? "#0F172A";

  const { data: existing } = await supabase
    .from("world_academies")
    .select("id, current_position")
    .eq("trainer_id", trainerId)
    .maybeSingle();

  const payload = {
    trainer_id: trainerId,
    team_id: playerTeam?.id ?? null,
    academy_name: trainer.academy_name ?? "Minha Academia",
    trainer_name: trainer.trainer_name ?? "Treinador",
    division,
    level: trainer.level ?? 1,
    wins: totalWins,
    patrimony,
    primary_color: primary,
    secondary_color: secondary,
    is_player: true,
  };

  if (existing) {
    await supabase.from("world_academies").update(payload).eq("id", existing.id);
    return existing.id as string;
  }
  const { data: inserted } = await supabase
    .from("world_academies")
    .insert(payload)
    .select("id")
    .single();
  return inserted?.id as string | undefined;
}

async function recomputePositions(supabase: any, sort: SortKey) {
  // Ordena por critério, ranqueia e atualiza `current_position`.
  const { data: all } = await supabase
    .from("world_academies")
    .select("id, level, wins, patrimony")
    .order(sort, { ascending: false });
  if (!all) return;
  // Estabilidade adicional por level+patrimony
  const arr = [...all].sort((a: any, b: any) => {
    if (b[sort] !== a[sort]) return b[sort] - a[sort];
    if (b.level !== a.level) return b.level - a.level;
    return b.patrimony - a.patrimony;
  });
  const CHUNK = 300;
  for (let i = 0; i < arr.length; i += CHUNK) {
    const slice = arr.slice(i, i + CHUNK);
    // Atualiza em batch via upsert
    const rows = slice.map((r: any, idx: number) => ({ id: r.id, current_position: i + idx + 1 }));
    await supabase.from("world_academies").upsert(rows, { onConflict: "id" });
  }
}

export const getWorldRanking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: { sort?: SortKey }) => ({ sort: (v?.sort ?? "level") as SortKey }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const sort = data.sort;

    // 1) Garante o pool CPU e o registro do jogador
    await seedWorldAcademiesIfNeeded(supabase);
    const { data: trainer } = await supabase
      .from("trainers")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (trainer?.id) await upsertPlayer(supabase, trainer.id);

    // 2) Recalcula posições segundo o critério pedido
    await recomputePositions(supabase, sort);

    // 3) Total
    const { count: total } = await supabase
      .from("world_academies")
      .select("id", { count: "exact", head: true });

    // 4) Top 50
    const { data: top } = await supabase
      .from("world_academies")
      .select("id, academy_name, trainer_name, division, level, wins, patrimony, primary_color, secondary_color, is_player, current_position, last_position")
      .order("current_position", { ascending: true })
      .limit(50);

    // 5) Contexto do jogador (± 2 posições)
    let player: any = null;
    let context5: any[] = [];
    if (trainer?.id) {
      const { data: me } = await supabase
        .from("world_academies")
        .select("id, academy_name, trainer_name, division, level, wins, patrimony, primary_color, secondary_color, is_player, current_position, last_position")
        .eq("trainer_id", trainer.id)
        .maybeSingle();
      if (me?.current_position) {
        player = me;
        const from = Math.max(1, me.current_position - 2);
        const to = me.current_position + 2;
        const { data: nearby } = await supabase
          .from("world_academies")
          .select("id, academy_name, trainer_name, division, level, wins, patrimony, primary_color, secondary_color, is_player, current_position, last_position")
          .gte("current_position", from)
          .lte("current_position", to)
          .order("current_position", { ascending: true });
        context5 = nearby ?? [];
      }
    }

    return {
      sort,
      total: total ?? 0,
      top: top ?? [],
      player,
      context5,
    };
  });

/** Chamada após finalizar temporada — evolui CPUs e recalcula posições. */
export const recomputeWorldRanking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await seedWorldAcademiesIfNeeded(supabase);

    // Salva a posição atual como "last_position"
    const { data: all } = await supabase
      .from("world_academies")
      .select("id, division, current_position, level, wins, patrimony");
    if (!all) return { updated: 0 };

    // Evolução leve das CPUs por divisão
    const seasonSeed = Date.now() >>> 0;
    const rng = mulberry32(seasonSeed);
    const updates: any[] = [];
    for (const row of all) {
      const div = row.division as Div;
      let deltaLevel = 0;
      let deltaWins = 0;
      let deltaPat = 0;
      if (div === "lendaria") { deltaLevel = rand(rng, 0, 2); deltaWins = rand(rng, 18, 30); deltaPat = rand(rng, 800_000, 1_800_000); }
      else if (div === "diamante") { deltaLevel = rand(rng, 0, 2); deltaWins = rand(rng, 14, 24); deltaPat = rand(rng, 300_000, 900_000); }
      else if (div === "ouro") { deltaLevel = rand(rng, 0, 2); deltaWins = rand(rng, 10, 20); deltaPat = rand(rng, 120_000, 400_000); }
      else if (div === "prata") { deltaLevel = rand(rng, 0, 1); deltaWins = rand(rng, 8, 16); deltaPat = rand(rng, 60_000, 200_000); }
      else if (div === "bronze") { deltaLevel = rand(rng, 0, 1); deltaWins = rand(rng, 6, 14); deltaPat = rand(rng, 30_000, 120_000); }
      else { deltaLevel = rand(rng, 0, 1); deltaWins = rand(rng, 0, 8); deltaPat = rand(rng, 5_000, 40_000); }
      updates.push({
        id: row.id,
        level: (row.level ?? 1) + deltaLevel,
        wins: (row.wins ?? 0) + deltaWins,
        patrimony: (row.patrimony ?? 0) + deltaPat,
        last_position: row.current_position,
      });
    }
    const CHUNK = 300;
    for (let i = 0; i < updates.length; i += CHUNK) {
      await supabase.from("world_academies").upsert(updates.slice(i, i + CHUNK), { onConflict: "id" });
    }

    // Atualiza player e recalcula
    const { data: trainer } = await supabase
      .from("trainers")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (trainer?.id) await upsertPlayer(supabase, trainer.id);
    await recomputePositions(supabase, "level");

    return { updated: updates.length };
  });

// Sinaliza uso para o schema de zod (evita árvore morta)
export const _sortSchema = z.enum(["level", "wins", "patrimony"]);
