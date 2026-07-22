import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateSchedule } from "./league.server";
import {
  simulate,
  persistableSimulationEvents,
  generateCpuSideFor,
  type EngineSide,
  type EngineBestiary,
} from "./match-engine.server";
import { stadiumCapacity } from "./buildings.server";
import { buildPlayerSideFromDb } from "./player-side.server";
import { applyPostMatchXp, insertMessage } from "./xp.server";
import { awardTrainerXp, resetSeasonBreakdown } from "./trainer-xp.server";
import { MATCH_REVENUE, MAINTENANCE_PER_MATCH, matchSalary } from "./economy";
import { loadBestiary } from "./bestiary.server";

async function loadEngineBestiary(supabase: any): Promise<EngineBestiary> {
  const b = await loadBestiary(supabase);
  return {
    species: b.species.map((s) => ({
      species: s.species,
      element: s.element,
      is_goalkeeper: s.position === "Goleiro",
    })),
    epithets: b.epithets,
  };
}



async function getTrainer(supabase: any, userId: string) {
  const { data: trainer } = await supabase
    .from("trainers")
    .select("id, academy_name")
    .eq("user_id", userId)
    .maybeSingle();
  if (!trainer) throw new Error("Treinador não encontrado.");
  return trainer as { id: string; academy_name: string };
}

async function ensureCurrentSeason(supabase: any, trainerId: string) {
  const { data: existing } = await supabase
    .from("game_seasons")
    .select("id, season_number")
    .eq("trainer_id", trainerId)
    .eq("is_current", true)
    .maybeSingle();
  if (existing) return existing;
  const { data: created, error } = await supabase
    .from("game_seasons")
    .insert({ trainer_id: trainerId, season_number: 1, is_current: true })
    .select("id, season_number")
    .single();
  if (error) throw error;
  return created;
}

async function playerAverage(supabase: any, trainerId: string): Promise<number> {
  const { data } = await supabase.from("creatures").select("overall").eq("owner_trainer_id", trainerId);
  const list = (data ?? []) as { overall: number }[];
  if (!list.length) return 45;
  return Math.round(list.reduce((a, c) => a + c.overall, 0) / list.length);
}

const DIVISION_ORDER = ["bronze", "prata", "ouro", "diamante", "lendaria"] as const;
type Division = typeof DIVISION_ORDER[number];

// Prêmio por partida na liga por divisão (V / E / D) — Balanceamento §2.1
const MATCH_PRIZE: Record<Division, [number, number, number]> = {
  bronze:   [15_000,  6_000,  2_000],
  prata:    [28_000, 11_000,  4_000],
  ouro:     [50_000, 20_000,  7_000],
  diamante: [90_000, 36_000, 13_000],
  lendaria:[160_000, 64_000, 24_000],
};

// Liga de 14 times, 26 rodadas (turno e returno) — Balanceamento §1.2 e §8.
const LEAGUE_SIZE = 14;
const CPU_COUNT = LEAGUE_SIZE - 1;

// Multiplicador aplicado sobre o prêmio de vitória da divisão (fim de temporada)
// §2.3: 1º ×10 · 2º ×6 · 3º–4º ×3 · 5º–6º ×1,5 · 7º–8º ×0,5 · demais 0
const SEASON_POSITION_MULT: number[] = [
  10, 6, 3, 3, 1.5, 1.5, 0.5, 0.5,
  0, 0, 0, 0, 0, 0,
];

// Salário por temporada baseado no overall (aprox. tier de estrelas)
function seasonSalary(overall: number): number {
  if (overall < 30) return 4_000;    // 0,5–1★
  if (overall < 50) return 9_000;    // 1,5–2★
  if (overall < 70) return 20_000;   // 2,5–3★
  if (overall < 90) return 45_000;   // 3,5–4★
  return 90_000;                     // 4,5–5★
}

