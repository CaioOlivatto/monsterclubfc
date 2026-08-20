/* eslint-disable @typescript-eslint/no-explicit-any */
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
import { stadiumCapacity, stadiumRevenueMultiplier } from "./buildings.server";
import { buildAttendance, rosterMoraleAverage } from "./attendance";
import { buildPlayerSideFromDb } from "./player-side.server";
import { applyPostMatchXp, insertMessage } from "./xp.server";
import { awardTrainerXp, resetSeasonBreakdown } from "./trainer-xp.server";
import {
  BALANCE_VERSION,
  MATCH_REVENUE,
  TICKET_PRICE,
  revenueCapacity,
  totalMaintenancePerMatch,
  divisionalMatchSalary,
  eliteRenewalFee,
  eliteInfrastructureRenewalFee,
  eliteTreasuryReserveFee,
  computeAwayWinBonus,
  type Division as EconDivision,
} from "./economy";
import { loadBestiary } from "./bestiary.server";
import { DIVISION_STRENGTH, type DivisionSlug } from "./world/catalog";
import { applySeasonOutcome } from "./career-transition.server";
import { adjustAcademyMoney } from "./academy-money.server";

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
    .select("id, academy_name, current_team_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!trainer) throw new Error("Treinador não encontrado.");
  return trainer as { id: string; academy_name: string; current_team_id: string | null };
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
  const { data } = await supabase
    .from("creatures")
    .select("overall, salary_mult")
    .eq("owner_trainer_id", trainerId);
  const list = (data ?? []) as { overall: number }[];
  if (!list.length) return 45;
  return Math.round(list.reduce((a, c) => a + c.overall, 0) / list.length);
}

const DIVISION_ORDER = ["bronze", "prata", "ouro", "diamante", "lendaria"] as const;
type Division = (typeof DIVISION_ORDER)[number];
type PlayerLeagueTeam = { id: string; competition_id: string | null; division?: Division | null };

// Prêmio por partida na liga por divisão (V / E / D) — Balanceamento §2.1
const MATCH_PRIZE: Record<Division, [number, number, number]> = {
  bronze: [15_000, 6_000, 2_000],
  prata: [28_000, 11_000, 4_000],
  ouro: [50_000, 20_000, 7_000],
  diamante: [90_000, 36_000, 13_000],
  lendaria: [160_000, 64_000, 24_000],
};

// Liga de 14 times, 26 rodadas (turno e returno) — Balanceamento §1.2 e §8.
const LEAGUE_SIZE = 14;
const CPU_COUNT = LEAGUE_SIZE - 1;

// Multiplicador aplicado sobre o prêmio de vitória da divisão (fim de temporada)
// §2.3: 1º ×10 · 2º ×6 · 3º–4º ×3 · 5º–6º ×1,5 · 7º–8º ×0,5 · demais 0
const SEASON_POSITION_MULT: number[] = [10, 6, 3, 3, 1.5, 1.5, 0.5, 0.5, 0, 0, 0, 0, 0, 0];

