/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getDirectSession } from "./direct-session.server";
import { BUILDINGS, BUILDING_TYPES, type BuildingType } from "./buildings.server";
import { maintenancePerMatch } from "./economy";
import { resolvePlayerDivision } from "./division.server";
import { recordTelemetryBestEffort } from "./telemetry.server";

const buildingTypeSchema = z.enum(["ct_treino", "estadio", "centro_medico"]);
const sessionSchema = z.object({ access_token: z.string().min(20) });
const buildingSessionSchema = sessionSchema.extend({ type: buildingTypeSchema });

// Idempotente: contas criadas ou recuperadas parcialmente sempre recebem as três estruturas.
async function ensureBuildingFoundation(supabase: any, trainer: { id: string; current_team_id: string | null }) {
  const trainerId = trainer.id;
  const { data: academy, error: academyError } = await supabase.from("academies").select("id").eq("trainer_id", trainerId).maybeSingle();
  if (academyError) throw academyError;
  if (!academy) {
    const { error } = await supabase.from("academies").insert({ trainer_id: trainerId, money: 400000, gems: 10, builders: 1, roster_slots: 26 });
    if (error) throw error;
  }
  if (!trainer.current_team_id) throw new Error("Escolha seu clube antes de acessar as construções.");
  const { data: current, error: buildingsError } = await supabase.from("buildings").select("building_type").eq("team_id", trainer.current_team_id);
  if (buildingsError) throw buildingsError;
  const present = new Set((current ?? []).map((building: any) => building.building_type));
  const missing = BUILDING_TYPES.filter((type) => !present.has(type)).map((building_type) => ({ trainer_id: trainerId, team_id: trainer.current_team_id, building_type, level: 1 }));
  if (missing.length) {
    const { error } = await supabase.from("buildings").insert(missing as any);
    if (error) throw error;
  }
}

async function trainerForUser(supabase: any, userId: string) {
  const { data: trainer, error } = await supabase.from("trainers").select("id, trainer_name, academy_name, level, xp, current_team_id").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!trainer) throw new Error("Treinador não encontrado. Entre novamente para continuar.");
  return trainer;
}

async function completeFinishedUpgrades(supabase: any, teamId: string) {
  const { data: rows, error } = await supabase.from("buildings").select("id, building_type, level, upgrade_completes_at").eq("team_id", teamId).not("upgrade_completes_at", "is", null);
  if (error) throw error;
  const now = Date.now();
  await Promise.all((rows ?? []).filter((row: any) => new Date(row.upgrade_completes_at).getTime() <= now).map((row: any) =>
    supabase.from("buildings").update({ level: Math.min(BUILDINGS[row.building_type as BuildingType].maxLevel, (row.level ?? 0) + 1), upgrade_completes_at: null } as any).eq("id", row.id),
  ));
}

async function loadBuildingsForUser(supabase: any, userId: string) {
  const trainer = await trainerForUser(supabase, userId);
  await ensureBuildingFoundation(supabase, trainer);
  await completeFinishedUpgrades(supabase, trainer.current_team_id);
  const [{ data: academy, error: academyError }, { data: rows, error: rowsError }, division] = await Promise.all([
    supabase.from("academies").select("money, gems, builders").eq("trainer_id", trainer.id).maybeSingle(),
    supabase.from("buildings").select("id, building_type, level, upgrade_completes_at").eq("team_id", trainer.current_team_id),
    resolvePlayerDivision(supabase, trainer.id, trainer.current_team_id),
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
      maintenancePerMatch: maintenancePerMatch(division, type, level),
      nextMaintenancePerMatch: level < spec.maxLevel ? maintenancePerMatch(division, type, nextLevel) : undefined,
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
  await ensureBuildingFoundation(supabase, trainer);
  await completeFinishedUpgrades(supabase, trainer.current_team_id);
  const [{ data: academy, error: academyError }, { data: building, error: buildingError }, { data: busy, error: busyError }] = await Promise.all([
    supabase.from("academies").select("money").eq("trainer_id", trainer.id).maybeSingle(),
    supabase.from("buildings").select("id, level").eq("team_id", trainer.current_team_id).eq("building_type", type).maybeSingle(),
    supabase.from("buildings").select("id").eq("team_id", trainer.current_team_id).not("upgrade_completes_at", "is", null),
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
  const durationSeconds = spec.duration(nextLevel);
  const { data: operation, error: operationError } = await supabase.rpc("start_building_upgrade_atomic_v2" as any, {
    p_type: type,
    p_cost: cost,
    p_duration_seconds: durationSeconds,
    p_idempotency_key: `building-start:${type}:${crypto.randomUUID()}`,
  });
  if (operationError) throw operationError;
  await recordTelemetryBestEffort(supabase, "stadium_upgraded", "/buildings", {
    building_type: type,
    target_level: nextLevel,
    cost,
  });
  return { ok: true, completesAt: (operation as any)?.completes_at };
}

async function finishUpgradeForUser(supabase: any, userId: string, type: BuildingType) {
  void userId;
  const { data, error } = await supabase.rpc("finish_building_with_gems_atomic", {
    p_type: type,
    p_idempotency_key: `building-rush:${type}:${crypto.randomUUID()}`,
  });
  if (error) throw error;
  return data;
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
