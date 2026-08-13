// Distribuição de XP pós-partida (GDD §6.1) + curva de meia-estrela ajustada à carreira (§10.3):
//   custo(n) = round(800 * 1.25^(n-1))
// CT de Treinamento: +5% por nível.  Burst de XP: multiplicador variável.

import { awardTrainerXp } from "./trainer-xp.server";


const HALF_STAR_COSTS: number[] = Array.from({ length: 10 }, (_, i) =>
  Math.round(800 * Math.pow(1.25, i)),
);

/** Custo em XP para atingir a próxima meia-estrela (n = 1..10). */
export function halfStarCost(n: number): number {
  if (n < 1 || n > 10) return Infinity;
  return HALF_STAR_COSTS[n - 1];
}

/** Total de meia-estrelas que os `xp` acumulados destravam (0..10). */
export function halfStarsFromXp(xp: number): number {
  let acc = 0;
  for (let i = 0; i < HALF_STAR_COSTS.length; i++) {
    acc += HALF_STAR_COSTS[i];
    if (xp < acc) return i;
  }
  return 10;
}

/** Soma total de XP para chegar em N meia-estrelas (0..10). */
export function xpForHalfStars(n: number): number {
  let acc = 0;
  for (let i = 0; i < Math.min(10, Math.max(0, n)); i++) acc += HALF_STAR_COSTS[i];
  return acc;
}

/**
 * Progresso histórico na curva de meia-estrelas.
 * baseline (estrelas de nascimento) + XP já gasto em treino + saldo atual.
 * O saldo GASTÁVEL em treino continua sendo apenas `xp`.
 */
export function careerCurveXp(c: {
  xp?: number | null;
  career_baseline_xp?: number | null;
  xp_spent_training?: number | null;
}): number {
  return (c.career_baseline_xp ?? 0) + (c.xp_spent_training ?? 0) + (c.xp ?? 0);
}

/** Meia-estrelas pendentes de aplicação, dado o progresso histórico. */
export function pendingHalfStarsFor(
  c: { xp?: number | null; career_baseline_xp?: number | null; xp_spent_training?: number | null },
  applied: number,
): number {
  return Math.max(0, Math.min(10 - applied, halfStarsFromXp(careerCurveXp(c)) - applied));
}

