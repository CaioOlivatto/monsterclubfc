import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { simulate, persistableSimulationEvents, generateCpuSideFor, type EngineSide, type EngineBestiary } from "./match-engine.server";

import { buildPlayerSideFromDb } from "./player-side.server";
import { applyPostMatchXp, insertMessage } from "./xp.server";
import { loadBestiary } from "./bestiary.server";
import { MATCH_REVENUE, totalMaintenancePerMatch, divisionalMatchSalary, computeAwayWinBonus, cupPhaseBonus, type Division as EconDivision } from "./economy";
import { adjustAcademyMoney } from "./academy-money.server";

// Prêmio por partida da Copa por divisão (V / E / D). Empate resolvido em pênaltis
// no motor, portanto D raramente é pago — mantido para compatibilidade.
const CUP_MATCH_PRIZE: Record<EconDivision, [number, number, number]> = {
  bronze:   [20_000,  8_000,  3_000],
  prata:    [36_000, 14_000,  5_000],
  ouro:     [64_000, 25_000,  9_000],
  diamante:[115_000, 46_000, 16_000],
  lendaria:[200_000, 80_000, 28_000],
};

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


const CUP_ROUND_NAMES: Record<number, string> = { 1: "Quartas", 2: "Semifinal", 3: "Final" };

async function getTrainer(supabase: any, userId: string) {
  const { data: trainer } = await supabase
    .from("trainers")
    .select("id, academy_name, division")
    .eq("user_id", userId)
    .maybeSingle();
  if (!trainer) throw new Error("Treinador não encontrado.");
  return trainer as { id: string; academy_name: string; division: EconDivision | null };
}

async function playerAverage(supabase: any, trainerId: string): Promise<number> {
  const { data } = await supabase.from("creatures").select("overall, salary_mult").eq("owner_trainer_id", trainerId);
  const list = (data ?? []) as { overall: number }[];
  if (!list.length) return 45;
  return Math.round(list.reduce((a, c) => a + c.overall, 0) / list.length);
}

function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}


export const getCup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const trainer = await getTrainer(supabase, userId);
    const { data: cup } = await supabase
      .from("competitions")
      .select("id, status, champion_team_id, created_at")
      .eq("trainer_id", trainer.id)
      .eq("type", "cup")
      .eq("status", "active")
      .maybeSingle();
    if (!cup) return { cup: null };

    const [teamsRes, matchesRes] = await Promise.all([
      supabase.from("teams").select("id, name, is_player, cpu_strength").eq("competition_id", cup.id),
      supabase
        .from("matches")
        .select("id, round, home_team_id, away_team_id, home_score, away_score, status, played_at")
        .eq("competition_id", cup.id)
        .order("round", { ascending: true }),
    ]);
    return { cup, teams: teamsRes.data ?? [], matches: matchesRes.data ?? [] };
  });

