// Dev-only tools for testing season transitions and world-competition qualifications.
// Rota /dev usa estes fns; visível apenas em import.meta.env.DEV.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DIVISION_ORDER = ["bronze", "prata", "ouro", "diamante", "lendaria"] as const;
type Division = typeof DIVISION_ORDER[number];

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

/**
 * DEV: Fast-forward — preenche todas as partidas 'scheduled' da temporada atual
 * do jogador com resultados aleatórios determinísticos, agrega em standings.
 * Não roda motor, não paga salário, não fadiga, não XP. Só popula dados para
 * poder chamar finishSeasonAndAdvance em seguida.
 */
export const devFastForwardCurrentSeason = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: trainer } = await supabase
      .from("trainers").select("id").eq("user_id", userId).maybeSingle();
    if (!trainer) throw new Error("Treinador não encontrado.");

    const { data: comps } = await supabase
      .from("competitions")
      .select("id, division, season_id")
      .eq("trainer_id", trainer.id)
      .eq("type", "league")
      .eq("status", "active");
    if (!comps?.length) throw new Error("Nenhuma liga ativa.");
    const compIds = comps.map((c: any) => c.id);

    const { data: pending } = await supabase
      .from("matches")
      .select("id, competition_id, home_team_id, away_team_id, round")
      .in("competition_id", compIds)
      .eq("status", "scheduled");

    const rng = mulberry32(0xC0FFEE ^ compIds.length);
    // aggregate deltas per (comp, team)
    const agg = new Map<string, { points: number; wins: number; draws: number; losses: number; gf: number; ga: number }>();
    const bump = (comp: string, team: string, gf: number, ga: number) => {
      const k = `${comp}|${team}`;
      const cur = agg.get(k) ?? { points: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0 };
      cur.gf += gf; cur.ga += ga;
      if (gf > ga) { cur.wins++; cur.points += 3; }
      else if (gf === ga) { cur.draws++; cur.points += 1; }
      else cur.losses++;
      agg.set(k, cur);
    };

    const updates: Promise<any>[] = [];
    for (const m of pending ?? []) {
      const hg = Math.floor(rng() * 4);
      const ag = Math.floor(rng() * 4);
      bump(m.competition_id, m.home_team_id, hg, ag);
      bump(m.competition_id, m.away_team_id, ag, hg);
      updates.push(
        supabase.from("matches").update({
          home_score: hg, away_score: ag,
          status: "finished",
          is_summary: true,
          played_at: new Date().toISOString(),
        }).eq("id", m.id) as any
      );
    }
    // chunk
    for (let i = 0; i < updates.length; i += 50) {
      await Promise.all(updates.slice(i, i + 50));
    }

    // Apply deltas to standings
    const { data: standings } = await supabase
      .from("standings")
      .select("id, competition_id, team_id, points, wins, draws, losses, goals_for, goals_against")
      .in("competition_id", compIds);
    for (const s of standings ?? []) {
      const d = agg.get(`${s.competition_id}|${s.team_id}`);
      if (!d) continue;
      await supabase.from("standings").update({
        points: s.points + d.points,
        wins: s.wins + d.wins,
        draws: s.draws + d.draws,
        losses: s.losses + d.losses,
        goals_for: s.goals_for + d.gf,
        goals_against: s.goals_against + d.ga,
      }).eq("id", s.id);
    }

    return { matchesFilled: pending?.length ?? 0, competitions: comps.length };
  });

/**
 * DEV: deriva Top 4 + Campeão por divisão a partir de `standings`
 * (query pronta pra Fase B consumir). Lê a última temporada FINISHED
 * do jogador (ou a atual, se `useCurrentSeason=true`).
 *
 * Desempate para WILDCARD da Liga na Fase B:
 *   ORDER BY points DESC, (goals_for - goals_against) DESC, goals_for DESC, RANDOM()
 * Aqui só reproduzimos a mesma ordenação nas leituras por divisão.
 */