export async function applyPostMatchXp(
  supabase: any,
  trainerId: string,
  opts: {
    starterIds: string[];
    enteredReserveIds: string[];
    unusedReserveIds: string[];
    outcome: "W" | "D" | "L";
    energy_loss: Record<string, number>;
    injuries?: Array<{ creature_id: string; severity: "leve" | "moderada" | "grave"; matches: number }>;
    isOfficial?: boolean;
    /** Se true (amistoso): NADA de energia/lesão/XP/moral. Retorna imediatamente. */
    skipRewards?: boolean;
    /** Gols por creature_id na partida — usados para bônus de moral. */
    goalsByCreature?: Record<string, number>;
  },
) {
  if (opts.skipRewards) return; // Amistoso: sem efeitos colaterais.
  const base = opts.outcome === "W" ? 100 : opts.outcome === "D" ? 50 : 0;
  const isOfficial = opts.isOfficial ?? false;


  const { data: buildings } = await supabase
    .from("buildings")
    .select("building_type, level")
    .eq("trainer_id", trainerId);
  const ctLevel =
    (buildings ?? []).find((b: any) => b.building_type === "ct_treino")?.level ?? 0;
  const medLevel =
    (buildings ?? []).find((b: any) => b.building_type === "centro_medico")?.level ?? 1;
  const ctBonus = 1 + ctLevel * 0.05;

  // Recuperação de energia v3 (evento-based): valores fixos, suaves.
  // Quem jogou recupera +2; quem não jogou (banco não usado ou lesionado) +6.
  // Combinado com o desgaste base de -3/-4/-5, um titular sem revezar estabiliza
  // em ~45-50%; revezando a cada 3 rodadas, mantém ~98%.
  const RECOVERY_PLAYED = 2;
  const RECOVERY_RESTED = 6;
  // Redução de duração de lesão por Centro Médico (§Lesões): -15% a -50%.
  const MED_INJURY_REDUCE = [0, 0.15, 0.25, 0.35, 0.45, 0.5];
  const injReduce = MED_INJURY_REDUCE[Math.min(medLevel, 5)] ?? 0;


  const { data: trainer } = await supabase
    .from("trainers")
    .select("xp_burst_multiplier, xp_burst_matches_left, losing_streak")
    .eq("id", trainerId)
    .maybeSingle();
  const burstLeft = trainer?.xp_burst_matches_left ?? 0;
  const burstMult = burstLeft > 0 ? Number(trainer?.xp_burst_multiplier ?? 1) : 1;

  // Sistema de Moral — sequência de derrotas do time.
  const prevStreak = (trainer?.losing_streak ?? 0) as number;
  let nextStreak = prevStreak;
  if (opts.outcome === "W") nextStreak = 0;
  else if (opts.outcome === "L") nextStreak = prevStreak + 1;
  function lossPenaltyForStreak(s: number): number {
    if (s >= 8) return 10;
    if (s >= 5) return 8;
    if (s >= 3) return 6;
    return 4;
  }

  const starterXp = Math.round(base * ctBonus * burstMult);
  const enteredXp = Math.round(base * 0.5 * ctBonus * burstMult);
  const benchXp = opts.outcome === "W" ? Math.round(25 * ctBonus * burstMult) : 0;

  const targets: Array<{ id: string; add: number }> = [];
  for (const id of opts.starterIds) targets.push({ id, add: starterXp });
  for (const id of opts.enteredReserveIds) targets.push({ id, add: enteredXp });
  for (const id of opts.unusedReserveIds) targets.push({ id, add: benchXp });

  // Toda criatura do elenco recupera energia (reservas não convocadas também).
  const { data: fullRoster } = await supabase
    .from("creatures")
    .select("id, overall")
    .eq("owner_trainer_id", trainerId);
  const allTrainerIds = (fullRoster ?? []).map((r: any) => r.id);
  const enteredSet = new Set(opts.enteredReserveIds);
  const starterSet = new Set(opts.starterIds);
  const unusedBenchSet = new Set(opts.unusedReserveIds);

  // Ranking por overall para categorizar o peso do banco no moral.
  const ranked = [...(fullRoster ?? [])].sort(
    (a: any, b: any) => (b.overall ?? 0) - (a.overall ?? 0),
  );
  const rankOf = new Map<string, number>(ranked.map((r: any, i: number) => [r.id, i + 1]));
  const benchPenaltyByRank = (rank: number): number => {
    if (rank <= 11) return -6;
    if (rank <= 18) return -3;
    return -1;
  };

  // Índice de novas lesões (só aplicadas em partidas oficiais).
  const injuryMap = new Map<string, { severity: "leve" | "moderada" | "grave"; matches: number }>();
  if (isOfficial) {
    for (const inj of opts.injuries ?? []) {
      const reduced = Math.max(1, Math.ceil(inj.matches * (1 - injReduce)));
      injuryMap.set(inj.creature_id, { severity: inj.severity, matches: reduced });
    }
  }

  if (!allTrainerIds.length) {
    await tickBurst(supabase, trainerId, burstLeft);
    return;
  }

  const { data: creatures } = await supabase
    .from("creatures")
    .select("id, xp, career_baseline_xp, xp_spent_training, pending_half_stars, half_stars_earned, energy, morale, injury_matches_remaining, injury_severity")
    .in("id", allTrainerIds)
    .eq("owner_trainer_id", trainerId);

  const goalsByCreature = opts.goalsByCreature ?? {};
  const lossPenalty = lossPenaltyForStreak(nextStreak);
  const outcomeMorale = opts.outcome === "W" ? +3 : opts.outcome === "D" ? 0 : -lossPenalty;

  const energyDebug: Array<{ id: string; prev: number; loss: number; rec: number; next: number; played: boolean }> = [];
  const creatureUpdates: Array<{
    id: string;
    xp: number;
    pending_half_stars: number;
    energy: number;
    morale: number;
    injury_matches_remaining: number;
    injury_severity: string | null;
  }> = [];
  for (const c of creatures ?? []) {
    const add = targets.filter((t) => t.id === c.id).reduce((a, t) => a + t.add, 0);
    const newXp = (c.xp ?? 0) + add;
    const applied = c.half_stars_earned ?? 0;
    const pending = pendingHalfStarsFor({ ...c, xp: newXp }, applied);
    const loss = opts.energy_loss[c.id] ?? 0;
    const played = starterSet.has(c.id) || enteredSet.has(c.id);
    const rec = played ? RECOVERY_PLAYED : RECOVERY_RESTED;
    const prevEnergy = c.energy ?? 100;
    const newEnergy = Math.max(30, Math.min(100, prevEnergy - loss + rec));
    energyDebug.push({ id: c.id, prev: prevEnergy, loss, rec, next: newEnergy, played });

    let injRemaining = c.injury_matches_remaining ?? 0;
    let injSeverity: string | null = c.injury_severity ?? null;
    if (isOfficial && injRemaining > 0) {
      injRemaining = Math.max(0, injRemaining - 1);
      if (injRemaining === 0) injSeverity = null;
    }
    const newInj = injuryMap.get(c.id);
    if (newInj && newInj.matches > injRemaining) {
      injRemaining = newInj.matches;
      injSeverity = newInj.severity;
    }

    let newMorale = Math.max(0, Math.min(100, c.morale ?? 50));
    if (isOfficial) {
      let gains = 0;
      let losses = 0;
      if (starterSet.has(c.id)) gains += 4;
      else if (enteredSet.has(c.id)) gains += 2;
      const goals = goalsByCreature[c.id] ?? 0;
      if (goals > 0) gains += 6 * goals;
      if (outcomeMorale >= 0) gains += outcomeMorale;
      else losses += -outcomeMorale;
      // Sistema-Moral.md §Banco: penalidade GRADUADA por rank de overall,
      // aplicada tanto a reservas não usadas quanto a criaturas fora do matchday
      // (excedente do plantel de 26 → 18 convocados). Antes: outOfSquad = -7 fixo,
      // divergia da spec e transformava profundidade em armadilha financeira.
      const notPlaying =
        !starterSet.has(c.id) && !enteredSet.has(c.id);
      if (notPlaying) losses += -benchPenaltyByRank(rankOf.get(c.id) ?? 99);
      if (injRemaining > 0) losses += 4;
      const gainMul = Math.max(0, 1 - newMorale / 120);
      newMorale = Math.max(0, Math.min(100, Math.round(newMorale + gains * gainMul - losses)));
    }

    creatureUpdates.push({
      id: c.id,
      xp: newXp,
      pending_half_stars: pending,
      energy: newEnergy,
      morale: newMorale,
      injury_matches_remaining: injRemaining,
      injury_severity: injSeverity,
    });
  }

  if (isOfficial && energyDebug.length) {
    console.log(
      `[applyPostMatchXp] trainer=${trainerId} outcome=${opts.outcome} energy_loss_keys=${Object.keys(opts.energy_loss).length}`,
      energyDebug.slice(0, 20),
    );
  }

  // Um único RPC substitui N atualizações HTTP individuais do elenco.
  // A função é SECURITY INVOKER e só atualiza criaturas do próprio treinador.
  const src = opts.outcome === "W" ? "match_win" : opts.outcome === "D" ? "match_draw" : "match_loss";
  await Promise.all([
    supabase.rpc("apply_creature_match_updates", {
      p_trainer_id: trainerId,
      p_updates: creatureUpdates,
    }),
    tickBurst(supabase, trainerId, burstLeft),
    awardTrainerXp(supabase, trainerId, src, 1),
    nextStreak !== prevStreak
      ? supabase.from("trainers").update({ losing_streak: nextStreak }).eq("id", trainerId)
      : Promise.resolve(),
  ]);
}



async function tickBurst(supabase: any, trainerId: string, current: number) {
  if (current <= 0) return;
  const next = current - 1;
  const patch: Record<string, any> = { xp_burst_matches_left: next };
  if (next === 0) patch.xp_burst_multiplier = 1;
  await supabase.from("trainers").update(patch).eq("id", trainerId);
}

export async function insertMessage(
  supabase: any,
  trainerId: string,
  kind: string,
  title: string,
  body: string,
) {
  try {
    await supabase.from("messages").insert({ trainer_id: trainerId, kind, title, body });
  } catch (e) {
    console.error("insertMessage error", e);
  }
}