export const startCup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const trainer = await getTrainer(supabase, userId);

    const [existingResult, seasonResult, playerTeamResult, average] = await Promise.all([
      supabase
        .from("competitions")
        .select("id")
        .eq("trainer_id", trainer.id)
        .eq("type", "cup")
        .eq("status", "active")
        .maybeSingle(),
      supabase
        .from("game_seasons")
        .select("id")
        .eq("trainer_id", trainer.id)
        .eq("is_current", true)
        .maybeSingle(),
      supabase
        .from("teams")
        .select("id, name, division, color, colors, dominant_element")
        .eq("trainer_id", trainer.id)
        .eq("is_player", true)
        .maybeSingle(),
      playerAverage(supabase, trainer.id),
    ]);
    const { data: existing } = existingResult;
    if (existing) throw new Error("Já existe uma copa em andamento.");

    const { data: season } = seasonResult;
    if (!season) throw new Error("Sem temporada ativa. Inicie a liga primeiro.");

    // Time do jogador (da liga vigente) + divisão
    const { data: playerLeagueTeam } = playerTeamResult;
    if (!playerLeagueTeam) throw new Error("Você precisa ter uma liga ativa antes de disputar a copa.");
    const division = ((playerLeagueTeam.division as string) ?? "bronze") as
      "bronze" | "prata" | "ouro" | "diamante" | "lendaria";

    // 7 adversários sorteados entre os times reais da MESMA divisão do jogador
    const { data: divTeams } = await supabase
      .from("teams")
      .select("id, name, color, colors, dominant_element")
      .eq("division", division)
      .eq("is_player", false);
    const pool = (divTeams ?? []).slice();
    if (pool.length < 7) throw new Error("Divisão sem adversários suficientes para a copa.");
    const rng = mulberry(hashSeed(trainer.id + ":cup:" + season.id));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const opponents = pool.slice(0, 7);

    const { data: cup, error: cErr } = await supabase
      .from("competitions")
      .insert({
        trainer_id: trainer.id,
        season_id: season.id,
        division,
        type: "cup",
        status: "active",
      })
      .select("id")
      .single();
    if (cErr) throw cErr;

    const avg = average;
    // Cria as "cópias" dos times na competição da copa (mantém os nomes reais)
    const teamRows = [
      {
        competition_id: cup.id,
        trainer_id: trainer.id,
        is_player: true,
        name: playerLeagueTeam.name,
        color: playerLeagueTeam.color ?? null,
        colors: playerLeagueTeam.colors ?? null,
        dominant_element: playerLeagueTeam.dominant_element ?? null,
        division,
      },
      ...opponents.map((t: any, i: number) => ({
        competition_id: cup.id,
        trainer_id: null,
        is_player: false,
        is_cpu: true,
        name: t.name,
        color: t.color ?? null,
        colors: t.colors ?? null,
        dominant_element: t.dominant_element ?? null,
        division,
        cpu_strength: Math.max(25, Math.min(95, avg + (i - 3) * 5 + 6)),
      })),
    ];
    const { data: insertedTeams, error: itErr } = await supabase
      .from("teams")
      .insert(teamRows)
      .select("id, is_player, cpu_strength");
    if (itErr) throw itErr;

    const playerTeamCup = insertedTeams!.find((t: any) => t.is_player)!;
    const cpus = insertedTeams!
      .filter((t: any) => !t.is_player)
      .sort((a: any, b: any) => (a.cpu_strength ?? 0) - (b.cpu_strength ?? 0));
    const seeds = [playerTeamCup.id, ...cpus.map((c: any) => c.id)];
    const q = [
      [seeds[0], seeds[7]],
      [seeds[3], seeds[4]],
      [seeds[2], seeds[5]],
      [seeds[1], seeds[6]],
    ];
    const rows = q.map(([h, a]) => ({
      competition_id: cup.id,
      round: 1,
      home_team_id: h,
      away_team_id: a,
      status: "scheduled" as const,
      is_friendly: false,
    }));
    await supabase.from("matches").insert(rows);
    return { cup_id: cup.id };
  });

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Simula uma partida CPU-vs-CPU da copa (com pênaltis determinísticos em empate).
 * Idempotente: filtra por status='scheduled' no UPDATE.
 * Retorna vencedor para uso na geração da próxima rodada.
 */
