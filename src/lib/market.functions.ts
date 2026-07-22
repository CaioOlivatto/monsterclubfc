import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateMarketListings, findListing } from "./market.server";
import {
  DIVISION_MAX_BAND,
  DIVISION_SALARY_CAP,
  refusalChance,
  seasonSalary,
  matchSalary,
  type Division,
} from "./economy";

async function currentDivision(supabase: any, trainerId: string): Promise<Division> {
  const { data } = await supabase
    .from("competitions")
    .select("division")
    .eq("trainer_id", trainerId)
    .eq("type", "league")
    .eq("status", "active")
    .maybeSingle();
  return ((data?.division as Division) ?? "bronze") as Division;
}

async function currentSeasonNumber(supabase: any, trainerId: string): Promise<number> {
  const { data } = await supabase
    .from("game_seasons")
    .select("season_number")
    .eq("trainer_id", trainerId)
    .eq("is_current", true)
    .maybeSingle();
  return data?.season_number ?? 1;
}

async function getTrainerWithAcademy(
  supabase: any,
  userId: string,
): Promise<{ id: string; money: number; roster_slots: number; season_number: number; division: Division }> {
  const { data: trainer, error } = await supabase
    .from("trainers")
    .select("id, academies(money, roster_slots)")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!trainer) throw new Error("Treinador não encontrado.");
  const academy = Array.isArray(trainer.academies) ? trainer.academies[0] : trainer.academies;
  if (!academy) throw new Error("Academia não encontrada.");
  const [seasonNumber, division] = await Promise.all([
    currentSeasonNumber(supabase, trainer.id),
    currentDivision(supabase, trainer.id),
  ]);
  return {
    id: trainer.id,
    money: academy.money,
    roster_slots: academy.roster_slots,
    season_number: seasonNumber,
    division,
  };
}

async function currentPayroll(supabase: any, trainerId: string): Promise<number> {
  const { data } = await supabase
    .from("creatures")
    .select("overall")
    .eq("owner_trainer_id", trainerId);
  return (data ?? []).reduce((acc: number, c: any) => acc + seasonSalary(c.overall ?? 40), 0);
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
    const [seasonNumber, division] = await Promise.all([
      currentSeasonNumber(supabase, trainer.id),
      currentDivision(supabase, trainer.id),
    ]);

    const { data: creatures } = await supabase
      .from("creatures")
      .select("id, name, element, suggested_position, overall, energy, market_value")
      .eq("owner_trainer_id", trainer.id)
      .order("overall", { ascending: false });

    const { loadBestiary } = await import("./bestiary.server");
    const bestiary = await loadBestiary(supabase);
    const allListings = generateMarketListings(bestiary, trainer.id, seasonNumber, division);

    // Remove ofertas já compradas nesta temporada/divisão
    const { data: bought } = await supabase
      .from("market_purchases")
      .select("listing_id")
      .eq("trainer_id", trainer.id)
      .eq("season_number", seasonNumber)
      .eq("division", division);
    const boughtSet = new Set((bought ?? []).map((r: any) => r.listing_id));
    const listings = allListings
      .filter((l) => !boughtSet.has(l.id))
      .map((l) => ({
        ...l,
        salary: seasonSalary(l.overall),
        salary_per_match: matchSalary(l.overall),
      }));

    const rosterCount = creatures?.length ?? 0;
    const payroll = await currentPayroll(supabase, trainer.id);

    return {
      money: academy?.money ?? 0,
      gems: academy?.gems ?? 0,
      roster_slots: academy?.roster_slots ?? 0,
      roster_count: rosterCount,
      my_creatures: creatures ?? [],
      listings,
      season_number: seasonNumber,
      division,
      max_band: DIVISION_MAX_BAND[division],
      salary_cap: DIVISION_SALARY_CAP[division],
      payroll,
      rotation_label: "Próxima renovação: início da próxima temporada",
    };
  });

export const buyCreature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ listing_id: z.string() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const trainer = await getTrainerWithAcademy(supabase, userId);

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

    const { loadBestiary } = await import("./bestiary.server");
    const bestiary = await loadBestiary(supabase);
    const listing = findListing(bestiary, trainer.id, trainer.season_number, trainer.division, data.listing_id);
    if (!listing) throw new Error("Oferta não encontrada ou já expirou.");

    // §8.1 — Calibre por divisão
    const maxBand = DIVISION_MAX_BAND[trainer.division];
    if (listing.half_star_band > maxBand) {
      throw new Error(
        `Sua divisão só pode contratar até ${Math.ceil(maxBand / 2)}★. Essa criatura tem ${(listing.half_star_band / 2).toFixed(1)}★.`,
      );
    }

    // Chance de recusa em contratações no limite (§8.1)
    const refuse = refusalChance(trainer.division, listing.half_star_band);
    if (refuse > 0 && Math.random() < refuse) {
      throw new Error(`${listing.name} recusou a proposta — sua divisão ainda é pequena demais.`);
    }

    // §8.2 — Teto de folha salarial
    const payroll = await currentPayroll(supabase, trainer.id);
    const addSalary = seasonSalary(listing.overall);
    const cap = DIVISION_SALARY_CAP[trainer.division];
    if (payroll + addSalary > cap) {
      throw new Error(
        `Teto de folha estourado: $${(payroll + addSalary).toLocaleString("pt-BR")} > $${cap.toLocaleString("pt-BR")}. Venda alguém antes.`,
      );
    }

    if (trainer.money < listing.price) {
      throw new Error("Dinheiro insuficiente para essa contratação.");
    }

    const { data: created, error: cErr } = await supabase
      .from("creatures")
      .insert({
        owner_trainer_id: trainer.id,
        name: listing.name,
        species: listing.species,
        epithet: listing.epithet,
        element: listing.element,
        suggested_position: listing.suggested_position,
        is_goalkeeper: listing.is_goalkeeper,
        power_key: listing.power_key,
        attr_defender: listing.attr_defender,
        attr_passar: listing.attr_passar,
        attr_atacar: listing.attr_atacar,
        attr_tecnica: listing.attr_tecnica,
        attr_forca: listing.attr_forca,
        attr_pique: listing.attr_pique,
        attr_maos: listing.attr_maos,
        attr_concentracao: listing.attr_concentracao,
        attr_elasticidade: listing.attr_elasticidade,
        overall: listing.overall,
        energy: 100,
        market_value: listing.market_value,
        age: listing.age,
        aff_fogo: 0, aff_agua: 0, aff_terra: 0, aff_ar: 0, aff_gelo: 0,
      } as any)
      .select("id")
      .single();
    if (cErr) throw cErr;

    const { error: aErr } = await supabase
      .from("academies")
      .update({ money: trainer.money - listing.price })
      .eq("trainer_id", trainer.id);
    if (aErr) throw aErr;

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
    await supabase.from("market_purchases").insert({
      trainer_id: trainer.id,
      season_number: trainer.season_number,
      division: trainer.division,
      listing_id: listing.id,
    });

    const newPayroll = payroll + addSalary;
    return {
      creature_id: created.id,
      name: listing.name,
      price: listing.price,
      salary: addSalary,
      element: listing.element,
      position: listing.suggested_position,
      overall: listing.overall,
      stars: listing.overall / 20,
      payroll_before: payroll,
      payroll_after: newPayroll,
      salary_cap: cap,
      roster_slots: trainer.roster_slots,
      roster_count_after: rosterCount + 1,
    };
  });

export const sellCreature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ creature_id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const trainer = await getTrainerWithAcademy(supabase, userId);

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