export const devDeriveWorldQualifiers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { seasonNumber?: number }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: trainer } = await supabase
      .from("trainers").select("id").eq("user_id", userId).maybeSingle();
    if (!trainer) throw new Error("Treinador não encontrado.");

    // resolve season id
    let seasonId: string | null = null;
    let seasonNumber: number | null = null;
    if (data.seasonNumber) {
      const { data: s } = await supabase
        .from("game_seasons").select("id, season_number")
        .eq("trainer_id", trainer.id).eq("season_number", data.seasonNumber).maybeSingle();
      seasonId = s?.id ?? null; seasonNumber = s?.season_number ?? null;
    } else {
      // preferir última FINISHED (ended_at NOT NULL), senão atual
      const { data: finished } = await supabase
        .from("game_seasons")
        .select("id, season_number, ended_at, is_current")
        .eq("trainer_id", trainer.id)
        .order("season_number", { ascending: false })
        .limit(5);
      const chosen = (finished ?? []).find((s: any) => !s.is_current) ?? finished?.[0];
      seasonId = chosen?.id ?? null; seasonNumber = chosen?.season_number ?? null;
    }
    if (!seasonId) return { seasonNumber, byDivision: [], liga: [], copa: [] };

    const { data: comps } = await supabase
      .from("competitions")
      .select("id, division")
      .eq("trainer_id", trainer.id)
      .eq("season_id", seasonId)
      .eq("type", "league");
    const compIds = (comps ?? []).map((c: any) => c.id);
    if (!compIds.length) return { seasonNumber, byDivision: [], liga: [], copa: [] };

    const { data: standings } = await supabase
      .from("standings")
      .select("competition_id, team_id, points, wins, draws, losses, goals_for, goals_against, division")
      .in("competition_id", compIds);
    const { data: teams } = await supabase
      .from("teams").select("id, name")
      .in("id", (standings ?? []).map((s: any) => s.team_id));
    const nameById = new Map<string, string>((teams ?? []).map((t: any) => [t.id, t.name]));

    const byDiv = new Map<Division, any[]>();
    for (const s of standings ?? []) {
      const arr = byDiv.get(s.division as Division) ?? [];
      arr.push(s);
      byDiv.set(s.division as Division, arr);
    }
    // sort: points DESC, GD DESC, GF DESC, wins DESC (random tiebreak reservada para wildcard da Fase B)
    const sortRows = (rows: any[]) => [...rows].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const gdA = a.goals_for - a.goals_against;
      const gdB = b.goals_for - b.goals_against;
      if (gdB !== gdA) return gdB - gdA;
      if (b.goals_for !== a.goals_for) return b.goals_for - a.goals_for;
      return b.wins - a.wins;
    });

    const liga: any[] = []; const copa: any[] = []; const byDivision: any[] = [];
    for (const div of DIVISION_ORDER) {
      const rows = sortRows(byDiv.get(div) ?? []);
      const top4 = rows.slice(0, 4).map((r, i) => ({
        pos: i + 1, team: nameById.get(r.team_id) ?? "—",
        points: r.points, gd: r.goals_for - r.goals_against, gf: r.goals_for,
      }));
      const champion = top4[0] ?? null;
      byDivision.push({ division: div, top4, champion });
      liga.push(...top4.map((r) => ({ division: div, ...r })));
      if (champion) copa.push({ division: div, ...champion });
    }
    return { seasonNumber, byDivision, liga, copa };
  });

/**
 * DEV: lê todas as linhas de qualifications do treinador (para conferir
 * isolamento por season_number entre T1/T2/T3).
 */
export const devReadMyQualifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: trainer } = await supabase
      .from("trainers").select("id").eq("user_id", userId).maybeSingle();
    if (!trainer) throw new Error("Treinador não encontrado.");
    const { data } = await supabase
      .from("qualifications")
      .select("season_number, qualifies_for, source_division, source_position, created_at")
      .eq("trainer_id", trainer.id)
      .order("season_number", { ascending: true })
      .order("qualifies_for", { ascending: true });
    return { rows: data ?? [] };
  });