export const startLeague = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const trainer = await getTrainer(supabase, userId);

    // Se já existe qualquer competição de liga ativa (mundo semeado), aborta.
    const { data: existingComp } = await supabase
      .from("competitions")
      .select("id")
      .eq("trainer_id", trainer.id)
      .eq("type", "league")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (existingComp) throw new Error("Você já tem uma liga em andamento.");

    // Semeia todo o mundo (5 divisões × 14 times = 70) usando o time do jogador.
    const season = await ensureCurrentSeason(supabase, trainer.id);

    // Descobre o starter_key: prefere um time existente do jogador na Bronze; senão, usa titas_pedra.
    const { data: existingPlayerTeam } = await supabase
      .from("teams")
      .select("starter_key, name")
      .eq("trainer_id", trainer.id)
      .eq("is_player", true)
      .maybeSingle();
    const playerStarterKey = existingPlayerTeam?.starter_key || "titas_pedra";

    const { seedWorldForTrainer } = await import("./world/seed.server");
    const { playerTeamId } = await seedWorldForTrainer({
      supabase,
      trainerId: trainer.id,
      seasonId: season.id,
      playerStarterKey,
      playerRoster: [],
    });

    // Reatribui elenco atual ao novo time do jogador e sincroniza academy_name.
    const { data: myCreatures } = await supabase
      .from("creatures")
      .select("id")
      .eq("owner_trainer_id", trainer.id);
    if (myCreatures?.length) {
      await supabase
        .from("creatures")
        .update({ owner_team_id: playerTeamId })
        .in("id", myCreatures.map((c: any) => c.id));
    }
    const { data: playerTeamRow } = await supabase
      .from("teams")
      .select("name")
      .eq("id", playerTeamId)
      .maybeSingle();
    if (playerTeamRow?.name) {
      await supabase.from("trainers").update({ academy_name: playerTeamRow.name }).eq("id", trainer.id);
    }

    const { data: bronzeComp } = await supabase
      .from("competitions")
      .select("id")
      .eq("trainer_id", trainer.id)
      .eq("type", "league")
      .eq("division", "bronze")
      .eq("status", "active")
      .maybeSingle();

    return { competition_id: bronzeComp?.id ?? null };
  });

export const getLeague = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ division: z.enum(["bronze", "prata", "ouro", "diamante", "lendaria"]).optional() }).parse(raw ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const trainer = await getTrainer(supabase, userId);

    // Todas as competições ativas da temporada corrente do treinador (5 divisões)
    const { data: allComps } = await supabase
      .from("competitions")
      .select("id, division, season_id, status, champion_team_id")
      .eq("trainer_id", trainer.id)
      .eq("type", "league")
      .eq("status", "active");
    if (!allComps || !allComps.length) return { competition: null };

    // Divisão do jogador = a que tem o time do jogador
    const { data: playerTeamRow } = await supabase
      .from("teams")
      .select("id, competition_id, division")
      .eq("trainer_id", trainer.id)
      .eq("is_player", true)
      .in("competition_id", allComps.map((c: any) => c.id))
      .maybeSingle();

    const playerDiv = (playerTeamRow?.division as Division | undefined) ?? "bronze";
    const requested = (data.division ?? playerDiv) as Division;
    const competition = allComps.find((c: any) => c.division === requested) ?? allComps[0];

    const [teamsRes, standingsRes, matchesRes] = await Promise.all([
      supabase
        .from("teams")
        .select("id, name, is_player, cpu_strength, division, colors")
        .eq("competition_id", competition.id),
      supabase
        .from("standings")
        .select("team_id, points, wins, draws, losses, goals_for, goals_against")
        .eq("competition_id", competition.id),
      supabase
        .from("matches")
        .select("id, round, home_team_id, away_team_id, home_score, away_score, status, played_at")
        .eq("competition_id", competition.id)
        .order("round", { ascending: true }),
    ]);

    return {
      competition,
      teams: teamsRes.data ?? [],
      standings: standingsRes.data ?? [],
      matches: matchesRes.data ?? [],
      divisions: DIVISION_ORDER.map((d) => ({
        division: d,
        competition_id: allComps.find((c: any) => c.division === d)?.id ?? null,
      })),
      playerDivision: playerDiv,
      selectedDivision: requested,
    };
  });