async function simulateCupCpuMatch(
  supabase: any,
  match: { id: string; home_team_id: string; away_team_id: string },
  bestiary: EngineBestiary,
): Promise<{ winner: string; skipped: boolean }> {
  const { data: pair } = await supabase
    .from("teams")
    .select("id, name, cpu_strength")
    .in("id", [match.home_team_id, match.away_team_id]);
  const h = pair!.find((t: any) => t.id === match.home_team_id) as any;
  const a = pair!.find((t: any) => t.id === match.away_team_id) as any;
  const hs = generateCpuSideFor(hashSeed(h.id), h.id, h.name, (h.cpu_strength ?? 50) + 3, bestiary);
  const as = generateCpuSideFor(hashSeed(a.id), a.id, a.name, a.cpu_strength ?? 50, bestiary);
  let r = simulate(hs, as, hashSeed(match.id));
  let homeWinPen = false;
  if (r.home_score === r.away_score) {
    homeWinPen = (hashSeed(match.id + "pen") >>> 0) % 2 === 0;
    r = { ...r, home_score: r.home_score + (homeWinPen ? 1 : 0), away_score: r.away_score + (homeWinPen ? 0 : 1) };
  }
  const { data: claimed } = await supabase
    .from("matches")
    .update({
      home_score: r.home_score,
      away_score: r.away_score,
      status: "finished",
      played_at: new Date().toISOString(),
    })
    .eq("id", match.id)
    .eq("status", "scheduled")
    .select("id");
  const winner = r.home_score >= r.away_score ? match.home_team_id : match.away_team_id;
  return { winner, skipped: !claimed?.length };
}

/**
 * Se todas as partidas do round terminaram e a próxima rodada ainda não foi criada,
 * gera confrontos da próxima. Idempotente: só cria se `nextRound` estiver ausente.
 */
async function generateNextCupRoundIfReady(
  supabase: any,
  compId: string,
  currentRound: number,
): Promise<{ generated: boolean; champion?: string }> {
  if (currentRound >= 3) return { generated: false };
  const { data: roundMatches } = await supabase
    .from("matches")
    .select("id, home_team_id, away_team_id, home_score, away_score, status")
    .eq("competition_id", compId)
    .eq("round", currentRound)
    .order("id", { ascending: true });
  if (!roundMatches?.length) return { generated: false };
  if (!roundMatches.every((m: any) => m.status === "finished")) return { generated: false };

  // Se próxima rodada já existe, não recria
  const { count: existingNext } = await supabase
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("competition_id", compId)
    .eq("round", currentRound + 1);
  if ((existingNext ?? 0) > 0) return { generated: false };

  const winners = roundMatches.map((m: any) =>
    m.home_score >= m.away_score ? m.home_team_id : m.away_team_id,
  );
  const pairs: [string, string][] = [];
  for (let i = 0; i < winners.length; i += 2) pairs.push([winners[i], winners[i + 1]]);
  const nextRows = pairs.map(([h, a]) => ({
    competition_id: compId,
    round: currentRound + 1,
    home_team_id: h,
    away_team_id: a,
    status: "scheduled" as const,
    is_friendly: false,
  }));
  if (nextRows.length) await supabase.from("matches").insert(nextRows);
  return { generated: true };
}

/**
 * Recupera rodadas anteriores da copa cujas partidas CPU-vs-CPU ainda estão scheduled
 * (background falhou antes) e completa geração de próxima rodada se necessário.
 * Idempotente.
 */
async function recoverStaleCupRounds(supabase: any, compId: string, upToRound: number) {
  const { data: stale } = await supabase
    .from("matches")
    .select("id, round, home_team_id, away_team_id")
    .eq("competition_id", compId)
    .eq("status", "scheduled")
    .lt("round", upToRound);
  if (!stale?.length) return;
  console.warn(`[playNextCupMatch] RECUPERANDO ${stale.length} partidas de rodadas anteriores`);
  const bestiary = await loadEngineBestiary(supabase);
  const byRound = new Map<number, any[]>();
  for (const m of stale) {
    const arr = byRound.get(m.round) ?? [];
    arr.push(m);
    byRound.set(m.round, arr);
  }
  for (const [round, matches] of byRound) {
    await Promise.all(matches.map((m) => simulateCupCpuMatch(supabase, m, bestiary)));
    try { await generateNextCupRoundIfReady(supabase, compId, round); }
    catch (e) { console.error(`[recoverStaleCupRounds] geração de rodada ${round + 1} falhou`, e); }
  }
}