// Salário por temporada baseado no overall (aprox. tier de estrelas)
function seasonSalary(overall: number): number {
  if (overall < 30) return 4_000; // 0,5–1★
  if (overall < 50) return 9_000; // 1,5–2★
  if (overall < 70) return 20_000; // 2,5–3★
  if (overall < 90) return 45_000; // 3,5–4★
  return 90_000; // 4,5–5★
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
        .in(
          "id",
          myCreatures.map((c: any) => c.id),
        );
    }
    const { data: playerTeamRow } = await supabase
      .from("teams")
      .select("name")
      .eq("id", playerTeamId)
      .maybeSingle();
    if (playerTeamRow?.name) {
      await supabase
        .from("trainers")
        .update({ academy_name: playerTeamRow.name })
        .eq("id", trainer.id);
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
    z
      .object({ division: z.enum(["bronze", "prata", "ouro", "diamante", "lendaria"]).optional() })
      .parse(raw ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const trainer = await getTrainer(supabase, userId);

    // Todas as competições ativas da temporada corrente do treinador (5 divisões)
    const allCompsPromise = supabase
      .from("competitions")
      .select("id, division, season_id, status, champion_team_id")
      .eq("trainer_id", trainer.id)
      .eq("type", "league")
      .eq("status", "active");
    const currentTeamPromise = trainer.current_team_id
      ? supabase
          .from("teams")
          .select("id, competition_id, division")
          .eq("id", trainer.current_team_id)
          .eq("trainer_id", trainer.id)
          .maybeSingle()
      : Promise.resolve({ data: null });
    const [{ data: allComps }, { data: currentTeam }] = await Promise.all([
      allCompsPromise,
      currentTeamPromise,
    ]);
    if (!allComps || !allComps.length) return { competition: null };

    // Divisão do jogador = a que tem o time do jogador
    let playerTeamRow = currentTeam as PlayerLeagueTeam | null;
    if (!playerTeamRow?.competition_id) {
      const { data: fallbackTeam } = await supabase
        .from("teams")
        .select("id, competition_id, division")
        .eq("trainer_id", trainer.id)
        .eq("is_player", true)
        .in(
          "competition_id",
          allComps.map((c: any) => c.id),
        )
        .limit(1)
        .maybeSingle();
      playerTeamRow = fallbackTeam as PlayerLeagueTeam | null;
    }

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
    const t0 = Date.now();
    const stamp = (label: string) =>
      console.log(`[playNextLeagueMatch] +${Date.now() - t0}ms ${label}`);
    const { supabase, userId } = context;
    // Bestiário é independente do trainer — dispara já em paralelo.
    const bestiaryPromise = loadEngineBestiary(supabase);
    const trainer = await getTrainer(supabase, userId);
    stamp("trainer");

    let playerTeam: null | { id: string; competition_id: string | null } = null;
    if (trainer.current_team_id) {
      const { data: currentTeam } = await supabase
        .from("teams")
        .select("id, competition_id")
        .eq("id", trainer.current_team_id)
        .eq("trainer_id", trainer.id)
        .maybeSingle();
      playerTeam = currentTeam ?? null;
    }
    if (!playerTeam?.competition_id) {
      const { data: fallbackTeam } = await supabase
        .from("teams")
        .select("id, competition_id")
        .eq("trainer_id", trainer.id)
        .eq("is_player", true)
        .not("competition_id", "is", null)
        .limit(1)
        .maybeSingle();
      playerTeam = fallbackTeam ?? null;
    }
    if (!playerTeam?.competition_id) throw new Error("Time do jogador não encontrado nesta liga.");

    const { data: competition } = await supabase
      .from("competitions")
      .select("id, division, season_id")
      .eq("id", playerTeam.competition_id)
      .eq("trainer_id", trainer.id)
      .eq("type", "league")
      .eq("status", "active")
      .maybeSingle();
    if (!competition) throw new Error("Nenhuma liga em andamento.");
    stamp("competition");

    // recover stale (independente de `next`) roda em paralelo com o próximo bloco
    const recoverPromise = recoverStaleRounds(
      supabase,
      trainer.id,
      competition.season_id,
      competition.id,
    )
      .then(() => stamp("recover stale"))
      .catch((e) =>
        console.error("[playNextLeagueMatch] ERRO na recuperação de rodadas anteriores:", e),
      );

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

    const bestiary = await bestiaryPromise;
    stamp("bestiary");
    const playerSideRef: { current: EngineSide | null } = { current: null };
    async function buildSide(team: any): Promise<EngineSide> {
      if (team.is_player) {
        const side = await buildPlayerSideFromDb(supabase, trainer.id, team.id, team.name);
        playerSideRef.current = side;
        return side;
      }
      const seed = hashSeed(team.id);
      const division = ((competition as any).division ?? "bronze") as DivisionSlug;
      return generateCpuSideFor(
        seed,
        team.id,
        team.name,
        team.cpu_strength ?? (DIVISION_STRENGTH as any)[division],
        bestiary,
      );
    }
    // Build both sides em paralelo — player usa DB, CPU é sync.
    const [homeSide, awaySide] = await Promise.all([buildSide(home), buildSide(away)]);
    // Garante recovery finalizado antes de claim (idempotência).
    await recoverPromise;
    stamp("sides");
    const seed = hashSeed(next.id);
    const result = simulate(homeSide, awaySide, seed);
    stamp("simulate");

    // IDEMPOTÊNCIA: só marca como finished se ainda estiver scheduled. Se outra chamada
    // concorrente já assumiu essa partida, abortamos aqui e não duplicamos XP/finanças.
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
    if (!claimed || claimed.length === 0) {
      throw new Error("Esta partida já foi iniciada em outra aba. Recarregue a página.");
    }

    stamp("claim");

    // ============ POST-SIMULATION: TUDO EM PARALELO ============
    // 4 blocos independentes (events / standings / payoff / xp+message).
    // Cada bloco já é internamente paralelo com Promise.all.
    const isHome = playerTeam.id === home.id;
    const playerGf = isHome ? result.home_score : result.away_score;
    const playerGa = isHome ? result.away_score : result.home_score;
    const outcomeXp: "W" | "D" | "L" = playerGf > playerGa ? "W" : playerGf < playerGa ? "L" : "D";

    // Bloco 1: match_events (bulk insert, uma round-trip)
    const eventsToInsert = persistableSimulationEvents(result).map((e) => ({
      match_id: next.id,
      minute: e.minute,
      event_type: e.event_type,
      description: e.description,
      actor_creature_id:
        e.actor_creature_id && !e.actor_creature_id.startsWith("cpu-") ? e.actor_creature_id : null,
      actor_team_id: e.actor_team_id,
    }));
    const t1 = Date.now();
    const substamp = (label: string) =>
      console.log(`[playNextLeagueMatch·persist] +${Date.now() - t1}ms ${label}`);
    const eventsJob = (async () => {
      if (!eventsToInsert.length) return;
      const r: any = await supabase.from("match_events").insert(eventsToInsert);
      if (r.error) console.error("[playNextLeagueMatch] events insert", r.error);
      substamp("events");
    })();

    // Bloco 2: standings (1 SELECT + 2 UPDATEs paralelos)
    const standingsJob = (async () => {
      const updates: Array<{ team_id: string; gf: number; ga: number; result: "W" | "D" | "L" }> = [
        {
          team_id: home.id,
          gf: result.home_score,
          ga: result.away_score,
          result:
            result.home_score > result.away_score
              ? "W"
              : result.home_score < result.away_score
                ? "L"
                : "D",
        },
        {
          team_id: away.id,
          gf: result.away_score,
          ga: result.home_score,
          result:
            result.away_score > result.home_score
              ? "W"
              : result.away_score < result.home_score
                ? "L"
                : "D",
        },
      ];
      const { data: rows } = await supabase
        .from("standings")
        .select("team_id, points, wins, draws, losses, goals_for, goals_against")
        .eq("competition_id", competition.id)
        .in("team_id", [home.id, away.id]);
      const byTeam = new Map<string, any>((rows ?? []).map((r: any) => [r.team_id, r]));
      await Promise.all(
        updates.map((u) => {
          const row = byTeam.get(u.team_id);
          if (!row) return Promise.resolve();
          return supabase
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
        }),
      );
      substamp("standings");
    })();

    // Bloco 3: financeiro (reads paralelas, writes paralelas)
    const payoffJob = (async () => {
      try {
        const outcome = outcomeXp;
        const division = (competition.division as Division) ?? "bronze";
        const [pw, pd, pl] = MATCH_PRIZE[division];
        const matchPrize = outcome === "W" ? pw : outcome === "D" ? pd : pl;
        const rev = MATCH_REVENUE[division];

        const [bldgsRes, standRowsRes, rosterRes, arenaRes] = await Promise.all([
          supabase.from("buildings").select("building_type, level").eq("trainer_id", trainer.id),
          isHome
            ? supabase
                .from("standings")
                .select("team_id, points, goals_for, goals_against")
                .eq("competition_id", competition.id)
            : Promise.resolve({ data: null }),
          supabase
            .from("creatures")
            .select("overall, morale, salary_mult")
            .eq("owner_trainer_id", trainer.id),
          (supabase as any)
            .from("arena_profiles")
            .select("stadium_damage_pct, repair_completes_at")
            .eq("trainer_id", trainer.id)
            .maybeSingle(),
        ]);
        const bldgs = (bldgsRes as any).data as Array<{
          building_type: string;
          level: number;
        }> | null;
        const standRows = (standRowsRes as any).data as any[] | null;
        const roster = (rosterRes as any).data as Array<{
          overall: number;
          morale?: number | null;
        }> | null;

        let gate = 0;
        let stadiumLevel = 0;
        let attendanceInfo: ReturnType<typeof buildAttendance> | null = null;
        if (isHome) {
          stadiumLevel = (bldgs ?? []).find((b) => b.building_type === "estadio")?.level ?? 0;
          const arenaDamage =
            (arenaRes as any).data?.repair_completes_at &&
            new Date((arenaRes as any).data.repair_completes_at).getTime() > Date.now()
              ? Number((arenaRes as any).data.stadium_damage_pct ?? 0)
              : 0;
          const capacity = Math.round(
            revenueCapacity(division as EconDivision, stadiumCapacity(stadiumLevel)) *
              (1 - arenaDamage / 100),
          );
          // Ocupação = clamp(10 + moral_média × 0,9, 10, 100) ± 5% de ruído.
          // Substitui a fillRate fixa por posição — spec Ocupacao-Estadio-Moral.
          const moraleAvg = rosterMoraleAverage(roster ?? []);
          attendanceInfo = buildAttendance(capacity, moraleAvg, Math.random);
          gate = Math.round(
            attendanceInfo.attendance * TICKET_PRICE[division] * stadiumRevenueMultiplier(stadiumLevel),
          );
        }

        const salaries = (roster ?? []).reduce(
          (a: number, c: any) =>
            a + Math.round(divisionalMatchSalary(c.overall ?? 40, division) * (c.salary_mult ?? 1)),
          0,
        );
        const maintenance = totalMaintenancePerMatch(division as EconDivision, bldgs ?? []);
        const awayWinBonus =
          !isHome && outcome === "W"
            ? computeAwayWinBonus(
                salaries + maintenance,
                rev.tv + rev.sponsor + rev.merch,
                matchPrize,
              )
            : 0;

        const totalIncome = matchPrize + rev.tv + rev.sponsor + rev.merch + gate + awayWinBonus;
        const totalExpense = salaries + maintenance;
        const net = totalIncome - totalExpense;

        const label = outcome === "W" ? "vitória" : outcome === "D" ? "empate" : "derrota";
        const roundTag = `Rodada ${next.round}`;
        const txs: any[] = [
          {
            trainer_id: trainer.id,
            transaction_type: "income",
            category: "premio_partida",
            amount: matchPrize,
            description: `${roundTag} — premiação por ${label} (${division})`,
          },
          {
            trainer_id: trainer.id,
            transaction_type: "income",
            category: "tv",
            amount: rev.tv,
            description: `${roundTag} — Direitos de TV`,
          },
          {
            trainer_id: trainer.id,
            transaction_type: "income",
            category: "patrocinio",
            amount: rev.sponsor,
            description: `${roundTag} — Patrocínio`,
          },
          {
            trainer_id: trainer.id,
            transaction_type: "income",
            category: "merch",
            amount: rev.merch,
            description: `${roundTag} — Merchandising`,
          },
        ];
        if (isHome && gate > 0) {
          txs.push({
            trainer_id: trainer.id,
            transaction_type: "income",
            category: "bilheteria",
            amount: gate,
            description: `${roundTag} — Bilheteria (estádio nv.${stadiumLevel})`,
          });
        }
        if (awayWinBonus > 0) {
          txs.push({
            trainer_id: trainer.id,
            transaction_type: "income",
            category: "bonus_visitante",
            amount: awayWinBonus,
            description: `${roundTag} — Prêmio de vitória fora`,
          });
        }
        if (salaries > 0) {
          txs.push({
            trainer_id: trainer.id,
            transaction_type: "expense",
            category: "salarios",
            amount: salaries,
            description: `${roundTag} — Salários (${(roster ?? []).length} criaturas)`,
          });
        }
        if (maintenance > 0) {
          txs.push({
            trainer_id: trainer.id,
            transaction_type: "expense",
            category: "manutencao",
            amount: maintenance,
            description: `${roundTag} — Manutenção de infraestrutura`,
          });
        }

        const financeSummary = {
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
            away_win_bonus: awayWinBonus,
          },
          expense: { salaries, maintenance },
          totals: { income: totalIncome, expense: totalExpense, net },
          attendance: attendanceInfo, // { capacity, attendance, occupancy, morale_avg, label } | null
        };
        // 3 writes em paralelo
        await Promise.all([
          adjustAcademyMoney(supabase, trainer.id, net),
          supabase.from("financial_transactions").insert(txs),
          supabase
            .from("matches")
            .update({ finance_summary: financeSummary as any })
            .eq("id", next.id),
        ]);
      } catch (e) {
        console.error("[playNextLeagueMatch] payoff error", e);
      }
      substamp("payoff");
    })();

    // Bloco 4: XP + mensagem de resultado
    const xpMsgJob = (async () => {
      try {
        const side: EngineSide | null = playerSideRef.current;
        const opponentName = isHome ? away.name : home.name;
        const tXpStart = Date.now();
        const xpPromise = side
          ? applyPostMatchXp(supabase, trainer.id, {
              starterIds: side.starters.map((s) => s.creature.id),
              enteredReserveIds: result.used_bench_ids.filter((id: string) =>
                side.bench.some((b) => b.creature.id === id),
              ),
              unusedReserveIds: side.bench
                .map((b) => b.creature.id)
                .filter((id) => !result.used_bench_ids.includes(id)),
              outcome: outcomeXp,
              energy_loss: result.energy_loss,
              goalsByCreature: result.goals_by_creature,
              injuries: result.injuries.filter((i) => i.team_id === playerTeam.id),
              isOfficial: true,
            })
          : Promise.resolve();
        await xpPromise;
        console.log(`[playNextLeagueMatch·persist] xp only +${Date.now() - tXpStart}ms`);
        // Mensagem da inbox NÃO é hot-path: fire-and-forget.
        void insertMessage(
          supabase,
          trainer.id,
          "match",
          `Rodada ${next.round}: ${outcomeXp === "W" ? "Vitória" : outcomeXp === "D" ? "Empate" : "Derrota"} vs ${opponentName}`,
          `${isHome ? home.name : away.name} ${playerGf} x ${playerGa} ${isHome ? away.name : home.name} — clima: ${result.weather}.`,
        ).catch((e) => console.error("[playNextLeagueMatch] insertMessage bg error", e));
      } catch (e) {
        console.error("[playNextLeagueMatch] xp/message error", e);
      }
      substamp("xp (message deferred)");
    })();

    await Promise.all([eventsJob, standingsJob, payoffJob, xpMsgJob]);
    stamp("player match persisted");
    return {
      match_id: next.id,
      // Cliente chama advanceLeagueRoundBackground em fire-and-forget após navegar.
      background_advance: {
        competition_id: competition.id,
        season_id: competition.season_id ?? null,
        round: next.round as number,
      },
    };
  });