export const playNextLeagueMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const trainer = await getTrainer(supabase, userId);

    const { data: competition } = await supabase
      .from("competitions")
      .select("id, division, season_id")
      .eq("trainer_id", trainer.id)
      .eq("type", "league")
      .eq("status", "active")
      .maybeSingle();
    if (!competition) throw new Error("Nenhuma liga em andamento.");

    const { data: playerTeam } = await supabase
      .from("teams")
      .select("id")
      .eq("competition_id", competition.id)
      .eq("is_player", true)
      .maybeSingle();
    if (!playerTeam) throw new Error("Time do jogador não encontrado nesta liga.");

    const { data: next } = await supabase
      .from("matches")
      .select("id, round, home_team_id, away_team_id")
      .eq("competition_id", competition.id)
      .eq("status", "scheduled")
      .or(`home_team_id.eq.${playerTeam.id},away_team_id.eq.${playerTeam.id}`)
      .order("round", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!next) throw new Error("Sua liga já foi concluída.");

    const { data: teams } = await supabase
      .from("teams")
      .select("id, name, is_player, cpu_strength, trainer_id")
      .in("id", [next.home_team_id, next.away_team_id]);
    const home = teams!.find((t: any) => t.id === next.home_team_id) as any;
    const away = teams!.find((t: any) => t.id === next.away_team_id) as any;

    const bestiary = await loadEngineBestiary(supabase);
    const playerSideRef: { current: EngineSide | null } = { current: null };
    async function buildSide(team: any): Promise<EngineSide> {
      if (team.is_player) {
        const side = await buildPlayerSideFromDb(supabase, trainer.id, team.id, team.name);
        playerSideRef.current = side;
        return side;
      }
      const seed = hashSeed(team.id);
      return generateCpuSideFor(seed, team.id, team.name, team.cpu_strength ?? 45, bestiary);
    }
    const homeSide = await buildSide(home);
    const awaySide = await buildSide(away);
    const seed = hashSeed(next.id);
    const result = simulate(homeSide, awaySide, seed);

    const { error: uErr } = await supabase
      .from("matches")
      .update({
        home_score: result.home_score,
        away_score: result.away_score,
        status: "finished",
        clima: result.weather,
        played_at: new Date().toISOString(),
      })
      .eq("id", next.id);
    if (uErr) throw uErr;

    const eventsToInsert = persistableSimulationEvents(result).map((e) => ({
      match_id: next.id,
      minute: e.minute,
      event_type: e.event_type,
      description: e.description,
      actor_creature_id:
        e.actor_creature_id && !e.actor_creature_id.startsWith("cpu-") ? e.actor_creature_id : null,
      actor_team_id: e.actor_team_id,
    }));
    if (eventsToInsert.length) {
      const { error: eErr } = await supabase.from("match_events").insert(eventsToInsert);
      if (eErr) throw eErr;
    }

    const updates: Array<{ team_id: string; gf: number; ga: number; result: "W" | "D" | "L" }> = [
      { team_id: home.id, gf: result.home_score, ga: result.away_score,
        result: result.home_score > result.away_score ? "W" : result.home_score < result.away_score ? "L" : "D" },
      { team_id: away.id, gf: result.away_score, ga: result.home_score,
        result: result.away_score > result.home_score ? "W" : result.away_score < result.home_score ? "L" : "D" },
    ];
    for (const u of updates) {
      const { data: row } = await supabase
        .from("standings")
        .select("points, wins, draws, losses, goals_for, goals_against")
        .eq("competition_id", competition.id)
        .eq("team_id", u.team_id)
        .maybeSingle();
      if (!row) continue;
      await supabase
        .from("standings")
        .update({
          wins: row.wins + (u.result === "W" ? 1 : 0),
          draws: row.draws + (u.result === "D" ? 1 : 0),
          losses: row.losses + (u.result === "L" ? 1 : 0),
          points: row.points + (u.result === "W" ? 3 : u.result === "D" ? 1 : 0),
          goals_for: row.goals_for + u.gf,
          goals_against: row.goals_against + u.ga,
        })
        .eq("competition_id", competition.id)
        .eq("team_id", u.team_id);
    }

    // Financeiro por partida — Balanceamento por partida (TV, Patrocínio, Merch,
    // Bilheteria, Prêmio) menos (Salários da rodada + Manutenção de infraestrutura).
    let financeSummary: any = null;
    try {
      const isHome = playerTeam.id === home.id;
      const playerGf = isHome ? result.home_score : result.away_score;
      const playerGa = isHome ? result.away_score : result.home_score;
      const outcome: "W" | "D" | "L" =
        playerGf > playerGa ? "W" : playerGf < playerGa ? "L" : "D";
      const division = (competition.division as Division) ?? "bronze";
      const [pw, pd, pl] = MATCH_PRIZE[division];
      const matchPrize = outcome === "W" ? pw : outcome === "D" ? pd : pl;

      // Receitas passivas por partida (§Economia-Por-Partida)
      const rev = MATCH_REVENUE[division];

      // Bilheteria (só em casa)
      let gate = 0;
      let stadiumLevel = 0;
      if (isHome) {
        const { data: est } = await supabase
          .from("buildings")
          .select("level")
          .eq("trainer_id", trainer.id)
          .eq("building_type", "estadio")
          .maybeSingle();
        stadiumLevel = est?.level ?? 0;
        const capacity = stadiumCapacity(stadiumLevel);
        const { data: standRows } = await supabase
          .from("standings")
          .select("team_id, points, goals_for, goals_against")
          .eq("competition_id", competition.id);
        const rankedCur = [...(standRows ?? [])].sort((a: any, b: any) => {
          if (b.points !== a.points) return b.points - a.points;
          const gdA = a.goals_for - a.goals_against;
          const gdB = b.goals_for - b.goals_against;
          if (gdB !== gdA) return gdB - gdA;
          return b.goals_for - a.goals_for;
        });
        const posIdx = rankedCur.findIndex((r: any) => r.team_id === playerTeam.id);
        const pos = posIdx >= 0 ? posIdx + 1 : LEAGUE_SIZE;
        const posInvertida = LEAGUE_SIZE + 1 - pos;
        const fillRate = Math.min(1, 0.70 + 0.03 * posInvertida);
        gate = Math.round(capacity * fillRate * 25);
      }

      // Salários por partida — elenco atual
      const { data: roster } = await supabase
        .from("creatures")
        .select("overall")
        .eq("owner_trainer_id", trainer.id);
      const salaries = (roster ?? []).reduce(
        (a: number, c: any) => a + matchSalary(c.overall ?? 40),
        0,
      );

      // Manutenção de infraestrutura por partida
      const { data: bldgs } = await supabase
        .from("buildings")
        .select("building_type, level")
        .eq("trainer_id", trainer.id);
      const maintenance = (bldgs ?? []).reduce((sum: number, b: any) => {
        const table = (MAINTENANCE_PER_MATCH as any)[b.building_type] as number[] | undefined;
        if (!table) return sum;
        const lvl = Math.min(Math.max(b.level ?? 0, 0), table.length - 1);
        return sum + (table[lvl] ?? 0);
      }, 0);

      const totalIncome = matchPrize + rev.tv + rev.sponsor + rev.merch + gate;
      const totalExpense = salaries + maintenance;
      const net = totalIncome - totalExpense;

      const { data: acad } = await supabase
        .from("academies")
        .select("money")
        .eq("trainer_id", trainer.id)
        .maybeSingle();
      await supabase
        .from("academies")
        .update({ money: (acad?.money ?? 0) + net })
        .eq("trainer_id", trainer.id);

      const label = outcome === "W" ? "vitória" : outcome === "D" ? "empate" : "derrota";
      const roundTag = `Rodada ${next.round}`;
      const txs: any[] = [
        { trainer_id: trainer.id, transaction_type: "income", category: "premio_partida",
          amount: matchPrize, description: `${roundTag} — premiação por ${label} (${division})` },
        { trainer_id: trainer.id, transaction_type: "income", category: "tv",
          amount: rev.tv, description: `${roundTag} — Direitos de TV` },
        { trainer_id: trainer.id, transaction_type: "income", category: "patrocinio",
          amount: rev.sponsor, description: `${roundTag} — Patrocínio` },
        { trainer_id: trainer.id, transaction_type: "income", category: "merch",
          amount: rev.merch, description: `${roundTag} — Merchandising` },
      ];
      if (isHome && gate > 0) {
        txs.push({ trainer_id: trainer.id, transaction_type: "income", category: "bilheteria",
          amount: gate, description: `${roundTag} — Bilheteria (estádio nv.${stadiumLevel})` });
      }
      if (salaries > 0) {
        txs.push({ trainer_id: trainer.id, transaction_type: "expense", category: "salarios",
          amount: salaries, description: `${roundTag} — Salários (${(roster ?? []).length} criaturas)` });
      }
      if (maintenance > 0) {
        txs.push({ trainer_id: trainer.id, transaction_type: "expense", category: "manutencao",
          amount: maintenance, description: `${roundTag} — Manutenção de infraestrutura` });
      }
      await supabase.from("financial_transactions").insert(txs);

      financeSummary = {
        outcome,
        division,
        round: next.round,
        is_home: isHome,
        income: {
          match_prize: matchPrize,
          tv: rev.tv,
          sponsor: rev.sponsor,
          merch: rev.merch,
          gate,
        },
        expense: {
          salaries,
          maintenance,
        },
        totals: { income: totalIncome, expense: totalExpense, net },
      };
      await supabase.from("matches").update({ finance_summary: financeSummary }).eq("id", next.id);
    } catch (e) {
      console.error("payoff error", e);
    }


    // XP pós-partida e mensagem de resultado
    try {
      const isHome = playerTeam.id === home.id;
      const playerGf = isHome ? result.home_score : result.away_score;
      const playerGa = isHome ? result.away_score : result.home_score;
      const outcomeXp: "W" | "D" | "L" =
        playerGf > playerGa ? "W" : playerGf < playerGa ? "L" : "D";
      const side: EngineSide | null = playerSideRef.current;
      if (side) {
        const starterIds = side.starters.map((s) => s.creature.id);
        const enteredReserveIds = result.used_bench_ids.filter((id: string) =>
          side.bench.some((b) => b.creature.id === id),
        );
        const unusedReserveIds = side.bench
          .map((b) => b.creature.id)
          .filter((id) => !enteredReserveIds.includes(id));
        await applyPostMatchXp(supabase, trainer.id, {
          starterIds,
          enteredReserveIds,
          unusedReserveIds,
          outcome: outcomeXp,
          energy_loss: result.energy_loss,
          injuries: result.injuries.filter((i) => i.team_id === playerTeam.id),
          isOfficial: true,
        });
      }
      const opponentName = isHome ? away.name : home.name;
      await insertMessage(
        supabase,
        trainer.id,
        "match",
        `Rodada ${next.round}: ${outcomeXp === "W" ? "Vitória" : outcomeXp === "D" ? "Empate" : "Derrota"} vs ${opponentName}`,
        `${isHome ? home.name : away.name} ${playerGf} x ${playerGa} ${isHome ? away.name : home.name} — clima: ${result.weather}.`,
      );
    } catch (e) {
      console.error("xp/message error", e);
    }

    // Simula outras partidas da mesma rodada (dentro da própria divisão do jogador)
    const { data: sameRound } = await supabase
      .from("matches")
      .select("id, home_team_id, away_team_id")
      .eq("competition_id", competition.id)
      .eq("round", next.round as number)
      .eq("status", "scheduled");
    for (const m of sameRound ?? []) {
      const { data: pair } = await supabase
        .from("teams")
        .select("id, cpu_strength, name")
        .in("id", [m.home_team_id, m.away_team_id]);
      const h = pair!.find((t: any) => t.id === m.home_team_id) as any;
      const a = pair!.find((t: any) => t.id === m.away_team_id) as any;
      const hs = generateCpuSideFor(hashSeed(h.id), h.id, h.name, (h.cpu_strength ?? 45) + 4, bestiary);
      const as = generateCpuSideFor(hashSeed(a.id), a.id, a.name, a.cpu_strength ?? 45, bestiary);
      const r = simulate(hs, as, hashSeed(m.id));
      await supabase
        .from("matches")
        .update({
          home_score: r.home_score,
          away_score: r.away_score,
          status: "finished",
          played_at: new Date().toISOString(),
        })
        .eq("id", m.id);
      const upd = [
        { team_id: h.id, gf: r.home_score, ga: r.away_score,
          result: r.home_score > r.away_score ? "W" : r.home_score < r.away_score ? "L" : "D" },
        { team_id: a.id, gf: r.away_score, ga: r.home_score,
          result: r.away_score > r.home_score ? "W" : r.away_score < r.home_score ? "L" : "D" },
      ];
      for (const u of upd) {
        const { data: row } = await supabase
          .from("standings")
          .select("points, wins, draws, losses, goals_for, goals_against")
          .eq("competition_id", competition.id)
          .eq("team_id", u.team_id)
          .maybeSingle();
        if (!row) continue;
        await supabase
          .from("standings")
          .update({
            wins: row.wins + (u.result === "W" ? 1 : 0),
            draws: row.draws + (u.result === "D" ? 1 : 0),
            losses: row.losses + (u.result === "L" ? 1 : 0),
            points: row.points + (u.result === "W" ? 3 : u.result === "D" ? 1 : 0),
            goals_for: row.goals_for + u.gf,
            goals_against: row.goals_against + u.ga,
          })
          .eq("competition_id", competition.id)
          .eq("team_id", u.team_id);
      }
    }

    // Simula o AVANÇO das OUTRAS 4 divisões na mesma rodada (versão rápida).
    try {
      await advanceOtherDivisionsForRound(
        supabase,
        trainer.id,
        competition.season_id ?? null,
        competition.id,
        next.round as number,
      );
    } catch (e) {
      console.error("world advance error", e);
    }

    return { match_id: next.id };
  });