export const playNextCupMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const t0 = Date.now();
    const stamp = (label: string) =>
      console.log(`[playNextCupMatch] +${Date.now() - t0}ms ${label}`);
    const { supabase, userId } = context;
    const trainer = await getTrainer(supabase, userId);
    const { data: cup } = await supabase
      .from("competitions")
      .select("id, division")
      .eq("trainer_id", trainer.id)
      .eq("type", "cup")
      .eq("status", "active")
      .maybeSingle();
    if (!cup) throw new Error("Nenhuma copa ativa.");

    const { data: playerTeam } = await supabase
      .from("teams")
      .select("id")
      .eq("competition_id", cup.id)
      .eq("is_player", true)
      .maybeSingle();
    if (!playerTeam) throw new Error("Time do jogador não está na copa.");

    const { data: next } = await supabase
      .from("matches")
      .select("id, round, home_team_id, away_team_id")
      .eq("competition_id", cup.id)
      .eq("status", "scheduled")
      .or(`home_team_id.eq.${playerTeam.id},away_team_id.eq.${playerTeam.id}`)
      .order("round", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!next) throw new Error("Você não tem mais partidas nesta copa.");

    // Recuperação de rodadas antigas pode acontecer enquanto buscamos os dados
    // desta partida. Ela ainda é aguardada antes do claim idempotente abaixo.
    const recoverPromise = recoverStaleCupRounds(supabase, cup.id, next.round as number)
      .then(() => stamp("recover"))
      .catch((e) => console.error("[playNextCupMatch] ERRO na recuperação:", e));
    const [{ data: teams }, bestiary] = await Promise.all([
      supabase
        .from("teams")
        .select("id, name, is_player, cpu_strength")
        .in("id", [next.home_team_id, next.away_team_id]),
      bestiaryPromise,
    ]);
    const home = teams!.find((t: any) => t.id === next.home_team_id) as any;
    const away = teams!.find((t: any) => t.id === next.away_team_id) as any;

    const playerSideRef: { current: EngineSide | null } = { current: null };
    async function side(team: any): Promise<EngineSide> {
      if (team.is_player) {
        const s = await buildPlayerSideFromDb(supabase, trainer.id, team.id, team.name);
        playerSideRef.current = s;
        return s;
      }
      return generateCpuSideFor(hashSeed(team.id), team.id, team.name, team.cpu_strength ?? 50, bestiary);
    }
    stamp("bestiary");
    const [homeSide, awaySide] = await Promise.all([side(home), side(away)]);
    await recoverPromise;
    let result = simulate(homeSide, awaySide, hashSeed(next.id));
    if (result.home_score === result.away_score) {
      const seed = hashSeed(next.id + "pen");
      const homeWin = (seed >>> 0) % 2 === 0;
      if (homeWin) result = { ...result, home_score: result.home_score + 1 };
      else result = { ...result, away_score: result.away_score + 1 };
    }
    stamp("simulate");

    // IDEMPOTÊNCIA: só finaliza se ainda scheduled
    const { data: claimed, error: uErr } = await supabase
      .from("matches")
      .update({
        home_score: result.home_score,
        away_score: result.away_score,
        status: "finished",
        clima: result.weather,
        played_at: new Date().toISOString(),
      })
      .eq("id", next.id)
      .eq("status", "scheduled")
      .select("id");
    if (uErr) throw uErr;
    if (!claimed?.length) throw new Error("Esta partida já foi iniciada em outra aba. Recarregue.");
    stamp("claim");

    // ===== POST-SIM: events + xp/message em paralelo =====
    const eventsToInsert = persistableSimulationEvents(result).map((e: any) => ({
      match_id: next.id,
      minute: e.minute,
      event_type: e.event_type,
      description: e.description,
      actor_creature_id:
        e.actor_creature_id && !e.actor_creature_id.startsWith("cpu-") ? e.actor_creature_id : null,
      actor_team_id: e.actor_team_id,
    }));
    const eventsJob = eventsToInsert.length
      ? supabase.from("match_events").insert(eventsToInsert).then((r: any) => {
          if (r.error) console.error("[playNextCupMatch] events insert", r.error);
        })
      : Promise.resolve();

    const xpMsgJob = (async () => {
      try {
        const playerSide: EngineSide | null = playerSideRef.current;
        if (!playerSide) return;
        const isHome = home.is_player;
        const playerGf = isHome ? result.home_score : result.away_score;
        const playerGa = isHome ? result.away_score : result.home_score;
        const outcomeXp: "W" | "D" | "L" =
          playerGf > playerGa ? "W" : playerGf < playerGa ? "L" : "D";
        const starterIds = playerSide.starters.map((s) => s.creature.id);
        const enteredReserveIds = result.used_bench_ids.filter((id: string) =>
          playerSide.bench.some((b) => b.creature.id === id),
        );
        const unusedReserveIds = playerSide.bench
          .map((b) => b.creature.id)
          .filter((id) => !enteredReserveIds.includes(id));
        const opponentName = isHome ? away.name : home.name;
        const roundLabel = CUP_ROUND_NAMES[next.round as number] ?? `Rodada ${next.round}`;
        await applyPostMatchXp(supabase, trainer.id, {
          starterIds, enteredReserveIds, unusedReserveIds,
          outcome: outcomeXp,
          energy_loss: result.energy_loss,
          goalsByCreature: result.goals_by_creature,
          injuries: result.injuries.filter((i) => i.team_id === playerTeam.id),
          isOfficial: true,
        });
        // inbox: fire-and-forget
        void insertMessage(
          supabase, trainer.id, "match",
          `Copa — ${roundLabel}: ${outcomeXp === "W" ? "Vitória" : "Derrota"} vs ${opponentName}`,
          `${isHome ? home.name : away.name} ${playerGf} x ${playerGa} ${isHome ? away.name : home.name} — clima: ${result.weather}.`,
        ).catch((e) => console.error("[playNextCupMatch] insertMessage bg error", e));
      } catch (e) {
        console.error("[playNextCupMatch] xp/message error", e);
      }
    })();

    const financeJob = (async () => {
      try {
        const isHome = home.is_player;
        const playerGf = isHome ? result.home_score : result.away_score;
        const playerGa = isHome ? result.away_score : result.home_score;
        const outcome: "W" | "D" | "L" =
          playerGf > playerGa ? "W" : playerGf < playerGa ? "L" : "D";
        const division = ((cup as any).division ?? "bronze") as EconDivision;
        const [pw, pd, pl] = CUP_MATCH_PRIZE[division];
        const matchPrize = outcome === "W" ? pw : outcome === "D" ? pd : pl;
        const rev = MATCH_REVENUE[division];

        const [rosterRes, bldgsRes] = await Promise.all([
          supabase.from("creatures").select("overall, salary_mult").eq("owner_trainer_id", trainer.id),
          supabase.from("buildings").select("building_type, level").eq("trainer_id", trainer.id),
        ]);
        const roster = (rosterRes as any).data as Array<{ overall: number }> | null;
        const bldgs = (bldgsRes as any).data as Array<{ building_type: string; level: number }> | null;

        const salaries = (roster ?? []).reduce((a: number, c: any) => a + Math.round(divisionalMatchSalary(c.overall ?? 40, division) * (c.salary_mult ?? 1)), 0);
        const maintenance = totalMaintenancePerMatch(division, bldgs ?? []);
        const awayWinBonus = !isHome && outcome === "W"
          ? computeAwayWinBonus(salaries + maintenance, rev.tv + rev.sponsor + rev.merch, matchPrize)
          : 0;

        const totalIncome = matchPrize + rev.tv + rev.sponsor + rev.merch + awayWinBonus;
        const totalExpense = salaries + maintenance;
        const net = totalIncome - totalExpense;

        const roundLabel = CUP_ROUND_NAMES[next.round as number] ?? `R${next.round}`;
        const roundTag = `Copa — ${roundLabel}`;
        const label = outcome === "W" ? "vitória" : outcome === "D" ? "empate" : "derrota";
        const txs: any[] = [
          { trainer_id: trainer.id, transaction_type: "income", category: "premio_partida",
            amount: matchPrize, description: `${roundTag} — premiação por ${label}` },
          { trainer_id: trainer.id, transaction_type: "income", category: "tv",
            amount: rev.tv, description: `${roundTag} — Direitos de TV` },
          { trainer_id: trainer.id, transaction_type: "income", category: "patrocinio",
            amount: rev.sponsor, description: `${roundTag} — Patrocínio` },
          { trainer_id: trainer.id, transaction_type: "income", category: "merch",
            amount: rev.merch, description: `${roundTag} — Merchandising` },
        ];
        if (awayWinBonus > 0) txs.push({ trainer_id: trainer.id, transaction_type: "income",
          category: "bonus_visitante", amount: awayWinBonus, description: `${roundTag} — Prêmio de vitória fora` });
        if (salaries > 0) txs.push({ trainer_id: trainer.id, transaction_type: "expense",
          category: "salarios", amount: salaries, description: `${roundTag} — Salários` });
        if (maintenance > 0) txs.push({ trainer_id: trainer.id, transaction_type: "expense",
          category: "manutencao", amount: maintenance, description: `${roundTag} — Manutenção` });

        const financeSummary = {
          outcome, division, round: next.round, is_home: isHome,
          competition: "cup",
          income: { match_prize: matchPrize, tv: rev.tv, sponsor: rev.sponsor, merch: rev.merch, gate: 0, away_win_bonus: awayWinBonus },
          expense: { salaries, maintenance },
          totals: { income: totalIncome, expense: totalExpense, net },
        };

        await Promise.all([
          adjustAcademyMoney(supabase, trainer.id, net),
          supabase.from("financial_transactions").insert(txs),
          supabase.from("matches").update({ finance_summary: financeSummary }).eq("id", next.id),
        ]);
      } catch (e) {
        console.error("[playNextCupMatch] finance error", e);
      }
    })();

    await Promise.all([eventsJob, xpMsgJob, financeJob]);
    stamp("player match persisted");

    return {
      match_id: next.id,
      round: next.round as number,
      round_name: CUP_ROUND_NAMES[next.round as number],
      background_advance: {
        competition_id: cup.id,
        round: next.round as number,
      },
    };
  });

