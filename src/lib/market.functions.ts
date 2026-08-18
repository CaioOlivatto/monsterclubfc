import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateMarketListings, generatePremiumMarketOffer, findListing, sellPriceForOverall } from "./market.server";
import { xpForHalfStars } from "./xp.server";
import {
  DIVISION_MAX_BAND,
  DIVISION_SALARY_CAP,
  refusalChance,
  divisionalMatchSalary,
  MATCHES_PER_SEASON,
  totalMaintenancePerMatch,
  type Division,
} from "./economy";
import { adjustAcademyMoney } from "./academy-money.server";

/** Divisão ATUAL do jogador — fonte única (time atual), nunca `competitions`. */
async function currentDivision(supabase: any, trainerId: string, currentTeamId?: string | null): Promise<Division> {
  const { resolvePlayerDivision } = await import("./division.server");
  return (await resolvePlayerDivision(supabase, trainerId, currentTeamId)) as Division;
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

async function currentPayroll(supabase: any, trainerId: string, division: Division): Promise<number> {
  const { data } = await supabase
    .from("creatures")
    .select("overall, salary_mult")
    .eq("owner_trainer_id", trainerId);
  return (data ?? []).reduce(
    (acc: number, c: any) => acc + Math.round(divisionalMatchSalary(c.overall ?? 40, division) * MATCHES_PER_SEASON * (c.salary_mult ?? 1)),
    0,
  );
}


export const getMarket = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: trainer } = await supabase
      .from("trainers")
      .select("id, current_team_id, academies(money, gems, roster_slots)")
      .eq("user_id", userId)
      .maybeSingle();
    if (!trainer) throw new Error("Treinador não encontrado.");
    const academy = Array.isArray(trainer.academies) ? trainer.academies[0] : trainer.academies;
    const { loadBestiary } = await import("./bestiary.server");
    const [seasonNumber, division, creaturesResult, bestiary] = await Promise.all([
      currentSeasonNumber(supabase, trainer.id),
      currentDivision(supabase, trainer.id, trainer.current_team_id),
      supabase
        .from("creatures")
        .select("id, name, element, suggested_position, overall, energy, market_value, age, is_prodigy, salary_mult")
        .eq("owner_trainer_id", trainer.id)
        .order("overall", { ascending: false }),
      loadBestiary(supabase),
    ]);
    if (creaturesResult.error) throw creaturesResult.error;
    const creatures = creaturesResult.data ?? [];
    const allListings = generateMarketListings(bestiary, trainer.id, seasonNumber, division);

    // Remove ofertas já compradas nesta temporada/divisão
    const [{ data: bought }, { data: premiumSigning }] = await Promise.all([
      supabase
        .from("market_purchases")
        .select("listing_id")
        .eq("trainer_id", trainer.id)
        .eq("season_number", seasonNumber)
        .eq("division", division),
      supabase
        .from("premium_signings")
        .select("id")
        .eq("trainer_id", trainer.id)
        .maybeSingle(),
    ]);
    const boughtSet = new Set((bought ?? []).map((r: any) => r.listing_id));
    const listings = allListings
      .filter((l) => !boughtSet.has(l.id))
      .map((l) => ({
        ...l,
        salary: divisionalMatchSalary(l.overall, division) * MATCHES_PER_SEASON,
        salary_per_match: divisionalMatchSalary(l.overall, division),
      }));

    const rosterCount = creatures.length;
    // O elenco já foi carregado para a aba "Vender"; reutilizamos esses dados
    // para a folha, evitando uma segunda consulta completa à mesma tabela.
    const payroll = creatures.reduce(
      (acc: number, creature: any) => acc + Math.round(divisionalMatchSalary(creature.overall ?? 40, division) * MATCHES_PER_SEASON * (creature.salary_mult ?? 1)),
      0,
    );
    const minimumOperatingReserve = Math.round(
      5 * (
        payroll / 26 +
        totalMaintenancePerMatch(division, [
          { building_type: "estadio", level: 1 },
          { building_type: "ct_treino", level: 1 },
          { building_type: "centro_medico", level: 1 },
        ])
      ),
    );

    return {
      money: academy?.money ?? 0,
      gems: academy?.gems ?? 0,
      roster_slots: academy?.roster_slots ?? 0,
      roster_count: rosterCount,
      my_creatures: creatures.map(({ salary_mult: _salaryMult, ...creature }: any) => ({
        ...creature,
        sell_price: sellPriceForOverall(creature.overall ?? 0, creature.age ?? 24),
      })),
      listings,
      premium_offer: premiumSigning
        ? null
        : generatePremiumMarketOffer(bestiary, trainer.id, seasonNumber, division),
      premium_offer_used: !!premiumSigning,
      season_number: seasonNumber,
      division,
      max_band: DIVISION_MAX_BAND[division],
      salary_cap: DIVISION_SALARY_CAP[division],
      payroll,
      minimum_operating_reserve: minimumOperatingReserve,
      rotation_label: "Próxima renovação: início da próxima temporada",
    };
  });

/** Multiplicador da contraproposta do veterano (passe e salário). */
export const VETERAN_COUNTER_MULT = 1.5;
/** Idade mínima para o veterano topar "descer" mediante pagamento. */
export const VETERAN_MIN_AGE = 25;