export const finishSeasonAndAdvance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const trainer = await getTrainer(supabase, userId);

    // 1) Carrega TODAS as 5 competições ativas da temporada atual
    const { data: allComps } = await supabase
      .from("competitions")
      .select("id, division, season_id")
      .eq("trainer_id", trainer.id)
      .eq("type", "league")
      .eq("status", "active");
    if (!allComps || !allComps.length) throw new Error("Nenhuma liga ativa.");

    const seasonId = allComps[0].season_id;
    const compByDiv = new Map<Division, { id: string }>();
    for (const c of allComps) compByDiv.set(c.division as Division, { id: c.id });

    // Todas as 5 divisões devem existir
    for (const d of DIVISION_ORDER) {
      if (!compByDiv.has(d)) throw new Error(`Divisão ${d} não encontrada no mundo.`);
    }

    // 2) Verifica que nenhuma partida está pendente em nenhuma divisão
    const compIds = allComps.map((c: any) => c.id);
    const { count: pending } = await supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .in("competition_id", compIds)
      .eq("status", "scheduled");
    if ((pending ?? 0) > 0) throw new Error("Ainda há partidas por jogar no mundo.");

    // 3) FASE 1 — snapshot de classificações e cálculo de movimentos
    const { data: standingsAll } = await supabase
      .from("standings")
      .select("team_id, competition_id, points, wins, draws, losses, goals_for, goals_against")
      .in("competition_id", compIds);
    const { data: teamsAll } = await supabase
      .from("teams")
      .select("id, name, is_player, competition_id, division, color, colors")
      .in("competition_id", compIds);
    const teamsById = new Map<string, any>((teamsAll ?? []).map((t: any) => [t.id, t]));

    // Agrupa standings por competição
    const standByComp = new Map<string, any[]>();
    for (const r of standingsAll ?? []) {
      const arr = standByComp.get(r.competition_id) ?? [];
      arr.push(r);
      standByComp.set(r.competition_id, arr);
    }
    const sortStandings = (rows: any[]) =>
      [...rows].sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        const gdA = a.goals_for - a.goals_against;
        const gdB = b.goals_for - b.goals_against;
        if (gdB !== gdA) return gdB - gdA;
        if (b.goals_for !== a.goals_for) return b.goals_for - a.goals_for;
        return b.wins - a.wins;
      });

    // Movimentos por time: newDivIdx alvo
    const movement = new Map<string, { fromDiv: Division; toDiv: Division }>();
    const rankedByDiv = new Map<Division, any[]>();
    const championByDiv = new Map<Division, { id: string; name: string } | null>();
    const promotedByDiv = new Map<Division, { id: string; name: string }[]>();
    const relegatedByDiv = new Map<Division, { id: string; name: string }[]>();

    for (const div of DIVISION_ORDER) {
      const divIdx = DIVISION_ORDER.indexOf(div);
      const comp = compByDiv.get(div)!;
      const rows = sortStandings(standByComp.get(comp.id) ?? []);
      rankedByDiv.set(div, rows);

      const champTid = rows[0]?.team_id;
      championByDiv.set(
        div,
        champTid ? { id: champTid, name: teamsById.get(champTid)?.name ?? "—" } : null,
      );

      const promoted: { id: string; name: string }[] = [];
      const relegated: { id: string; name: string }[] = [];

      rows.forEach((row, idx) => {
        const pos = idx + 1;
        let toDivIdx = divIdx;
        // 1º Lendária (idx 4) não promove; 5ª Bronze (idx 0) não rebaixa
        if (pos <= 3 && divIdx < DIVISION_ORDER.length - 1) toDivIdx = divIdx + 1;
        else if (pos >= rows.length - 2 && divIdx > 0) toDivIdx = divIdx - 1;
        const toDiv = DIVISION_ORDER[toDivIdx];
        movement.set(row.team_id, { fromDiv: div, toDiv });
        const t = teamsById.get(row.team_id);
        if (toDivIdx > divIdx) promoted.push({ id: row.team_id, name: t?.name ?? "—" });
        else if (toDivIdx < divIdx) relegated.push({ id: row.team_id, name: t?.name ?? "—" });
      });

      promotedByDiv.set(div, promoted);
      relegatedByDiv.set(div, relegated);
    }

    // 4) Recompensas do jogador (posição na sua divisão atual)
    const playerTeam = (teamsAll ?? []).find((t: any) => t.is_player);
    if (!playerTeam) throw new Error("Time do jogador não encontrado.");
    const playerDiv = playerTeam.division as Division;
    const playerRanked = rankedByDiv.get(playerDiv) ?? [];
    const playerIdx = playerRanked.findIndex((r: any) => r.team_id === playerTeam.id);
    const position = playerIdx + 1;
    const playerIsChampion = position === 1;
    const winPrize = MATCH_PRIZE[playerDiv][0];
    const posMult =
      position >= 1 && position <= SEASON_POSITION_MULT.length
        ? SEASON_POSITION_MULT[position - 1]
        : 0;
    const prize = Math.round(winPrize * posMult);
    const championGems = playerIsChampion ? 50 : 0;

    const playerMove = movement.get(playerTeam.id)!;
    const previousDivision = playerMove.fromDiv;
    const newDivision = playerMove.toDiv;
    const promoted = DIVISION_ORDER.indexOf(newDivision) > DIVISION_ORDER.indexOf(previousDivision);
    const relegated = DIVISION_ORDER.indexOf(newDivision) < DIVISION_ORDER.indexOf(previousDivision);

    // Salários agora são cobrados por partida — nada a descontar aqui.
    const { data: acad } = await supabase
      .from("academies")
      .select("money, gems")
      .eq("trainer_id", trainer.id)
      .maybeSingle();
    await supabase
      .from("academies")
      .update({
        money: (acad?.money ?? 0) + prize,
        gems: (acad?.gems ?? 0) + championGems,
      })
      .eq("trainer_id", trainer.id);

    // XP de prestígio de fim de temporada
    if (playerIsChampion) await awardTrainerXp(supabase, trainer.id, "title", 1);
    if (promoted) await awardTrainerXp(supabase, trainer.id, "promotion", 1);



    const txs: any[] = [];
    if (prize > 0) txs.push({
      trainer_id: trainer.id,
      transaction_type: "income",
      category: "premio_temporada",
      amount: prize,
      description: `Prêmio de temporada — ${playerDiv} • ${position}º lugar`,
    });
    if (txs.length) await supabase.from("financial_transactions").insert(txs);

    // 5) FASE 2 — aplica tudo: fecha competições antigas, cria novas, move times, gera tabelas/calendários
    // Fecha competições antigas
    for (const div of DIVISION_ORDER) {
      const comp = compByDiv.get(div)!;
      const champ = championByDiv.get(div);
      await supabase
        .from("competitions")
        .update({ status: "finished", champion_team_id: champ?.id ?? null })
        .eq("id", comp.id);
    }

    // Encerra temporada atual e cria a próxima
    const { data: currentSeason, error: csErr } = await supabase
      .from("game_seasons")
      .select("id, season_number")
      .eq("id", seasonId)
      .single();
    if (csErr || !currentSeason) throw csErr ?? new Error("Temporada atual não encontrada.");
    await supabase
      .from("game_seasons")
      .update({ is_current: false, ended_at: new Date().toISOString() })
      .eq("id", currentSeason.id);
    const { data: newSeason, error: sErr } = await supabase
      .from("game_seasons")
      .insert({
        trainer_id: trainer.id,
        season_number: currentSeason.season_number + 1,
        is_current: true,
      })
      .select("id")
      .single();
    if (sErr) throw sErr;

    // Cria 5 novas competições
    const newCompByDiv = new Map<Division, string>();
    for (const div of DIVISION_ORDER) {
      const { data, error } = await supabase
        .from("competitions")
        .insert({
          trainer_id: trainer.id,
          season_id: newSeason.id,
          division: div,
          type: "league",
          status: "active",
        })
        .select("id")
        .single();
      if (error) throw error;
      newCompByDiv.set(div, data.id);
    }

    // Move todos os times para suas novas competições/divisões (atualização em lote por divisão de destino)
    const byNewDiv = new Map<Division, string[]>();
    for (const [teamId, mv] of movement) {
      const arr = byNewDiv.get(mv.toDiv) ?? [];
      arr.push(teamId);
      byNewDiv.set(mv.toDiv, arr);
    }
    for (const div of DIVISION_ORDER) {
      const ids = byNewDiv.get(div) ?? [];
      if (!ids.length) continue;
      const newCompId = newCompByDiv.get(div)!;
      const { error } = await supabase
        .from("teams")
        .update({ competition_id: newCompId, division: div })
        .in("id", ids);
      if (error) throw error;
    }

    // Gera standings zerados e novo calendário de 26 rodadas para cada divisão
    for (const div of DIVISION_ORDER) {
      const newCompId = newCompByDiv.get(div)!;
      const teamIds = byNewDiv.get(div) ?? [];
      if (teamIds.length !== LEAGUE_SIZE) {
        console.error(`Divisão ${div} ficou com ${teamIds.length} times (esperado ${LEAGUE_SIZE})`);
      }
      await supabase.from("standings").insert(
        teamIds.map((tid) => ({
          competition_id: newCompId,
          team_id: tid,
          division: div,
          points: 0, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0,
        })),
      );
      const schedule = generateSchedule(teamIds.length, true);
      const matchesRows: any[] = [];
      // Embaralha ordem dos times por seed determinístico para não repetir mesmos confrontos
      const seed = hashSeed(`${newCompId}:${div}`);
      const rng = mulberry32Local(seed);
      const shuffled = [...teamIds];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      schedule.forEach((round, rIdx) => {
        round.forEach(([h, a]) => {
          matchesRows.push({
            competition_id: newCompId,
            round: rIdx + 1,
            division: div,
            home_team_id: shuffled[h],
            away_team_id: shuffled[a],
            status: "scheduled",
            is_friendly: false,
          });
        });
      });
      const CHUNK = 200;
      for (let i = 0; i < matchesRows.length; i += CHUNK) {
        const { error } = await supabase.from("matches").insert(matchesRows.slice(i, i + CHUNK));
        if (error) throw error;
      }
    }

    // world_state
    await supabase
      .from("world_state")
      .upsert({ trainer_id: trainer.id, season_id: newSeason.id, current_round: 1, seeded: true });

    // Mensagem no inbox
    await insertMessage(
      supabase,
      trainer.id,
      "season",
      playerIsChampion
        ? `Campeão da ${playerDiv}! (+${championGems}💎)`
        : `Temporada encerrada — ${position}º lugar`,
      `Prêmio: $${prize.toLocaleString("pt-BR")}${promoted ? ` • Promovido para ${newDivision}` : relegated ? ` • Rebaixado para ${newDivision}` : ""}`,
    );

    // Resumo do mundo
    const worldSummary = DIVISION_ORDER.map((div) => ({
      division: div,
      champion: championByDiv.get(div),
      promoted: promotedByDiv.get(div) ?? [],
      relegated: relegatedByDiv.get(div) ?? [],
    })).reverse(); // Lendária no topo

    // Zera o breakdown de XP para começar a nova temporada
    await resetSeasonBreakdown(supabase, trainer.id);

    return {

      position,
      prize,
      championGems,
      salaries: 0,
      previousDivision,
      newDivision,
      promoted,
      relegated,
      playerIsChampion,
      newSeasonNumber: currentSeason.season_number + 1,
      championName: championByDiv.get(playerDiv)?.name ?? "—",
      worldSummary,
    };
  });