/**
 * Simula as outras partidas da mesma rodada (CPU-vs-CPU) e gera próxima rodada
 * se todas terminarem. Também paga prêmio e fecha copa se a final for concluída.
 * Chamada em background pelo cliente. Idempotente.
 */
export const advanceCupRoundBackground = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      competition_id: z.string().uuid(),
      round: z.number().int().min(1).max(3),
    }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const t0 = Date.now();
    const stamp = (label: string) =>
      console.log(`[advanceCupRoundBackground] +${Date.now() - t0}ms ${label}`);
    const { supabase, userId } = context;
    const trainer = await getTrainer(supabase, userId);
    const { competition_id, round } = data;

    const { data: cup } = await supabase
      .from("competitions")
      .select("id, status, division")
      .eq("id", competition_id)
      .eq("trainer_id", trainer.id)
      .eq("type", "cup")
      .maybeSingle();
    if (!cup) return { ok: false, reason: "not_found" };

    const { data: sameRound } = await supabase
      .from("matches")
      .select("id, home_team_id, away_team_id")
      .eq("competition_id", competition_id)
      .eq("round", round)
      .eq("status", "scheduled");

    if (sameRound?.length) {
      const bestiary = await loadEngineBestiary(supabase);
      stamp("bestiary");
      try {
        await Promise.all(sameRound.map((m: any) => simulateCupCpuMatch(supabase, m, bestiary)));
        stamp(`sameRound simulated (${sameRound.length})`);
      } catch (e) {
        console.error(`[advanceCupRoundBackground] ERRO ao simular partidas da rodada ${round}:`, e);
        return { ok: false, reason: "sameRound_failed", error: String((e as any)?.message ?? e) };
      }
    }

    // Gera próxima rodada / fecha copa
    try {
      if (round < 3) {
        await generateNextCupRoundIfReady(supabase, competition_id, round);
        stamp("next round generated (if ready)");
      } else {
        // Round 3 = final; se todas terminaram, define campeão e paga prêmio
        const { data: finalMatches } = await supabase
          .from("matches")
          .select("id, home_team_id, away_team_id, home_score, away_score, status")
          .eq("competition_id", competition_id)
          .eq("round", 3);
        if (finalMatches?.length && finalMatches.every((m: any) => m.status === "finished")) {
          const f = finalMatches[0] as any;
          const championTeamId =
            (f.home_score ?? 0) >= (f.away_score ?? 0) ? f.home_team_id : f.away_team_id;
          const { data: updated } = await supabase
            .from("competitions")
            .update({ status: "finished", champion_team_id: championTeamId })
            .eq("id", competition_id)
            .eq("status", "active")
            .select("id");
          if (updated?.length) {
            const { data: playerTeam } = await supabase
              .from("teams").select("id").eq("competition_id", competition_id).eq("is_player", true).maybeSingle();
            const { data: playerMatches } = await supabase
              .from("matches")
              .select("round, home_team_id, away_team_id, home_score, away_score")
              .eq("competition_id", competition_id)
              .or(`home_team_id.eq.${playerTeam?.id},away_team_id.eq.${playerTeam?.id}`);
            let playerWonFinal = false;
            const reachedFinal = (playerMatches ?? []).some((m: any) => m.round === 3);
            const reachedSemi = (playerMatches ?? []).some((m: any) => m.round === 2);
            for (const m of playerMatches ?? []) {
              if (m.round !== 3) continue;
              const isHome = m.home_team_id === playerTeam?.id;
              const gf = (isHome ? m.home_score : m.away_score) ?? 0;
              const ga = (isHome ? m.away_score : m.home_score) ?? 0;
              if (gf >= ga) playerWonFinal = true;
            }
            let prize = 0;
            let label = "";
            const prizeDivision = ((cup as any).division ?? "bronze") as EconDivision;
            if (playerWonFinal)   { prize = cupPhaseBonus(prizeDivision, "champion"); label = "Campeão da Copa"; }
            else if (reachedFinal){ prize = cupPhaseBonus(prizeDivision, "runnerUp"); label = "Vice-campeão da Copa"; }
            else if (reachedSemi) { prize = cupPhaseBonus(prizeDivision, "semi");     label = "Semifinalista da Copa"; }
            else                  { prize = cupPhaseBonus(prizeDivision, "qf");       label = "Quartas de final da Copa"; }
            if (prize > 0) {
              const { data: acad } = await supabase
                .from("academies").select("money").eq("trainer_id", trainer.id).maybeSingle();
              await adjustAcademyMoney(supabase, trainer.id, prize);
              await supabase.from("financial_transactions").insert({
                trainer_id: trainer.id,
                transaction_type: "income",
                amount: prize,
                description: `Copa — ${label}`,
              });
            }
          }
          stamp("final closed");
        }
      }
    } catch (e) {
      console.error(`[advanceCupRoundBackground] ERRO ao gerar próxima rodada / fechar copa:`, e);
      return { ok: false, reason: "progression_failed", error: String((e as any)?.message ?? e) };
    }
    return { ok: true };
  });
