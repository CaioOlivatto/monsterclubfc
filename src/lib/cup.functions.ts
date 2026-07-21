import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { simulate, generateCpuSideFor, type EngineSide } from "./match-engine.server";
import { pickCpuTeamNames } from "./league.server";

const CUP_ROUND_NAMES: Record<number, string> = { 1: "Quartas", 2: "Semifinal", 3: "Final" };

async function getTrainer(supabase: any, userId: string) {
  const { data: trainer } = await supabase
    .from("trainers")
    .select("id, academy_name")
    .eq("user_id", userId)
    .maybeSingle();
  if (!trainer) throw new Error("Treinador não encontrado.");
  return trainer as { id: string; academy_name: string };
}

async function playerAverage(supabase: any, trainerId: string): Promise<number> {
  const { data } = await supabase.from("creatures").select("overall").eq("trainer_id", trainerId);
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

async function buildPlayerSide(
  supabase: any,
  trainerId: string,
  teamId: string,
  teamName: string,
): Promise<EngineSide> {
  // Reutiliza lineup salva
  const { buildSlots } = await import("./lineup.server");
  const { data: lineup } = await supabase
    .from("team_lineups")
    .select("formation, strategy, starters")
    .eq("trainer_id", trainerId)
    .maybeSingle();
  if (!lineup) throw new Error("Salve uma escalação antes de jogar a copa.");
  const savedStarters = (lineup.starters ?? []) as { slot: number; role: any; creature_id: string | null }[];
  const ids = savedStarters.map((s) => s.creature_id).filter(Boolean) as string[];
  if (ids.length !== 11) throw new Error("Preencha os 11 titulares antes de jogar.");
  const { data: creatures } = await supabase
    .from("creatures")
    .select("id, name, element, overall, physical, affinity_fogo, affinity_agua, affinity_terra, affinity_ar, affinity_gelo")
    .in("id", ids);
  const byId = new Map<string, any>((creatures ?? []).map((c: any) => [c.id, c]));
  const slots = buildSlots(lineup.formation);
  const starters = slots.map((s) => {
    const saved = savedStarters.find((x) => x.slot === s.index);
    const c = saved?.creature_id ? byId.get(saved.creature_id) : null;
    if (!c) throw new Error("Escalação inválida — recomponha os titulares.");
    return {
      role: s.role,
      creature: {
        id: c.id,
        name: c.name,
        element: c.element,
        overall: c.overall,
        physical: c.physical,
        affinity_fogo: c.affinity_fogo ?? 0,
        affinity_agua: c.affinity_agua ?? 0,
        affinity_terra: c.affinity_terra ?? 0,
        affinity_ar: c.affinity_ar ?? 0,
        affinity_gelo: c.affinity_gelo ?? 0,
      },
    };
  });
  return { team_id: teamId, team_name: teamName, starters, strategy: lineup.strategy };
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

    const { data: existing } = await supabase
      .from("competitions")
      .select("id")
      .eq("trainer_id", trainer.id)
      .eq("type", "cup")
      .eq("status", "active")
      .maybeSingle();
    if (existing) throw new Error("Já existe uma copa em andamento.");

    const { data: season } = await supabase
      .from("game_seasons")
      .select("id")
      .eq("trainer_id", trainer.id)
      .eq("is_current", true)
      .maybeSingle();
    if (!season) throw new Error("Sem temporada ativa. Inicie a liga primeiro.");

    const { data: cup, error: cErr } = await supabase
      .from("competitions")
      .insert({
        trainer_id: trainer.id,
        season_id: season.id,
        division: "bronze",
        type: "cup",
        status: "active",
      })
      .select("id")
      .single();
    if (cErr) throw cErr;

    const { data: playerTeam } = await supabase
      .from("teams")
      .insert({
        competition_id: cup.id,
        trainer_id: trainer.id,
        is_player: true,
        name: trainer.academy_name,
      })
      .select("id")
      .single();

    const avg = await playerAverage(supabase, trainer.id);
    const cpuNames = pickCpuTeamNames(7, (Date.now() ^ 0x5c) & 0xffffffff);
    // Copa: adversários mais fortes na média (torneio nacional)
    const cpuRows = cpuNames.map((name, i) => ({
      competition_id: cup.id,
      trainer_id: null,
      is_player: false,
      name,
      cpu_strength: Math.max(25, Math.min(95, avg + (i - 3) * 5 + 6)),
    }));
    const { data: cpuTeams } = await supabase.from("teams").insert(cpuRows).select("id, cpu_strength");
    const cpus = [...(cpuTeams ?? [])].sort((a: any, b: any) => a.cpu_strength - b.cpu_strength);
    // Sorteio: jogador = seed 1, restante 2..8 por força ascendente
    const seeds = [playerTeam!.id, ...cpus.map((c: any) => c.id)];
    // Chaveamento clássico: 1v8, 4v5, 3v6, 2v7 (quartas → semi cruzada)
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

export const playNextCupMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const trainer = await getTrainer(supabase, userId);
    const { data: cup } = await supabase
      .from("competitions")
      .select("id")
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

    const { data: teams } = await supabase
      .from("teams")
      .select("id, name, is_player, cpu_strength")
      .in("id", [next.home_team_id, next.away_team_id]);
    const home = teams!.find((t: any) => t.id === next.home_team_id) as any;
    const away = teams!.find((t: any) => t.id === next.away_team_id) as any;

    async function side(team: any): Promise<EngineSide> {
      if (team.is_player) return buildPlayerSide(supabase, trainer.id, team.id, team.name);
      return generateCpuSideFor(hashSeed(team.id), team.id, team.name, team.cpu_strength ?? 50);
    }
    let result = simulate(await side(home), await side(away), hashSeed(next.id));
    // Sem empate em copa: pênaltis determinísticos
    if (result.home_score === result.away_score) {
      const seed = hashSeed(next.id + "pen");
      const homeWin = (seed >>> 0) % 2 === 0;
      if (homeWin) result = { ...result, home_score: result.home_score + 1 };
      else result = { ...result, away_score: result.away_score + 1 };
    }
    await supabase
      .from("matches")
      .update({
        home_score: result.home_score,
        away_score: result.away_score,
        status: "finished",
        played_at: new Date().toISOString(),
      })
      .eq("id", next.id);
    const events = result.events.map((e: any) => ({
      match_id: next.id,
      minute: e.minute,
      event_type: e.event_type,
      description: e.description,
      actor_creature_id:
        e.actor_creature_id && !e.actor_creature_id.startsWith("cpu-") ? e.actor_creature_id : null,
      actor_team_id: e.actor_team_id,
    }));
    if (events.length) await supabase.from("match_events").insert(events);

    // Simula outras partidas da mesma rodada
    const { data: sameRound } = await supabase
      .from("matches")
      .select("id, home_team_id, away_team_id, round")
      .eq("competition_id", cup.id)
      .eq("round", next.round as number)
      .eq("status", "scheduled");
    for (const m of sameRound ?? []) {
      const { data: pair } = await supabase
        .from("teams")
        .select("id, name, cpu_strength")
        .in("id", [m.home_team_id, m.away_team_id]);
      const h = pair!.find((t: any) => t.id === m.home_team_id) as any;
      const a = pair!.find((t: any) => t.id === m.away_team_id) as any;
      const hs = generateCpuSideFor(hashSeed(h.id), h.id, h.name, (h.cpu_strength ?? 50) + 3);
      const as = generateCpuSideFor(hashSeed(a.id), a.id, a.name, a.cpu_strength ?? 50);
      let r = simulate(hs, as, hashSeed(m.id));
      if (r.home_score === r.away_score) {
        const homeWin = (hashSeed(m.id + "pen") >>> 0) % 2 === 0;
        r = { ...r, home_score: r.home_score + (homeWin ? 1 : 0), away_score: r.away_score + (homeWin ? 0 : 1) };
      }
      await supabase
        .from("matches")
        .update({
          home_score: r.home_score,
          away_score: r.away_score,
          status: "finished",
          played_at: new Date().toISOString(),
        })
        .eq("id", m.id);
    }

    // Se todas as partidas da rodada terminaram, gera próxima rodada com vencedores
    const currentRound = next.round as number;
    if (currentRound < 3) {
      const { data: roundMatches } = await supabase
        .from("matches")
        .select("id, home_team_id, away_team_id, home_score, away_score, status")
        .eq("competition_id", cup.id)
        .eq("round", currentRound)
        .order("id", { ascending: true });
      if ((roundMatches ?? []).every((m: any) => m.status === "finished")) {
        const winners = (roundMatches ?? []).map((m: any) =>
          m.home_score >= m.away_score ? m.home_team_id : m.away_team_id,
        );
        const pairs: [string, string][] = [];
        for (let i = 0; i < winners.length; i += 2) pairs.push([winners[i], winners[i + 1]]);
        const nextRows = pairs.map(([h, a]) => ({
          competition_id: cup.id,
          round: currentRound + 1,
          home_team_id: h,
          away_team_id: a,
          status: "scheduled" as const,
          is_friendly: false,
        }));
        if (nextRows.length) await supabase.from("matches").insert(nextRows);
      }
    } else {
      // Final concluída: fecha copa, define campeão e paga prêmio
      const isFinal = true;
      if (isFinal) {
        const championTeamId =
          result.home_score >= result.away_score ? next.home_team_id : next.away_team_id;
        await supabase
          .from("competitions")
          .update({ status: "finished", champion_team_id: championTeamId })
          .eq("id", cup.id);

        // Prêmio: campeão 200k, vice 80k, semi 30k
        const { data: playerMatches } = await supabase
          .from("matches")
          .select("round, home_team_id, away_team_id, home_score, away_score")
          .eq("competition_id", cup.id)
          .or(`home_team_id.eq.${playerTeam.id},away_team_id.eq.${playerTeam.id}`);
        let bestRound = 0;
        let playerWonFinal = false;
        for (const m of playerMatches ?? []) {
          const isHome = m.home_team_id === playerTeam.id;
          const gf = (isHome ? m.home_score : m.away_score) ?? 0;
          const ga = (isHome ? m.away_score : m.home_score) ?? 0;
          if (gf > ga) bestRound = Math.max(bestRound, m.round as number);
          else bestRound = Math.max(bestRound, (m.round as number) - 1);
          if (m.round === 3 && gf >= ga) playerWonFinal = true;
        }

        // Corrige: se venceu a final, bestRound = 3; senão avaliar reached
        const reachedFinal = (playerMatches ?? []).some((m: any) => m.round === 3);
        const reachedSemi = (playerMatches ?? []).some((m: any) => m.round === 2);
        let prize = 0;
        let label = "";
        if (playerWonFinal) {
          prize = 200000;
          label = "Campeão da Copa";
        } else if (reachedFinal) {
          prize = 80000;
          label = "Vice-campeão da Copa";
        } else if (reachedSemi) {
          prize = 30000;
          label = "Semifinalista da Copa";
        } else {
          prize = 10000;
          label = "Participação na Copa";
        }
        if (prize > 0) {
          const { data: acad } = await supabase
            .from("academies")
            .select("money")
            .eq("trainer_id", trainer.id)
            .maybeSingle();
          await supabase
            .from("academies")
            .update({ money: (acad?.money ?? 0) + prize })
            .eq("trainer_id", trainer.id);
          await supabase.from("financial_transactions").insert({
            trainer_id: trainer.id,
            transaction_type: "income",
            amount: prize,
            description: `Copa — ${label}`,
          });
        }
      }
    }

    return { match_id: next.id, round: currentRound, round_name: CUP_ROUND_NAMES[currentRound] };
  });
