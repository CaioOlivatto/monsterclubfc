// Aposentadoria e Renascimento (§10 do Bestiário).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { computeLineOverall, computeGkOverall, computeMarketValue, ELITE_EPITHETS } from "./bestiary";
import { xpForHalfStars } from "./xp.server";

const IdSchema = z.object({ creature_id: z.string().uuid() });

// Tabela §10.2 — meia-estrelas ao renascer, em função das meia-estrelas atuais
function rebirthHalfStars(current: number): number {
  // 10=5★ -> 6=3★ ; 9=4,5★ -> 6=3★ ; 8=4★ -> 6=3★
  // 7=3,5★ -> 5=2,5★ ; 6=3★ -> 4=2★ ; 5=2,5★ -> 4=2★
  // 4=2★ -> 4 ; 3=1,5★ -> 3 ; 2=1★ -> 2 ; ≤1 -> mantém
  if (current >= 8) return 6;
  if (current === 7) return 5;
  if (current === 6) return 4;
  if (current === 5) return 4;
  return current;
}

export const retireCreature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => IdSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: trainer } = await supabase
      .from("trainers").select("id").eq("user_id", userId).maybeSingle();
    if (!trainer) throw new Error("Treinador não encontrado.");

    const { data: result, error } = await supabase.rpc("retire_creature_atomic", {
      p_trainer_id: trainer.id,
      p_creature_id: data.creature_id,
    });
    if (error) throw error;
    const retirement = result as { name: string; amount: number };
    return { retired: retirement.name, payout: retirement.amount };
  });

export const rebirthCreature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => IdSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: trainer } = await supabase
      .from("trainers").select("id").eq("user_id", userId).maybeSingle();
    if (!trainer) throw new Error("Treinador não encontrado.");

    const { data: c } = await supabase
      .from("creatures").select("*")
      .eq("id", data.creature_id).eq("owner_trainer_id", trainer.id).maybeSingle();
    if (!c) throw new Error("Criatura não encontrada.");
    if ((c.age ?? 18) < 33) throw new Error("Só pode renascer aos 33 anos.");
    if (c.retired) throw new Error("Criatura já aposentada.");

    const currentHs = c.half_stars_earned ?? 0;
    const newHs = rebirthHalfStars(currentHs);
    const targetXp = xpForHalfStars(newHs);

    // Elite epíteto persistido, se atingiu 5★
    let epithet = c.epithet;
    if (currentHs >= 10 && !ELITE_EPITHETS.includes(String(c.epithet))) {
      const seed = (c.id?.charCodeAt(0) ?? 0) + Date.now();
      epithet = ELITE_EPITHETS[seed % ELITE_EPITHETS.length];
    }
    const speciesName = c.species ?? c.name?.split(" ")[0] ?? "Criatura";
    const newName = `${speciesName} ${epithet}`;

    const isGk = c.is_goalkeeper ?? c.suggested_position === "Goleiro";
    // Escala proporcional dos atributos: alvo overall aproximado = newHs*10
    const currOverall = c.overall ?? 40;
    const targetOverall = Math.max(10, newHs * 10);
    const scale = targetOverall / Math.max(1, currOverall);
    const scl = (n: number) => Math.max(5, Math.min(100, Math.round((n ?? 20) * scale)));

    const patch: any = {
      age: 18,
      career_season: 1,
      // O renascimento devolve progresso de CURVA, não saldo gastável em treino.
      xp: 0,
      xp_spent_training: 0,
      career_baseline_xp: targetXp,
      half_stars_earned: newHs,
      pending_half_stars: 0,
      energy: 100,
      // Renasceu jovem (18 anos): perde qualquer prêmio salarial de veterano.
      salary_mult: 1,

      epithet,
      name: newName,
      attr_defender: scl(c.attr_defender), attr_passar: scl(c.attr_passar),
      attr_atacar: scl(c.attr_atacar),     attr_tecnica: scl(c.attr_tecnica),
      attr_forca: scl(c.attr_forca),       attr_pique: scl(c.attr_pique),
      attr_maos: scl(c.attr_maos),
      attr_concentracao: scl(c.attr_concentracao),
      attr_elasticidade: scl(c.attr_elasticidade),
    };
    const overall = isGk
      ? computeGkOverall({ maos: patch.attr_maos, concentracao: patch.attr_concentracao, elasticidade: patch.attr_elasticidade })
      : computeLineOverall({
          defender: patch.attr_defender, passar: patch.attr_passar, atacar: patch.attr_atacar,
          tecnica: patch.attr_tecnica, forca: patch.attr_forca, pique: patch.attr_pique,
        }, (c.suggested_position as any) ?? "Meio-campo");
    patch.overall = overall;
    patch.market_value = computeMarketValue(overall, 18);

    const { error } = await supabase.from("creatures").update(patch).eq("id", c.id);
    if (error) throw error;
    return { rebirth: newName, half_stars: newHs, overall };
  });
