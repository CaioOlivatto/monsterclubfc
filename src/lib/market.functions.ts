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
import { getDirectSession } from "./direct-session.server";
import { recordTelemetryBestEffort } from "./telemetry.server";
import { GEM_ECONOMY_CONFIG, refreshCost, type MarketScoutPosition } from "./gem-economy";

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
): Promise<{ id: string; money: number; gems: number; roster_slots: number; season_number: number; division: Division }> {
  const { data: trainer, error } = await supabase
    .from("trainers")
    .select("id, academies(money, gems, roster_slots)")
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
    gems: academy.gems,
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

async function marketCycleContext(supabase: any) {
  const { data, error } = await supabase.rpc("get_market_cycle_context" as any);
  if (error) throw error;
  return data as { cycle_number: number; refresh_count: number; rotation_number: number; scout_position: MarketScoutPosition | null; cycle_ends_at: string };
}

async function loadMarketForUser(supabase: any, userId: string) {
  const { data: trainer, error: trainerError } = await supabase
    .from("trainers")
    .select("id, current_team_id, trainer_name, academy_name, level, xp, academies(money, gems, roster_slots)")
    .eq("user_id", userId)
    .maybeSingle();
  if (trainerError) throw trainerError;
  if (!trainer) throw new Error("Treinador não encontrado.");
  void supabase.rpc("record_weekly_mission_progress", { p_event: "market_opened", p_increment: 1 });
  const academy = Array.isArray(trainer.academies) ? trainer.academies[0] : trainer.academies;
  const { loadBestiary } = await import("./bestiary.server");
  const [seasonNumber, division, creaturesResult, bestiary, cycle] = await Promise.all([
    currentSeasonNumber(supabase, trainer.id),
    currentDivision(supabase, trainer.id, trainer.current_team_id),
    supabase.from("creatures").select("id, name, element, suggested_position, overall, energy, market_value, age, is_prodigy, salary_mult").eq("owner_trainer_id", trainer.id).order("overall", { ascending: false }),
    loadBestiary(supabase),
    marketCycleContext(supabase),
  ]);
  if (creaturesResult.error) throw creaturesResult.error;
  const creatures = creaturesResult.data ?? [];
  const rotationKey = `${cycle.cycle_number}:${cycle.rotation_number}`;
  const allListings = generateMarketListings(bestiary, trainer.id, seasonNumber, division, 24, rotationKey, cycle.scout_position);
  const [{ data: bought }, { data: premiumSigning }] = await Promise.all([
    supabase.from("market_purchases").select("listing_id").eq("trainer_id", trainer.id).eq("season_number", seasonNumber).eq("division", division),
    supabase.from("premium_signings" as any).select("id").eq("trainer_id", trainer.id).eq("season_number", seasonNumber).eq("division", division).maybeSingle(),
  ]);
  const boughtSet = new Set((bought ?? []).map((row: any) => row.listing_id));
  const listings = allListings.filter((listing) => !boughtSet.has(listing.id)).map((listing) => ({
    ...listing,
    salary: divisionalMatchSalary(listing.overall, division) * MATCHES_PER_SEASON,
    salary_per_match: divisionalMatchSalary(listing.overall, division),
  }));
  const payroll = creatures.reduce((total: number, creature: any) => total + Math.round(divisionalMatchSalary(creature.overall ?? 40, division) * MATCHES_PER_SEASON * (creature.salary_mult ?? 1)), 0);
  const minimumOperatingReserve = Math.round(5 * (payroll / 26 + totalMaintenancePerMatch(division, [
    { building_type: "estadio", level: 1 }, { building_type: "ct_treino", level: 1 }, { building_type: "centro_medico", level: 1 },
  ])));
  return {
    trainer: {
      name: trainer.trainer_name ?? "Treinador",
      academyName: trainer.academy_name ?? "Meu clube",
      level: trainer.level ?? 0,
      xpIntoLevel: trainer.xp ?? 0,
      xpForNextLevel: 350,
    },
    money: academy?.money ?? 0, gems: academy?.gems ?? 0, roster_slots: academy?.roster_slots ?? 0,
    roster_count: creatures.length,
    my_creatures: creatures.map(({ salary_mult: _salaryMult, ...creature }: any) => ({ ...creature, sell_price: sellPriceForOverall(creature.overall ?? 0, creature.age ?? 24) })),
    listings, premium_offer: premiumSigning || !premiumAppears(trainer.id, cycle.cycle_number, cycle.rotation_number) ? null : generatePremiumMarketOffer(bestiary, trainer.id, seasonNumber, division),
    premium_offer_used: !!premiumSigning, season_number: seasonNumber, division, max_band: DIVISION_MAX_BAND[division],
    salary_cap: DIVISION_SALARY_CAP[division], payroll, minimum_operating_reserve: minimumOperatingReserve,
    market_cycle: cycle,
    next_refresh_cost: refreshCost(cycle.refresh_count + 1, division),
    rotation_label: `Renova automaticamente em ${new Date(cycle.cycle_ends_at).toLocaleString("pt-BR")}`,
  };
}

function premiumAppears(trainerId: string, cycle: number, rotation: number) {
  let hash = 2166136261;
  for (const char of `${trainerId}:${cycle}:${rotation}:premium`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296 < GEM_ECONOMY_CONFIG.premiumFrequency;
}

// O host publicado nem sempre encaminha a sessão para server functions GET.
// Esta entrada recebe a sessão que o próprio Supabase do navegador já validou.
export const getMarketWithSession = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => z.object({ access_token: z.string().min(20) }).parse(raw))
  .handler(async ({ data }) => {
    const { supabase, userId } = await getDirectSession(data.access_token);
    return loadMarketForUser(supabase, userId);
  });


export const getMarket = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return loadMarketForUser(context.supabase, context.userId);
  });

