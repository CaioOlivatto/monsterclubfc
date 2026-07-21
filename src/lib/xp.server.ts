// Distribuição de XP pós-partida (GDD §6.1).
// Aplica ganho de XP; a cada 100 XP acumulado, incrementa pending_half_stars.
// O jogador escolhe manualmente em qual atributo/afinidade aplicar (§6.3).

export async function applyPostMatchXp(
  supabase: any,
  trainerId: string,
  opts: {
    starterIds: string[]; // titulares (do time do jogador)
    reserveIds: string[]; // reservas do banco
    outcome: "W" | "D" | "L";
    energy_loss: Record<string, number>;
  },
) {
  const base = opts.outcome === "W" ? 100 : opts.outcome === "D" ? 50 : 0;
  if (base === 0 && opts.outcome !== "L") return;

  // Bônus do CT de Treinamento: +10% por nível
  const { data: buildings } = await supabase
    .from("buildings")
    .select("building_type, level")
    .eq("trainer_id", trainerId);
  const ctLevel =
    (buildings ?? []).find((b: any) => b.building_type === "ct_treino")?.level ?? 0;
  const ctBonus = 1 + ctLevel * 0.1;

  // Burst XP ativo?
  const { data: trainer } = await supabase
    .from("trainers")
    .select("xp_burst_until")
    .eq("id", trainerId)
    .maybeSingle();
  const burstActive =
    trainer?.xp_burst_until && new Date(trainer.xp_burst_until).getTime() > Date.now();
  const burstMult = burstActive ? 2 : 1;

  const starterXp = Math.round(base * ctBonus * burstMult);
  const reserveXp = Math.round(base * 0.25 * ctBonus * burstMult);

  const targets: Array<{ id: string; add: number }> = [
    ...opts.starterIds.map((id) => ({ id, add: starterXp })),
    ...opts.reserveIds.map((id) => ({ id, add: reserveXp })),
  ];
  if (!targets.length) return;

  const ids = targets.map((t) => t.id);
  const { data: creatures } = await supabase
    .from("creatures")
    .select("id, xp, pending_half_stars, energy")
    .in("id", ids)
    .eq("owner_trainer_id", trainerId);

  for (const c of creatures ?? []) {
    const t = targets.find((x) => x.id === c.id);
    if (!t) continue;
    const newXp = (c.xp ?? 0) + t.add;
    const gainedStars = Math.floor(newXp / 100) - Math.floor((c.xp ?? 0) / 100);
    const loss = opts.energy_loss[c.id] ?? 0;
    const newEnergy = Math.max(0, (c.energy ?? 100) - loss);
    await supabase
      .from("creatures")
      .update({
        xp: newXp,
        pending_half_stars: (c.pending_half_stars ?? 0) + Math.max(0, gainedStars),
        energy: newEnergy,
      })
      .eq("id", c.id);
  }
}

export async function insertMessage(
  supabase: any,
  trainerId: string,
  kind: string,
  title: string,
  body: string,
) {
  try {
    await supabase.from("messages").insert({
      trainer_id: trainerId,
      kind,
      title,
      body,
    });
  } catch (e) {
    console.error("insertMessage error", e);
  }
}