function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------- Simulação rápida para as outras divisões (por rodada) ----------

function fastPoisson(lambda: number, rng: () => number): number {
  // Aproximação para lambda pequeno (< 6): método de Knuth
  const L = Math.exp(-Math.max(0.1, lambda));
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L && k < 20);
  return Math.max(0, k - 1);
}

async function advanceOtherDivisionsForRound(
  supabase: any,
  trainerId: string,
  seasonId: string | null,
  playerCompetitionId: string,
  round: number,
) {
  if (!seasonId) return;
  // Todas as competições ativas da mesma temporada (exceto a do jogador)
  const { data: otherComps } = await supabase
    .from("competitions")
    .select("id, division")
    .eq("trainer_id", trainerId)
    .eq("type", "league")
    .eq("status", "active")
    .eq("season_id", seasonId)
    .neq("id", playerCompetitionId);
  if (!otherComps || !otherComps.length) return;

  for (const comp of otherComps) {
    const { data: matches } = await supabase
      .from("matches")
      .select("id, home_team_id, away_team_id")
      .eq("competition_id", comp.id)
      .eq("round", round)
      .eq("status", "scheduled");
    if (!matches || !matches.length) continue;

    // Carrega força dos times envolvidos (média overall do elenco)
    const teamIds = Array.from(new Set(matches.flatMap((m: any) => [m.home_team_id, m.away_team_id])));
    const { data: cr } = await supabase
      .from("creatures")
      .select("owner_team_id, overall")
      .in("owner_team_id", teamIds);
    const strength = new Map<string, number>();
    const totals = new Map<string, { sum: number; n: number }>();
    for (const c of cr ?? []) {
      const t = totals.get(c.owner_team_id) ?? { sum: 0, n: 0 };
      t.sum += c.overall; t.n += 1;
      totals.set(c.owner_team_id, t);
    }
    for (const [id, t] of totals) strength.set(id, t.n ? t.sum / t.n : 45);

    // Standings atuais da competição
    const { data: standRows } = await supabase
      .from("standings")
      .select("team_id, points, wins, draws, losses, goals_for, goals_against")
      .eq("competition_id", comp.id);
    const standMap = new Map<string, any>((standRows ?? []).map((r: any) => [r.team_id, r]));

    const matchUpdates: any[] = [];
    for (const m of matches) {
      const hs = strength.get(m.home_team_id) ?? 45;
      const as = strength.get(m.away_team_id) ?? 45;
      const rng = mulberry32Local(hashSeed(m.id));
      // Bônus de mando 5%, lambda base = strength/28
      const homeLambda = Math.max(0.2, (hs / 28) * 1.05);
      const awayLambda = Math.max(0.2, as / 28);
      const hg = fastPoisson(homeLambda, rng);
      const ag = fastPoisson(awayLambda, rng);
      matchUpdates.push({
        id: m.id,
        home_score: hg,
        away_score: ag,
        outcome: hg > ag ? "H" : hg < ag ? "A" : "D",
      });
      // Atualiza standings em memória
      const hRow = standMap.get(m.home_team_id);
      const aRow = standMap.get(m.away_team_id);
      if (hRow) {
        hRow.goals_for += hg; hRow.goals_against += ag;
        if (hg > ag) { hRow.wins++; hRow.points += 3; }
        else if (hg < ag) { hRow.losses++; }
        else { hRow.draws++; hRow.points += 1; }
      }
      if (aRow) {
        aRow.goals_for += ag; aRow.goals_against += hg;
        if (ag > hg) { aRow.wins++; aRow.points += 3; }
        else if (ag < hg) { aRow.losses++; }
        else { aRow.draws++; aRow.points += 1; }
      }
    }

    // Persiste partidas (uma a uma; volume pequeno: 7 por rodada)
    for (const u of matchUpdates) {
      await supabase
        .from("matches")
        .update({
          home_score: u.home_score,
          away_score: u.away_score,
          status: "finished",
          is_summary: true,
          played_at: new Date().toISOString(),
        })
        .eq("id", u.id);
    }
    // Persiste standings
    for (const [tid, row] of standMap) {
      await supabase
        .from("standings")
        .update({
          points: row.points, wins: row.wins, draws: row.draws, losses: row.losses,
          goals_for: row.goals_for, goals_against: row.goals_against,
        })
        .eq("competition_id", comp.id)
        .eq("team_id", tid);
    }
  }
}

function mulberry32Local(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const __z = z;