const marketActionInput = z.object({
  access_token: z.string().min(20),
  idempotency_key: z.string().min(8).max(160),
});

export const refreshMarketWithSession = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => marketActionInput.parse(raw))
  .handler(async ({ data }) => {
    const { supabase, userId } = await getDirectSession(data.access_token);
    const trainer = await getTrainerWithAcademy(supabase, userId);
    const { data: result, error } = await supabase.rpc("refresh_market_atomic" as any, {
      p_division: trainer.division,
      p_idempotency_key: data.idempotency_key,
    });
    if (error) throw error;
    await recordTelemetryBestEffort(supabase, "market_refreshed", "/market", result ?? {});
    return result;
  });

export const useMarketScoutWithSession = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => marketActionInput.extend({ position: z.enum(["GOL", "DEF", "MEI", "ATA"]) }).parse(raw))
  .handler(async ({ data }) => {
    const { supabase } = await getDirectSession(data.access_token);
    const { data: result, error } = await supabase.rpc("use_market_scout_atomic" as any, {
      p_position: data.position,
      p_idempotency_key: data.idempotency_key,
    });
    if (error) throw error;
    await recordTelemetryBestEffort(supabase, "market_scout_used", "/market", { position: data.position });
    return result;
  });

/** Multiplicador da contraproposta do veterano (passe e salário). */
export const VETERAN_COUNTER_MULT = 1.5;
/** Idade mínima para o veterano topar "descer" mediante pagamento. */
export const VETERAN_MIN_AGE = 25;

async function buyCreatureForUser(
  supabase: any,
  userId: string,
  data: { listing_id: string; accept_counter?: boolean; currency?: "money" | "gems" },
) {
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
    const cycle = await marketCycleContext(supabase);
    const listing = findListing(bestiary, trainer.id, trainer.season_number, trainer.division, data.listing_id, `${cycle.cycle_number}:${cycle.rotation_number}`, cycle.scout_position);
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
    const moneyPrice = premium ? Math.round(listing.price * VETERAN_COUNTER_MULT) : listing.price;
    const currency = data.currency ?? "money";
    const price = currency === "gems" ? listing.gem_price : moneyPrice;

    // §8.2 — Teto de folha salarial
    const payroll = await currentPayroll(supabase, trainer.id, trainer.division);
    const addSalary = Math.round(baseSalary * salaryMult);
    const cap = DIVISION_SALARY_CAP[trainer.division];
    if (payroll + addSalary > cap) {
      throw new Error(
        `Teto de folha estourado: $${(payroll + addSalary).toLocaleString("pt-BR")} > $${cap.toLocaleString("pt-BR")}. Venda alguém antes.`,
      );
    }

    if (currency === "money" && trainer.money < price) {
      throw new Error("Dinheiro insuficiente para essa contratação.");
    }
    if (currency === "gems" && trainer.gems < price) throw new Error("Gemas insuficientes para essa contratação.");


    const halfStars = Math.max(0, Math.min(10, Math.round((listing.overall ?? 0) / 10)));
    const idempotencyKey = `market-player:${trainer.id}:${cycle.cycle_number}:${listing.id}:${currency}:${salaryMult}`;
    const { data: purchase, error: purchaseError } = await supabase.rpc("purchase_market_creature_atomic" as any, {
      p_listing: { ...listing, career_baseline_xp: xpForHalfStars(halfStars) },
      p_currency: currency,
      p_price: price,
      p_season_number: trainer.season_number,
      p_division: trainer.division,
      p_is_premium: false,
      p_salary_mult: salaryMult,
      p_idempotency_key: idempotencyKey,
    });
    if (purchaseError) throw purchaseError;
    const createdId = (purchase as any).creature_id as string;
    await recordTelemetryBestEffort(supabase, "player_signed", "/market", {
      creature_id: createdId,
      price,
      currency,
      division: trainer.division,
      overall: listing.overall,
    });
    void supabase.rpc("record_weekly_mission_progress", { p_event: "player_signed", p_increment: 1 });

    const newPayroll = payroll + addSalary;
    return {
      refused: false as const,
      counter_offer: null,
      message: null,
      creature_id: createdId,
      name: listing.name,
      price,
      currency,
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
      roster_count_after: (purchase as any).roster_count_after ?? rosterCount + 1,
    };
}