/**
 * Simula as demais partidas da rodada (mesma divisão do jogador) + avança as
 * outras 4 divisões. Chamada em background pelo cliente logo após receber o
 * `match_id` da partida do jogador, para não bloquear a tela de partida ao vivo.
 * Idempotente: filtra por `status='scheduled'` — se já rodou, não faz nada.
 */
export const advanceLeagueRoundBackground = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        competition_id: z.string().uuid(),
        season_id: z.string().uuid().nullable(),
        round: z.number().int().min(1),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const t0 = Date.now();
    const stamp = (label: string) =>
      console.log(`[advanceLeagueRoundBackground] +${Date.now() - t0}ms ${label}`);
    const { supabase, userId } = context;
    const trainer = await getTrainer(supabase, userId);
    const { competition_id, season_id, round } = data;

    // Confere posse da competição
    const { data: comp } = await supabase
      .from("competitions")
      .select("id, division")
      .eq("id", competition_id)
      .eq("trainer_id", trainer.id)
      .maybeSingle();
    if (!comp) return { ok: false, reason: "competition not found" };

    const bestiary = await loadEngineBestiary(supabase);
    stamp("bestiary");

    // Simula outras partidas da mesma rodada (mesma divisão do jogador)
    const { data: sameRound } = await supabase
      .from("matches")
      .select("id, home_team_id, away_team_id")
      .eq("competition_id", competition_id)
      .eq("round", round)
      .eq("status", "scheduled");

    if (sameRound && sameRound.length) {
      const teamIds = Array.from(
        new Set(sameRound.flatMap((m: any) => [m.home_team_id, m.away_team_id])),
      );
      const { data: pair } = await supabase
        .from("teams")
        .select("id, name, cpu_strength")
        .in("id", teamIds);
      const teamMap = new Map<string, any>((pair ?? []).map((t: any) => [t.id, t]));
      const division = ((comp as any).division ?? "bronze") as DivisionSlug;
      const fallbackStrength = DIVISION_STRENGTH[division];

      // Standings em memória
      const { data: standRows } = await supabase
        .from("standings")
        .select("team_id, points, wins, draws, losses, goals_for, goals_against")
        .eq("competition_id", competition_id);
      const standMap = new Map<string, any>((standRows ?? []).map((r: any) => [r.team_id, r]));

      const matchUpdates: Array<any> = [];
      for (const m of sameRound) {
        const h = teamMap.get(m.home_team_id);
        const a = teamMap.get(m.away_team_id);
        if (!h || !a) continue;
        const hs = generateCpuSideFor(
          hashSeed(h.id),
          h.id,
          h.name,
          (h.cpu_strength ?? fallbackStrength) + 4,
          bestiary,
        );
        const as = generateCpuSideFor(hashSeed(a.id), a.id, a.name, a.cpu_strength ?? fallbackStrength, bestiary);
        const r = simulate(hs, as, hashSeed(m.id));
        matchUpdates.push(
          supabase
            .from("matches")
            .update({
              home_score: r.home_score,
              away_score: r.away_score,
              status: "finished",
              played_at: new Date().toISOString(),
            })
            .eq("id", m.id),
        );
        const hRow = standMap.get(h.id);
        const aRow = standMap.get(a.id);
        if (hRow) {
          hRow.goals_for += r.home_score;
          hRow.goals_against += r.away_score;
          if (r.home_score > r.away_score) {
            hRow.wins++;
            hRow.points += 3;
          } else if (r.home_score < r.away_score) {
            hRow.losses++;
          } else {
            hRow.draws++;
            hRow.points += 1;
          }
        }
        if (aRow) {
          aRow.goals_for += r.away_score;
          aRow.goals_against += r.home_score;
          if (r.away_score > r.home_score) {
            aRow.wins++;
            aRow.points += 3;
          } else if (r.away_score < r.home_score) {
            aRow.losses++;
          } else {
            aRow.draws++;
            aRow.points += 1;
          }
        }
      }
      await Promise.all(matchUpdates);
      stamp(`sameRound simulated (${sameRound.length})`);

      const standingsWrites: Array<any> = [];
      for (const [tid, row] of standMap) {
        standingsWrites.push(
          supabase
            .from("standings")
            .update({
              points: row.points,
              wins: row.wins,
              draws: row.draws,
              losses: row.losses,
              goals_for: row.goals_for,
              goals_against: row.goals_against,
            })
            .eq("competition_id", competition_id)
            .eq("team_id", tid),
        );
      }
      await Promise.all(standingsWrites);
      stamp("sameRound standings persisted");
    }

    // Avança as 4 divisões restantes
    try {
      await advanceOtherDivisionsForRound(supabase, trainer.id, season_id, competition_id, round);
      stamp("other divisions advanced");
    } catch (e) {
      console.error(
        `[advanceLeagueRoundBackground] ERRO ao avançar outras divisões (comp=${competition_id}, round=${round}):`,
        e,
      );
      return {
        ok: false,
        reason: "other_divisions_failed",
        error: String((e as any)?.message ?? e),
      };
    }

    return { ok: true };
  });

