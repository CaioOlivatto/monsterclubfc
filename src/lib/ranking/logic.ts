import { generateAmateurAcademies } from "./names";
import { WORLD_TEAMS, DIVISION_ORDER } from "../world/catalog";

export type SortKey = "level" | "wins" | "patrimony";
export type Div = "lendaria" | "diamante" | "ouro" | "prata" | "bronze" | "amador";

export const TOTAL_ACADEMIES = 1200;
export const AMATEUR_COUNT = TOTAL_ACADEMIES - 70;

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

export async function seedWorldAcademiesIfNeeded(supabase: any) {
  const { count } = await supabase
    .from("world_academies")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) >= TOTAL_ACADEMIES - 5) return;

  const rng = mulberry32(1337);
  const rows: any[] = [];

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

  const amateurs = generateAmateurAcademies(AMATEUR_COUNT, 20260722);
  amateurs.forEach((a, idx) => {
    const t = idx / AMATEUR_COUNT;
    const baseLevel = Math.max(1, Math.round(18 - t * 17 + (rng() * 4 - 2)));
    const baseWins = Math.max(0, Math.round((1 - t) * 180 + rng() * 40 - 15));
    const basePat = Math.max(30_000, Math.round((1 - t) * 700_000 + rng() * 120_000 + 40_000));
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

  const CHUNK = 300;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from("world_academies").insert(rows.slice(i, i + CHUNK));
    if (error) throw error;
  }
}

export async function upsertPlayerAcademy(supabase: any, trainerId: string) {
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
  const creatureValue = cList.reduce((s, c) => s + Math.round((c.overall ?? 40) ** 2 * 8), 0);
  const patrimony = Math.round((acad?.money ?? 0) + creatureValue);

  let totalWins = 0;
  if (playerTeam?.id) {
    const { data: standings } = await supabase
      .from("standings")
      .select("wins")
      .eq("team_id", playerTeam.id);
    totalWins = (standings ?? []).reduce((s: number, r: any) => s + (r.wins ?? 0), 0);
  }

  const division = (playerTeam?.division as Div | undefined) ?? "amador";
  const colors = (playerTeam?.colors as any) ?? {};
  const primary = colors?.primary ?? playerTeam?.color ?? "#2563EB";
  const secondary = colors?.secondary ?? "#0F172A";

  const { data: existing } = await supabase
    .from("world_academies")
    .select("id")
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

export async function recomputePositionsBy(supabase: any, sort: SortKey) {
  const { data: all } = await supabase
    .from("world_academies")
    .select("id, level, wins, patrimony")
    .order(sort, { ascending: false });
  if (!all) return;
  const arr = [...all].sort((a: any, b: any) => {
    if (b[sort] !== a[sort]) return b[sort] - a[sort];
    if (b.level !== a.level) return b.level - a.level;
    return b.patrimony - a.patrimony;
  });
  const CHUNK = 300;
  for (let i = 0; i < arr.length; i += CHUNK) {
    const slice = arr.slice(i, i + CHUNK);
    const rows = slice.map((r: any, idx: number) => ({ id: r.id, current_position: i + idx + 1 }));
    await supabase.from("world_academies").upsert(rows, { onConflict: "id" });
  }
}

export async function evolveCpuAcademies(supabase: any) {
  const { data: all } = await supabase
    .from("world_academies")
    .select("id, division, current_position, level, wins, patrimony, is_player");
  if (!all) return 0;
  const rng = mulberry32(Date.now() >>> 0);
  const updates: any[] = [];
  for (const row of all) {
    if (row.is_player) {
      updates.push({ id: row.id, last_position: row.current_position });
      continue;
    }
    const div = row.division as Div;
    let dL = 0, dW = 0, dP = 0;
    if (div === "lendaria") { dL = rand(rng, 0, 2); dW = rand(rng, 18, 30); dP = rand(rng, 800_000, 1_800_000); }
    else if (div === "diamante") { dL = rand(rng, 0, 2); dW = rand(rng, 14, 24); dP = rand(rng, 300_000, 900_000); }
    else if (div === "ouro") { dL = rand(rng, 0, 2); dW = rand(rng, 10, 20); dP = rand(rng, 120_000, 400_000); }
    else if (div === "prata") { dL = rand(rng, 0, 1); dW = rand(rng, 8, 16); dP = rand(rng, 60_000, 200_000); }
    else if (div === "bronze") { dL = rand(rng, 0, 1); dW = rand(rng, 6, 14); dP = rand(rng, 30_000, 120_000); }
    else { dL = rand(rng, 0, 1); dW = rand(rng, 0, 8); dP = rand(rng, 5_000, 40_000); }
    updates.push({
      id: row.id,
      level: (row.level ?? 1) + dL,
      wins: (row.wins ?? 0) + dW,
      patrimony: (row.patrimony ?? 0) + dP,
      last_position: row.current_position,
    });
  }
  const CHUNK = 300;
  for (let i = 0; i < updates.length; i += CHUNK) {
    await supabase.from("world_academies").upsert(updates.slice(i, i + CHUNK), { onConflict: "id" });
  }
  return updates.length;
}