async function buyPremiumCreatureForUser(supabase: any, userId: string, data: { offer_id: string }) {
  const trainer = await getTrainerWithAcademy(supabase, userId);
  const [{ loadBestiary }, cycle] = await Promise.all([import("./bestiary.server"), marketCycleContext(supabase)]);
  if (!premiumAppears(trainer.id, cycle.cycle_number, cycle.rotation_number)) throw new Error("A oferta rara não está mais disponível.");
  const bestiary = await loadBestiary(supabase);
  const offer = generatePremiumMarketOffer(bestiary, trainer.id, trainer.season_number, trainer.division);
  if (offer.id !== data.offer_id) throw new Error("Oferta premium inválida ou expirada.");

  const [{ count }, { data: signing }] = await Promise.all([
    supabase.from("creatures").select("id", { count: "exact", head: true }).eq("owner_trainer_id", trainer.id),
    supabase.from("premium_signings" as any).select("id").eq("trainer_id", trainer.id).eq("season_number", trainer.season_number).eq("division", trainer.division).maybeSingle(),
  ]);
  if (signing) throw new Error("A contratação premium desta temporada e divisão já foi utilizada.");
  if ((count ?? 0) >= trainer.roster_slots) throw new Error("Elenco cheio. Venda uma criatura antes.");
  if (trainer.gems < offer.gem_price) throw new Error("Gemas insuficientes para esta contratação premium.");

  const payroll = await currentPayroll(supabase, trainer.id, trainer.division);
  const addSalary = divisionalMatchSalary(offer.overall, trainer.division) * MATCHES_PER_SEASON;
  const cap = DIVISION_SALARY_CAP[trainer.division];
  if (payroll + addSalary > cap) throw new Error("Esta contratação ultrapassaria o teto salarial da divisão.");
  const halfStars = Math.max(0, Math.min(10, Math.round(offer.overall / 10)));
  const { data: purchase, error } = await supabase.rpc("purchase_market_creature_atomic" as any, {
    p_listing: { ...offer, career_baseline_xp: xpForHalfStars(halfStars) },
    p_currency: "gems",
    p_price: offer.gem_price,
    p_season_number: trainer.season_number,
    p_division: trainer.division,
    p_is_premium: true,
    p_salary_mult: 1,
    p_idempotency_key: `premium-player:${trainer.id}:${trainer.season_number}:${trainer.division}:${offer.id}`,
  });
  if (error) throw error;
  await recordTelemetryBestEffort(supabase, "premium_player_signed", "/market", { division: trainer.division, season_number: trainer.season_number, gems: offer.gem_price, overall: offer.overall });
  void supabase.rpc("record_weekly_mission_progress", { p_event: "player_signed", p_increment: 1 });
  return {
    ...(purchase as any), refused: false as const, counter_offer: null, message: null,
    name: offer.name, price: offer.gem_price, currency: "gems" as const, salary: addSalary,
    salary_per_match: divisionalMatchSalary(offer.overall, trainer.division), element: offer.element,
    position: offer.suggested_position, overall: offer.overall, stars: offer.overall / 20,
    payroll_before: payroll, payroll_after: payroll + addSalary, salary_cap: cap,
  };
}

const buyCreatureInput = z.object({ listing_id: z.string(), accept_counter: z.boolean().optional(), currency: z.enum(["money", "gems"]).optional() });

export const buyCreature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => buyCreatureInput.parse(raw))
  .handler(async ({ data, context }) => buyCreatureForUser(context.supabase, context.userId, data));

export const buyCreatureWithSession = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => buyCreatureInput.extend({ access_token: z.string().min(20) }).parse(raw))
  .handler(async ({ data }) => {
    const { supabase, userId } = await getDirectSession(data.access_token);
    return buyCreatureForUser(supabase, userId, data);
  });

const buyPremiumInput = z.object({ offer_id: z.string(), access_token: z.string().min(20) });
export const buyPremiumCreatureWithSession = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => buyPremiumInput.parse(raw))
  .handler(async ({ data }) => {
    const { supabase, userId } = await getDirectSession(data.access_token);
    return buyPremiumCreatureForUser(supabase, userId, data);
  });

async function sellCreatureForUser(supabase: any, userId: string, data: { creature_id: string }) {
    const trainer = await getTrainerWithAcademy(supabase, userId);

    const { data: result, error } = await supabase.rpc("sell_creature_atomic" as any, {
      p_trainer_id: trainer.id,
      p_creature_id: data.creature_id,
    });
    if (error) throw error;
    const sale = result as { name: string; amount: number };
    return { sold: sale.name, amount: sale.amount };
}

const sellCreatureInput = z.object({ creature_id: z.string().uuid() });

export const sellCreature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => sellCreatureInput.parse(raw))
  .handler(async ({ data, context }) => sellCreatureForUser(context.supabase, context.userId, data));

export const sellCreatureWithSession = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => sellCreatureInput.extend({ access_token: z.string().min(20) }).parse(raw))
  .handler(async ({ data }) => {
    const { supabase, userId } = await getDirectSession(data.access_token);
    return sellCreatureForUser(supabase, userId, data);
  });