/**
 * Recupera rodadas cujos backgrounds falharam anteriormente.
 * Para cada competição da temporada com partidas ainda `scheduled` em rounds < próximo
 * round do jogador, roda uma simulação rápida (fastPoisson) para fechá-las e atualizar
 * standings. Idempotente: filtra por status='scheduled'.
 */
async function recoverStaleRounds(
  supabase: any,
  trainerId: string,
  seasonId: string | null,
  playerCompetitionId: string,
) {
  if (!seasonId) return;
  // Duas queries independentes em paralelo (era sequencial: -1 round-trip)
  const [nextPlayerRes, compsRes] = await Promise.all([
    supabase
      .from("matches")
      .select("round")
      .eq("competition_id", playerCompetitionId)
      .eq("status", "scheduled")
      .order("round", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("competitions")
      .select("id")
      .eq("trainer_id", trainerId)
      .eq("type", "league")
      .eq("status", "active")
      .eq("season_id", seasonId),
  ]);
  const playerNextRound = ((nextPlayerRes as any).data?.round as number | undefined) ?? Infinity;
  const comps = (compsRes as any).data as Array<{ id: string }> | null;
  if (!comps?.length) return;

  const compIds = comps.map((c) => c.id);
  // Fast path: LIMIT 1 confirma se há qualquer partida presa antes de baixar tudo.
  const { data: probe } = await supabase
    .from("matches")
    .select("id")
    .in("competition_id", compIds)
    .eq("status", "scheduled")
    .lt("round", playerNextRound)
    .limit(1);
  if (!probe?.length) return;

  const { data: stale } = await supabase
    .from("matches")
    .select("id, competition_id, round, home_team_id, away_team_id")
    .in("competition_id", compIds)
    .eq("status", "scheduled")
    .lt("round", playerNextRound);
  if (!stale?.length) return;

  console.warn(`[playNextLeagueMatch] RECUPERANDO ${stale.length} partidas de rodadas anteriores`);

  // Agrupa por competição e delega para o mesmo helper de outras divisões
  const byComp = new Map<string, Map<number, any[]>>();
  for (const m of stale) {
    const c = byComp.get(m.competition_id) ?? new Map<number, any[]>();
    const r = c.get(m.round) ?? [];
    r.push(m);
    c.set(m.round, r);
    byComp.set(m.competition_id, c);
  }
  for (const [compId, rounds] of byComp) {
    for (const round of rounds.keys()) {
      try {
        await fastAdvanceCompetitionRound(supabase, compId, round);
      } catch (e) {
        console.error(`[recoverStaleRounds] ERRO comp=${compId} round=${round}:`, e);
      }
    }
  }
}

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

    // A temporada só pode virar quando todas as competições iniciadas nela terminaram.
    // Evita deixar uma Copa antiga ativa e bloquear a Copa da temporada seguinte.
    const { data: activeSideCompetitions, error: sideCompError } = await supabase
      .from("competitions")
      .select("id, type")
      .eq("trainer_id", trainer.id)
      .eq("season_id", seasonId)
      .neq("type", "league")
      .eq("status", "active");
    if (sideCompError) throw sideCompError;
    if ((activeSideCompetitions ?? []).length > 0) {
      const labels: Record<string, string> = {
        cup: "Copa Nacional",
        world_league: "Liga Mundial",
        world_cup: "Copa Mundial",
      };
      const pendingNames = Array.from(
        new Set((activeSideCompetitions ?? []).map((c: any) => labels[c.type] ?? "competição")),
      ).join(", ");
      throw new Error(`Conclua antes de encerrar a temporada: ${pendingNames}.`);
    }

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
    const relegated =
      DIVISION_ORDER.indexOf(newDivision) < DIVISION_ORDER.indexOf(previousDivision);

    // Salários agora são cobrados por partida — nada a descontar aqui.
    const [academyResult, renewalRosterResult, renewalBuildingsResult] = await Promise.all([
      supabase.from("academies").select("money, gems").eq("trainer_id", trainer.id).maybeSingle(),
      supabase.from("creatures").select("overall, salary_mult").eq("owner_trainer_id", trainer.id),
      supabase.from("buildings").select("building_type, level").eq("trainer_id", trainer.id),
    ]);
    const acad = academyResult.data;
    const contractRenewal = eliteRenewalFee(playerDiv, renewalRosterResult.data ?? []);
    const infrastructureRenewal = eliteInfrastructureRenewalFee(
      playerDiv,
      renewalBuildingsResult.data ?? [],
    );
    const availableAfterPrize = Number(acad?.money ?? 0) + prize;
    const treasuryReserve = eliteTreasuryReserveFee(playerDiv, availableAfterPrize);
    const eliteSeasonExpense = Math.min(
      availableAfterPrize,
      contractRenewal + infrastructureRenewal + treasuryReserve,
    );
    await supabase
      .from("academies")
      .update({
        money: availableAfterPrize - eliteSeasonExpense,
        gems: (acad?.gems ?? 0) + championGems,
      })
      .eq("trainer_id", trainer.id);

    // Mantém o campo legado sincronizado; a fonte canônica continua sendo o time atual.
    await supabase.from("trainers").update({ division: newDivision } as any).eq("id", (trainer as any).id);

    // XP de prestígio de fim de temporada
    if (playerIsChampion) await awardTrainerXp(supabase, trainer.id, "title", 1);
    if (promoted) await awardTrainerXp(supabase, trainer.id, "promotion", 1);

    const txs: any[] = [];
    if (prize > 0)
      txs.push({
        trainer_id: trainer.id,
        transaction_type: "income",
        category: "premio_temporada",
        amount: prize,
        description: `Prêmio de temporada — ${playerDiv} • ${position}º lugar`,
      });
    if (contractRenewal > 0)
      txs.push({
        trainer_id: trainer.id,
        transaction_type: "expense",
        category: "renovacao_contratos",
        amount: Math.min(contractRenewal, eliteSeasonExpense),
        description: `Renovação anual de contratos — ${playerDiv}`,
      });
    const paidInfrastructureRenewal = Math.min(
      infrastructureRenewal,
      Math.max(0, eliteSeasonExpense - contractRenewal),
    );
    if (paidInfrastructureRenewal > 0)
      txs.push({
        trainer_id: trainer.id,
        transaction_type: "expense",
        category: "modernizacao_infraestrutura",
        amount: paidInfrastructureRenewal,
        description: `Fundo anual de modernização — ${playerDiv}`,
      });
    const paidTreasuryReserve = Math.max(
      0,
      eliteSeasonExpense - contractRenewal - paidInfrastructureRenewal,
    );
    if (paidTreasuryReserve > 0)
      txs.push({
        trainer_id: trainer.id,
        transaction_type: "expense",
        category: "fundo_sustentabilidade_elite",
        amount: paidTreasuryReserve,
        description: `Fundo de sustentabilidade da elite — ${playerDiv}`,
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
        balance_version: (BALANCE_VERSION as any),
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
          points: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goals_for: 0,
          goals_against: 0,
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

    // Fase 3 — Carreira: propostas e demissão
    const careerOutcome = await applySeasonOutcome({
      supabase,
      trainerId: trainer.id,
      trainerCurrentTeamId: playerTeam.id,
      seasonNumber: currentSeason.season_number,
      playerDivision: playerDiv,
      playerPosition: position,
      totalTeams: playerRanked.length,
      promoted,
      relegated,
      isChampion: playerIsChampion,
    });

    return {
      position,
      prize,
      championGems,
      salaries: 0,
      eliteSeasonExpense,
      previousDivision,
      newDivision,
      promoted,
      relegated,
      playerIsChampion,
      newSeasonNumber: currentSeason.season_number + 1,
      championName: championByDiv.get(playerDiv)?.name ?? "—",
      worldSummary,
      career: careerOutcome,
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
    await fastAdvanceCompetitionRound(supabase, comp.id, round);
  }
}

/**
 * Simulação rápida (fastPoisson) de todas as partidas `scheduled` de uma rodada
 * específica em uma competição, e atualiza standings.
 * Idempotente: filtra por status='scheduled'.
 */
async function fastAdvanceCompetitionRound(supabase: any, compId: string, round: number) {
  const { data: matches } = await supabase
    .from("matches")
    .select("id, home_team_id, away_team_id")
    .eq("competition_id", compId)
    .eq("round", round)
    .eq("status", "scheduled");
  if (!matches || !matches.length) return;

  const teamIds = Array.from(
    new Set(matches.flatMap((m: any) => [m.home_team_id, m.away_team_id])),
  );
  const { data: cr } = await supabase
    .from("creatures")
    .select("owner_team_id, overall")
    .in("owner_team_id", teamIds);
  const strength = new Map<string, number>();
  const totals = new Map<string, { sum: number; n: number }>();
  for (const c of cr ?? []) {
    const t = totals.get(c.owner_team_id) ?? { sum: 0, n: 0 };
    t.sum += c.overall;
    t.n += 1;
    totals.set(c.owner_team_id, t);
  }
  for (const [id, t] of totals) strength.set(id, t.n ? t.sum / t.n : 45);

  const { data: standRows } = await supabase
    .from("standings")
    .select("team_id, points, wins, draws, losses, goals_for, goals_against")
    .eq("competition_id", compId);
  const standMap = new Map<string, any>((standRows ?? []).map((r: any) => [r.team_id, r]));

  const matchWrites: any[] = [];
  for (const m of matches) {
    const hs = strength.get(m.home_team_id) ?? 45;
    const as = strength.get(m.away_team_id) ?? 45;
    const rng = mulberry32Local(hashSeed(m.id));
    const homeLambda = Math.max(0.2, (hs / 28) * 1.05);
    const awayLambda = Math.max(0.2, as / 28);
    const hg = fastPoisson(homeLambda, rng);
    const ag = fastPoisson(awayLambda, rng);
    matchWrites.push(
      supabase
        .from("matches")
        .update({
          home_score: hg,
          away_score: ag,
          status: "finished",
          is_summary: true,
          played_at: new Date().toISOString(),
        })
        .eq("id", m.id)
        .eq("status", "scheduled"),
    );
    const hRow = standMap.get(m.home_team_id);
    const aRow = standMap.get(m.away_team_id);
    if (hRow) {
      hRow.goals_for += hg;
      hRow.goals_against += ag;
      if (hg > ag) {
        hRow.wins++;
        hRow.points += 3;
      } else if (hg < ag) {
        hRow.losses++;
      } else {
        hRow.draws++;
        hRow.points += 1;
      }
    }
    if (aRow) {
      aRow.goals_for += ag;
      aRow.goals_against += hg;
      if (ag > hg) {
        aRow.wins++;
        aRow.points += 3;
      } else if (ag < hg) {
        aRow.losses++;
      } else {
        aRow.draws++;
        aRow.points += 1;
      }
    }
  }
  await Promise.all(matchWrites);

  const standWrites: any[] = [];
  for (const [tid, row] of standMap) {
    standWrites.push(
      supabase
        .from("standings")
        .update({
          points: row.points,
          wins: row.wins,
          draws: row.draws,
          losses: row.losses,
          goals_for: row.goals_for,
          goals_against: row.goals_against,
        })
        .eq("competition_id", compId)
        .eq("team_id", tid),
    );
  }
  await Promise.all(standWrites);
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
