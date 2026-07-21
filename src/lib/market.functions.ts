import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  generateMarketListings,
  findListing,
  nextRotationTimestamp,
} from "./market.server";

async function getTrainerWithAcademy(
  supabase: any,
  userId: string,
): Promise<{ id: string; money: number; roster_slots: number }> {
  const { data: trainer, error } = await supabase
    .from("trainers")
    .select("id, academies(money, roster_slots)")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!trainer) throw new Error("Treinador não encontrado.");
  const academy = Array.isArray(trainer.academies) ? trainer.academies[0] : trainer.academies;
  if (!academy) throw new Error("Academia não encontrada.");
  return { id: trainer.id, money: academy.money, roster_slots: academy.roster_slots };
}

export const getMarket = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: trainer } = await supabase
      .from("trainers")
      .select("id, academies(money, gems, roster_slots)")
      .eq("user_id", userId)
      .maybeSingle();
    if (!trainer) throw new Error("Treinador não encontrado.");
    const academy = Array.isArray(trainer.academies) ? trainer.academies[0] : trainer.academies;

    const { data: creatures } = await supabase
      .from("creatures")
      .select("id, name, element, suggested_position, overall, energy, market_value")
      .eq("owner_trainer_id", trainer.id)
      .order("overall", { ascending: false });

    const listings = generateMarketListings(trainer.id);
    const rosterCount = creatures?.length ?? 0;

    return {
      money: academy?.money ?? 0,
      gems: academy?.gems ?? 0,
      roster_slots: academy?.roster_slots ?? 0,
      roster_count: rosterCount,
      my_creatures: creatures ?? [],
      listings,
      rotates_at: nextRotationTimestamp(),
    };
  });

export const buyCreature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ listing_id: z.string() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const trainer = await getTrainerWithAcademy(supabase, userId);

    // Contagem atual do elenco
    const { count } = await supabase
      .from("creatures")
      .select("id", { count: "exact", head: true })
      .eq("owner_trainer_id", trainer.id);
    const rosterCount = count ?? 0;
    if (rosterCount >= trainer.roster_slots) {
      throw new Error(
        `Elenco cheio (${rosterCount}/${trainer.roster_slots}). Venda uma criatura antes.`,
      );
    }

    const listing = findListing(trainer.id, data.listing_id);
    if (!listing) throw new Error("Oferta não encontrada ou já expirou.");

    if (trainer.money < listing.price) {
      throw new Error("Dinheiro insuficiente para essa contratação.");
    }

    // Cria a criatura
    const { data: created, error: cErr } = await supabase
      .from("creatures")
      .insert({
        owner_trainer_id: trainer.id,
        name: listing.name,
        element: listing.element,
        suggested_position: listing.suggested_position,
        attack: listing.attack,
        defense: listing.defense,
        goalkeeper: listing.goalkeeper,
        physical: listing.physical,
        strength: listing.strength,
        aff_fogo: listing.aff_fogo,
        aff_agua: listing.aff_agua,
        aff_terra: listing.aff_terra,
        aff_ar: listing.aff_ar,
        aff_gelo: listing.aff_gelo,
        overall: listing.overall,
        energy: 100,
        market_value: listing.market_value,
      })
      .select("id")
      .single();
    if (cErr) throw cErr;

    // Debita o dinheiro
    const { error: aErr } = await supabase
      .from("academies")
      .update({ money: trainer.money - listing.price })
      .eq("trainer_id", trainer.id);
    if (aErr) throw aErr;

    // Registra financeiro + transferência
    await supabase.from("financial_transactions").insert({
      trainer_id: trainer.id,
      transaction_type: "expense",
      amount: listing.price,
      description: `Contratação: ${listing.name} (${listing.seller})`,
    });
    await supabase.from("transfers").insert({
      trainer_id: trainer.id,
      creature_id: created.id,
      transfer_type: "buy",
      amount: listing.price,
    });

    return { creature_id: created.id, name: listing.name, price: listing.price };
  });

export const sellCreature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ creature_id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const trainer = await getTrainerWithAcademy(supabase, userId);

    // Não pode vender se ficar com menos de 11 criaturas
    const { count } = await supabase
      .from("creatures")
      .select("id", { count: "exact", head: true })
      .eq("owner_trainer_id", trainer.id);
    if ((count ?? 0) <= 11) {
      throw new Error("Você precisa manter no mínimo 11 criaturas no elenco.");
    }

    const { data: creature, error: fErr } = await supabase
      .from("creatures")
      .select("id, name, market_value")
      .eq("id", data.creature_id)
      .eq("owner_trainer_id", trainer.id)
      .maybeSingle();
    if (fErr) throw fErr;
    if (!creature) throw new Error("Criatura não encontrada.");

    // Preço de venda: 90% do valor de mercado
    const salePrice = Math.round((creature.market_value * 0.9) / 100) * 100;

    const { error: dErr } = await supabase
      .from("creatures")
      .delete()
      .eq("id", creature.id)
      .eq("owner_trainer_id", trainer.id);
    if (dErr) throw dErr;

    const { error: aErr } = await supabase
      .from("academies")
      .update({ money: trainer.money + salePrice })
      .eq("trainer_id", trainer.id);
    if (aErr) throw aErr;

    await supabase.from("financial_transactions").insert({
      trainer_id: trainer.id,
      transaction_type: "income",
      amount: salePrice,
      description: `Venda: ${creature.name}`,
    });
    await supabase.from("transfers").insert({
      trainer_id: trainer.id,
      creature_id: null,
      transfer_type: "sell",
      amount: salePrice,
    });

    return { sold: creature.name, amount: salePrice };
  });
