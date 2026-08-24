import { buildSlots } from "./lineup.server";
import {
  DIVISION_LINEUP_EFFICIENCY,
  DIVISION_TACTICAL_INTELLIGENCE,
  divisionTargetMidpoint,
} from "./game-balance";
import {
  generateCpuSideFor,
  NEUTRAL_TACTICS,
  type Division,
  type Element,
  type EngineBestiary,
  type EngineSide,
  type EngineSlot,
  type SlotRole,
  type Tactics,
} from "./match-engine.server";

type CpuTeam = {
  id: string;
  name: string;
  cpu_strength?: number | null;
  division?: Division | null;
  starter_key?: string | null;
};

function hashSeed(value: string): number {
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash || 1;
}

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function positionToRole(position: string | null | undefined): SlotRole {
  if (position === "Goleiro") return "GOL";
  if (position === "Zagueiro") return "DEF";
  if (position === "Atacante") return "ATA";
  return "MEI";
}

function creatureScore(creature: any): number {
  const energy = Math.max(0, Math.min(100, creature.energy ?? 100));
  const morale = Math.max(0, Math.min(100, creature.morale ?? 50));
  return (creature.overall ?? 0) * (0.72 + energy * 0.002 + morale * 0.0016);
}

function toEngineSlot(creature: any, role: SlotRole): EngineSlot {
  const outOfPosition = positionToRole(creature.suggested_position) !== role;
  return {
    role,
    creature: {
      id: creature.id,
      name: creature.name,
      element: creature.element as Element,
      overall: Math.round((creature.overall ?? 0) * (outOfPosition ? 0.85 : 1)),
      physical: Math.round(((creature.attr_pique ?? 40) + (creature.attr_forca ?? 40)) / 2),
      energy: creature.energy ?? 100,
      morale: creature.morale ?? 50,
      age: creature.age ?? 24,
      affinity_fogo: creature.aff_fogo ?? 0,
      affinity_agua: creature.aff_agua ?? 0,
      affinity_terra: creature.aff_terra ?? 0,
      affinity_ar: creature.aff_ar ?? 0,
      affinity_gelo: creature.aff_gelo ?? 0,
    },
  };
}

function cpuPersonality(team: CpuTeam, division: Division): { strategy: EngineSide["strategy"]; tactics: Tactics } {
  const intelligence = DIVISION_TACTICAL_INTELLIGENCE[division];
  const variant = hashSeed(`${team.id}:${team.starter_key ?? team.name}`) % 3;
  const profiles: Array<{ strategy: EngineSide["strategy"]; tactics: Tactics }> = [
    { strategy: "ofensiva", tactics: { mentalidade: 2, verticalidade: 2, pressao: 1, cortes: 0 } },
    { strategy: "defensiva", tactics: { mentalidade: -1, verticalidade: -1, pressao: 0, cortes: 2 } },
    { strategy: "equilibrada", tactics: { mentalidade: 0, verticalidade: 0, pressao: 1, cortes: 1 } },
  ];
  const profile = profiles[variant];
  if (division === "bronze") return { strategy: "equilibrada", tactics: NEUTRAL_TACTICS };
  return {
    strategy: profile.strategy,
    tactics: {
      mentalidade: Math.round(profile.tactics.mentalidade * intelligence),
      verticalidade: Math.round(profile.tactics.verticalidade * intelligence),
      pressao: Math.round(profile.tactics.pressao * intelligence),
      cortes: Math.round(profile.tactics.cortes * intelligence),
    },
  };
}

/**
 * Monta o adversário oficial a partir do elenco persistido. `cpu_strength` é
 * usado somente quando o clube legado ainda não possui criaturas suficientes.
 */
export async function buildPersistentCpuSide(
  supabase: any,
  team: CpuTeam,
  fallbackDivision: Division,
  bestiary?: EngineBestiary,
): Promise<EngineSide> {
  const division = team.division ?? fallbackDivision;
  const { data: creatures, error } = await supabase
    .from("creatures")
    .select("id, name, element, suggested_position, overall, attr_pique, attr_forca, energy, morale, age, aff_fogo, aff_agua, aff_terra, aff_ar, aff_gelo, injury_matches_remaining, retired")
    .eq("owner_team_id", team.id);
  if (error) throw error;

  const available = (creatures ?? []).filter(
    (creature: any) => !creature.retired && (creature.injury_matches_remaining ?? 0) <= 0,
  );
  if (available.length < 11) {
    return generateCpuSideFor(
      hashSeed(team.id), team.id, team.name,
      team.cpu_strength ?? divisionTargetMidpoint(division), bestiary,
    );
  }

  const random = mulberry32(hashSeed(`${team.id}:${available.map((c: any) => `${c.id}:${c.energy}:${c.morale}`).join("|")}`));
  const [minimumEfficiency, maximumEfficiency] = DIVISION_LINEUP_EFFICIENCY[division];
  const efficiency = minimumEfficiency + random() * (maximumEfficiency - minimumEfficiency);
  const slots = buildSlots("4-4-2");
  const remaining = [...available];
  const starters: EngineSlot[] = [];

  for (const slot of slots) {
    const natural = remaining.filter((creature: any) => positionToRole(creature.suggested_position) === slot.role);
    const candidates = (natural.length ? natural : remaining).sort((a: any, b: any) => creatureScore(b) - creatureScore(a));
    const maxIndex = Math.max(0, Math.min(candidates.length - 1, Math.floor((1 - efficiency) * candidates.length * 1.8)));
    const chosen = candidates[Math.floor(random() * (maxIndex + 1))] ?? candidates[0];
    if (!chosen) break;
    starters.push(toEngineSlot(chosen, slot.role));
    remaining.splice(remaining.findIndex((creature: any) => creature.id === chosen.id), 1);
  }

  if (starters.length !== 11) {
    return generateCpuSideFor(
      hashSeed(team.id), team.id, team.name,
      team.cpu_strength ?? divisionTargetMidpoint(division), bestiary,
    );
  }

  const bench = remaining
    .sort((a: any, b: any) => creatureScore(b) - creatureScore(a))
    .slice(0, 7)
    .map((creature: any) => toEngineSlot(creature, positionToRole(creature.suggested_position)));
  const personality = cpuPersonality(team, division);
  const medicalLevel: Record<Division, number> = { bronze: 1, prata: 1, ouro: 2, diamante: 3, lendaria: 4 };

  return {
    team_id: team.id,
    team_name: team.name,
    starters,
    bench,
    strategy: personality.strategy,
    tactics: personality.tactics,
    medical_level: medicalLevel[division],
    division,
  };
}
