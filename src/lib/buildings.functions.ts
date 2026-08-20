/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase } from "@/integrations/supabase/client";

// O banco não tem helper server-side para isso, então usamos RPC ou insert direto
async function adjustAcademyMoney(supabase: any, trainerId: string, amount: number) {
  const { data: academy } = await supabase
    .from("academies")
    .select("money")
    .eq("trainer_id", trainerId)
    .single();
  
  if (!academy) return;

  await supabase
    .from("academies")
    .update({ money: academy.money + amount })
    .eq("trainer_id", trainerId);
}

export const upgradeBuilding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        type: z.enum(["estadio", "ct_treino", "centro_medico"]),
      })
      .parse(data),
  )
  .handler(async ({ data: input, context }) => {
    const { type } = input;
    const { userId } = context;

    // 1) Busca o treinador
    const { data: trainer, error: tErr } = await supabase
      .from("trainers")
      .select("id, current_team_id")
      .eq("id", userId)
      .single();

    if (tErr || !trainer) throw tErr || new Error("Treinador não encontrado");

    // 2) Busca o prédio atual
    const { data: existing, error: eErr } = await supabase
      .from("buildings")
      .select("*")
      .eq("trainer_id", trainer.id)
      .eq("building_type", type)
      .maybeSingle();

    const currentLevel = existing?.level ?? 0;
    const nextLevel = currentLevel + 1;

    if (nextLevel > 5) throw new Error("Nível máximo atingido");

    // 3) Verifica custo
    const specs: Record<string, { name: string; base: number; mult: number }> = {
      estadio: { name: "Estádio", base: 100000, mult: 2.5 },
      ct_treino: { name: "CT de Treino", base: 50000, mult: 2.0 },
      centro_medico: { name: "Centro Médico", base: 75000, mult: 2.2 },
    };
    const spec = specs[type];

    const cost = Math.round(spec.base * Math.pow(spec.mult, currentLevel));

    const { data: academy, error: aErr } = await supabase
      .from("academies")
      .select("money")
      .eq("trainer_id", trainer.id)
      .single();

    if (aErr || !academy) throw aErr || new Error("Academia não encontrada");
    if (academy.money < cost) throw new Error("Dinheiro insuficiente");

    // 4) Tempo de obra: 2h * nível
    const hours = 2 * nextLevel;
    const completesAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

    // 5) Executa upgrade
    await adjustAcademyMoney(supabase, trainer.id, -cost);

    if (existing) {
      const { error } = await supabase
        .from("buildings")
        .update({ upgrade_completes_at: completesAt } as any)
        .eq("id", existing.id);
      if (error) {
        await adjustAcademyMoney(supabase, trainer.id, cost).catch(() => undefined);
        throw error;
      }
    } else {
      const { error } = await supabase
        .from("buildings")
        .insert({
          trainer_id: trainer.id,
          building_type: type,
          level: 0,
          upgrade_completes_at: completesAt,
        } as any);
      if (error) {
        await adjustAcademyMoney(supabase, trainer.id, cost).catch(() => undefined);
        throw error;
      }
    }

    await supabase.from("financial_transactions").insert({
      trainer_id: trainer.id,
      transaction_type: "expense",
      amount: cost,
      description: `Obra: ${spec.name} nível ${nextLevel}`,
    } as any);

    return { ok: true, completesAt };
  });

export const getBuildings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data, error } = await supabase
      .from("buildings")
      .select("*")
      .eq("trainer_id", userId);
    if (error) throw error;
    return data || [];
  });
