/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getDirectSession } from "./direct-session.server";
import { BUILDINGS, BUILDING_TYPES, type BuildingType } from "./buildings.server";

const buildingTypeSchema = z.enum(["ct_treino", "estadio", "centro_medico"]);
const sessionSchema = z.object({ access_token: z.string().min(20) });
const buildingSessionSchema = sessionSchema.extend({ type: buildingTypeSchema });

// Idempotente: contas criadas ou recuperadas parcialmente sempre recebem as três estruturas.
async function ensureBuildingFoundation(supabase: any, trainerId: string) {
  const { data: academy, error: academyError } = await supabase.from("academies").select("id").eq("trainer_id", trainerId).maybeSingle();
  if (academyError) throw academyError;
  if (!academy) {
    const { error } = await supabase.from("academies").insert({ trainer_id: trainerId, money: 400000, gems: 50, builders: 1, roster_slots: 26 });
    if (error) throw error;
  }
  const { data: current, error: buildingsError } = await supabase.from("buildings").select("building_type").eq("trainer_id", trainerId);
  if (buildingsError) throw buildingsError;
  const present = new Set((current ?? []).map((building: any) => building.building_type));
  const missing = BUILDING_TYPES.filter((type) => !present.has(type)).map((building_type) => ({ trainer_id: trainerId, building_type, level: 1 }));
  if (missing.length) {
    const { error } = await supabase.from("buildings").insert(missing as any);
    if (error) throw error;
  }
}

async function trainerForUser(supabase: any, userId: string) {
  const { data: trainer, error } = await supabase.from("trainers").select("id, trainer_name, academy_name, level, xp").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!trainer) throw new Error("Treinador não encontrado. Entre novamente para continuar.");
  return trainer;
}

async function completeFinishedUpgrades(supabase: any, trainerId: string) {
  const { data: rows, error } = await supabase.from("buildings").select("id, building_type, level, upgrade_completes_at").eq("trainer_id", trainerId).not("upgrade_completes_at", "is", null);
  if (error) throw error;
  const now = Date.now();
  await Promise.all((rows ?? []).filter((row: any) => new Date(row.upgrade_completes_at).getTime() <= now).map((row: any) =>
    supabase.from("buildings").update({ level: Math.min(BUILDINGS[row.building_type as BuildingType].maxLevel, (row.level ?? 0) + 1), upgrade_completes_at: null } as any).eq("id", row.id),
  ));
}

function maintenance(type: BuildingType, level: number) {
  const base: Record<BuildingType, number> = { ct_treino: 9000, estadio: 18000, centro_medico: 6000 };
  return Math.round(base[type] * (1 + Math.max(0, level - 1) * 0.18));
}

async function loadBuildingsForUser(supabase: any, userId: string) {
  const trainer = await trainerForUser(supabase, userId);
  await ensureBuildingFoundation(supabase, trainer.id);
  await completeFinishedUpgrades(supabase, trainer.id);
  const [{ data: academy, error: academyError }, { data: rows, error: rowsError }] = await Promise.all([
    supabase.from("academies").select("money, gems, builders").eq("trainer_id", trainer.id).maybeSingle(),
    supabase.from("buildings").select("id, building_type, level, upgrade_completes_at").eq("trainer_id", trainer.id),
  ]);
  if (academyError) throw academyError;
  if (rowsError) throw rowsError;
  const byType = new Map((rows ?? []).map((row: any) => [row.building_type, row]));
  const now = Date.now();
  const buildings = BUILDING_TYPES.map((type) => {
    const row: any = byType.get(type);
    const spec = BUILDINGS[type];
    const level = Math.max(1, Math.min(spec.maxLevel, Number(row?.level ?? 1)));
    const upgrading = Boolean(row?.upgrade_completes_at && new Date(row.upgrade_completes_at).getTime() > now);
    const nextLevel = Math.min(spec.maxLevel, level + 1);
    return {
      id: row?.id ?? type, type, name: spec.name, description: spec.description, level, maxLevel: spec.maxLevel, upgrading,
      completes_at: upgrading ? row.upgrade_completes_at : null,
      currentEffect: spec.effectByLevel(level), nextEffect: level < spec.maxLevel ? spec.effectByLevel(nextLevel) : null,
      nextCost: level < spec.maxLevel ? spec.cost(nextLevel) : 0, nextDurationSec: level < spec.maxLevel ? spec.duration(nextLevel) : 0,
      maintenancePerMatch: maintenance(type, level), nextMaintenancePerMatch: level < spec.maxLevel ? maintenance(type, nextLevel) : undefined,
    };
  });
  return {
    trainer: { name: trainer.trainer_name, level: trainer.level ?? 0, academyName: trainer.academy_name, xpIntoLevel: trainer.xp ?? 0, xpForNextLevel: 350 },
    gems: academy?.gems ?? 0, money: academy?.money ?? 0, builders: academy?.builders ?? 1,
    builders_busy: buildings.some((building) => building.upgrading) ? 1 : 0, buildings,
  };
}