export const buyCreature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ listing_id: z.string(), accept_counter: z.boolean().optional() }).parse(raw),
  )
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

    // §8.1 — Calibre por divisão (avaliado do zero a cada proposta)
    const maxBand = DIVISION_MAX_BAND[trainer.division];
    const refuse = refusalChance(trainer.division, listing.half_star_band);
    console.log(
      `[market/buy] trainer=${trainer.id} division_atual=${trainer.division} (fonte: time atual do jogador) ` +
        `alvo=${listing.name} band=${listing.half_star_band} (${(listing.half_star_band / 2).toFixed(1)}★) ` +
        `max_band=${maxBand} chance_recusa=${refuse} idade=${listing.age} accept_counter=${!!data.accept_counter}`,
    );
    if (listing.half_star_band > maxBand) {
      throw new Error(
        `Sua divisão só pode contratar até ${Math.ceil(maxBand / 2)}★. Essa criatura tem ${(listing.half_star_band / 2).toFixed(1)}★.`,
      );
    }

    // Zona de recusa (banda mais alta permitida em Bronze/Prata/Ouro).
    const inRefusalZone = refuse > 0;
    const isVeteran = (listing.age ?? 18) >= VETERAN_MIN_AGE;
    // Aceitar a contraproposta só é válido dentro da zona de recusa e para veteranos.
    const premium = inRefusalZone && isVeteran && !!data.accept_counter;

    const baseSalary = divisionalMatchSalary(listing.overall, trainer.division) * MATCHES_PER_SEASON;

    if (inRefusalZone && !premium && Math.random() < refuse) {
      // §8.1b — Negociação por idade
      if (!isVeteran) {
        return {
          refused: true as const,
          counter_offer: null,
          name: listing.name,
          message: `${listing.name} recusou a proposta e não quer negociar.`,
        };
      }
      return {
        refused: true as const,
        name: listing.name,
        message: `${listing.name} recusou a proposta, mas topa por outros termos:`,
        counter_offer: {
          listing_id: listing.id,
          age: listing.age,
          price: Math.round(listing.price * VETERAN_COUNTER_MULT),
          base_price: listing.price,
          salary: Math.round(baseSalary * VETERAN_COUNTER_MULT),
          base_salary: baseSalary,
          salary_per_match: Math.round(divisionalMatchSalary(listing.overall, trainer.division) * VETERAN_COUNTER_MULT),
          multiplier: VETERAN_COUNTER_MULT,
        },
      };
    }

    const salaryMult = premium ? VETERAN_COUNTER_MULT : 1;
    const price = premium ? Math.round(listing.price * VETERAN_COUNTER_MULT) : listing.price;

    // §8.2 — Teto de folha salarial
    const payroll = await currentPayroll(supabase, trainer.id, trainer.division);
    const addSalary = Math.round(baseSalary * salaryMult);
    const cap = DIVISION_SALARY_CAP[trainer.division];
    if (payroll + addSalary > cap) {
      throw new Error(
        `Teto de folha estourado: $${(payroll + addSalary).toLocaleString("pt-BR")} > $${cap.toLocaleString("pt-BR")}. Venda alguém antes.`,
      );
    }

    if (trainer.money < price) {
      throw new Error("Dinheiro insuficiente para essa contratação.");
    }


    // Reserva o valor atomicamente antes de criar o atleta. Se a criação
    // falhar, o bloco de compensação devolve integralmente o dinheiro.
    await adjustAcademyMoney(supabase, trainer.id, -price);
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
        // Estrelas são a força inata (mesma regra do elenco inicial e do mundo):
        // meia-estrelas = overall/10. Sem isso, a criatura comprada nascia com 0★.
        half_stars_earned: Math.max(0, Math.min(10, Math.round((listing.overall ?? 0) / 10))),
        career_baseline_xp: xpForHalfStars(Math.max(0, Math.min(10, Math.round((listing.overall ?? 0) / 10)))),
        energy: 100,

        market_value: listing.market_value,
        age: listing.age,
        aff_fogo: 0, aff_agua: 0, aff_terra: 0, aff_ar: 0, aff_gelo: 0,
        is_prodigy: !!(listing as any).is_prodigy,
        salary_mult: salaryMult,
      } as any)
      .select("id")
      .single();
    if (cErr) {
      await adjustAcademyMoney(supabase, trainer.id, price).catch(() => undefined);
      throw cErr;
    }

    await supabase.from("financial_transactions").insert({
      trainer_id: trainer.id,
      transaction_type: "expense",
      amount: price,
      description: `Contratação: ${listing.name} (${listing.seller})${premium ? " — contraproposta aceita" : ""}`,
    });
    await supabase.from("transfers").insert({
      trainer_id: trainer.id,
      creature_id: created.id,
      transfer_type: "buy",
      amount: price,
    });
    await supabase.from("market_purchases").insert({
      trainer_id: trainer.id,
      season_number: trainer.season_number,
      division: trainer.division,
      listing_id: listing.id,
    });

    const newPayroll = payroll + addSalary;
    return {
      refused: false as const,
      counter_offer: null,
      message: null,
      creature_id: created.id,
      name: listing.name,
      price,
      salary: addSalary,
      salary_per_match: Math.round(divisionalMatchSalary(listing.overall, trainer.division) * salaryMult),
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

    const { data: result, error } = await supabase.rpc("sell_creature_atomic", {
      p_trainer_id: trainer.id,
      p_creature_id: data.creature_id,
    });
    if (error) throw error;
    const sale = result as { name: string; amount: number };
    return { sold: sale.name, amount: sale.amount };
  });