async function startUpgradeForUser(supabase: any, userId: string, type: BuildingType) {
  const trainer = await trainerForUser(supabase, userId);
  await ensureBuildingFoundation(supabase, trainer.id);
  await completeFinishedUpgrades(supabase, trainer.id);
  const [{ data: academy, error: academyError }, { data: building, error: buildingError }, { data: busy, error: busyError }] = await Promise.all([
    supabase.from("academies").select("money").eq("trainer_id", trainer.id).maybeSingle(),
    supabase.from("buildings").select("id, level").eq("trainer_id", trainer.id).eq("building_type", type).maybeSingle(),
    supabase.from("buildings").select("id").eq("trainer_id", trainer.id).not("upgrade_completes_at", "is", null),
  ]);
  if (academyError || buildingError || busyError) throw academyError ?? buildingError ?? busyError;
  if (!academy || !building) throw new Error("Não foi possível preparar esta construção.");
  if ((busy ?? []).length) throw new Error("Seu construtor já está trabalhando em outra obra.");
  const spec = BUILDINGS[type];
  const level = Number(building.level ?? 1);
  if (level >= spec.maxLevel) throw new Error("Esta estrutura já está no nível máximo.");
  const nextLevel = level + 1;
  const cost = spec.cost(nextLevel);
  if ((academy.money ?? 0) < cost) throw new Error("Saldo insuficiente para iniciar esta obra.");
  const completesAt = new Date(Date.now() + spec.duration(nextLevel) * 1000).toISOString();
  const { error: academyUpdateError } = await supabase.from("academies").update({ money: academy.money - cost }).eq("trainer_id", trainer.id);
  if (academyUpdateError) throw academyUpdateError;
  const { error: buildingUpdateError } = await supabase.from("buildings").update({ upgrade_completes_at: completesAt } as any).eq("id", building.id);
  if (buildingUpdateError) throw buildingUpdateError;
  return { ok: true, completesAt };
}

async function finishUpgradeForUser(supabase: any, userId: string, type: BuildingType) {
  const trainer = await trainerForUser(supabase, userId);
  const [{ data: academy, error: academyError }, { data: building, error: buildingError }] = await Promise.all([
    supabase.from("academies").select("gems").eq("trainer_id", trainer.id).maybeSingle(),
    supabase.from("buildings").select("id, level, upgrade_completes_at").eq("trainer_id", trainer.id).eq("building_type", type).maybeSingle(),
  ]);
  if (academyError || buildingError) throw academyError ?? buildingError;
  if (!building?.upgrade_completes_at) return { spent: 0 };
  const remainingMs = Math.max(0, new Date(building.upgrade_completes_at).getTime() - Date.now());
  const spent = remainingMs > 0 ? Math.max(1, Math.ceil(remainingMs / 600000)) : 0;
  if ((academy?.gems ?? 0) < spent) throw new Error("Gemas insuficientes para concluir agora.");
  if (spent) {
    const { error } = await supabase.from("academies").update({ gems: academy.gems - spent }).eq("trainer_id", trainer.id);
    if (error) throw error;
  }
  const { error } = await supabase.from("buildings").update({ level: Math.min(BUILDINGS[type].maxLevel, Number(building.level ?? 1) + 1), upgrade_completes_at: null } as any).eq("id", building.id);
  if (error) throw error;
  return { spent };
}

export const getBuildingsWithSession = createServerFn({ method: "POST" }).inputValidator((raw: unknown) => sessionSchema.parse(raw))
  .handler(async ({ data }) => { const { supabase, userId } = await getDirectSession(data.access_token); return loadBuildingsForUser(supabase, userId); });
export const startUpgradeWithSession = createServerFn({ method: "POST" }).inputValidator((raw: unknown) => buildingSessionSchema.parse(raw))
  .handler(async ({ data }) => { const { supabase, userId } = await getDirectSession(data.access_token); return startUpgradeForUser(supabase, userId, data.type); });
export const finishNowWithGemsWithSession = createServerFn({ method: "POST" }).inputValidator((raw: unknown) => buildingSessionSchema.parse(raw))
  .handler(async ({ data }) => { const { supabase, userId } = await getDirectSession(data.access_token); return finishUpgradeForUser(supabase, userId, data.type); });

// Mantidos para o ambiente local, que encaminha o contexto de sessão normalmente.
export const getBuildings = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => loadBuildingsForUser(context.supabase, context.userId));
export const upgradeBuilding = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((raw: unknown) => z.object({ type: buildingTypeSchema }).parse(raw))
  .handler(async ({ data, context }) => startUpgradeForUser(context.supabase, context.userId, data.type));
export const startUpgrade = upgradeBuilding;
export const finishNowWithGems = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((raw: unknown) => z.object({ type: buildingTypeSchema }).parse(raw))
  .handler(async ({ data, context }) => finishUpgradeForUser(context.supabase, context.userId, data.type));
