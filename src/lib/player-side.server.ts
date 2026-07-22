import { buildSlots } from "./lineup.server";
import type { EngineSide, EngineSlot, SlotRole, Element, Tactics, Division } from "./match-engine.server";
import { NEUTRAL_TACTICS } from "./match-engine.server";

async function fetchMedicalLevel(supabase: any, trainerId: string): Promise<number> {
  const { data } = await supabase
    .from("buildings")
    .select("level")
    .eq("trainer_id", trainerId)
    .eq("building_type", "centro_medico")
    .maybeSingle();
  return Math.max(1, Math.min(5, data?.level ?? 1));
}

async function fetchTeamDivision(supabase: any, teamId: string): Promise<Division | undefined> {
  const { data } = await supabase.from("teams").select("division").eq("id", teamId).maybeSingle();
  const d = data?.division as string | undefined;
  if (d === "bronze" || d === "prata" || d === "ouro" || d === "diamante" || d === "lendaria") return d;
  return undefined;
}




// Constrói o lado do jogador a partir da escalação salva.
export async function buildPlayerSideFromDb(
  supabase: any,
  trainerId: string,
  teamId: string,
  teamName: string,
): Promise<EngineSide> {
  const { data: lineup } = await supabase
    .from("team_lineups")
    .select("formation, strategy, starters, bench, default_tactics")
    .eq("trainer_id", trainerId)
    .maybeSingle();
  if (!lineup) throw new Error("Você ainda não tem escalação salva. Vá em Escalação primeiro.");
  const medicalLevel = await fetchMedicalLevel(supabase, trainerId);


  const savedStarters = (lineup.starters ?? []) as {
    slot: number; role: SlotRole; creature_id: string | null;
  }[];
  const benchIds = (lineup.bench ?? []) as string[];
  const starterIds = savedStarters.map((s) => s.creature_id).filter(Boolean) as string[];
  if (starterIds.length !== 11) throw new Error("Preencha os 11 titulares antes de jogar.");

  const allIds = [...starterIds, ...benchIds];
  const { data: creatures, error } = await supabase
    .from("creatures")
    .select(
      "id, name, element, suggested_position, overall, is_goalkeeper, attr_pique, attr_forca, energy, morale, aff_fogo, aff_agua, aff_terra, aff_ar, aff_gelo, injury_matches_remaining",
    )
    .in("id", allIds);
  if (error) throw error;
  const byId = new Map<string, any>((creatures ?? []).map((c: any) => [c.id, c]));

  const toEngine = (c: any, role: SlotRole): EngineSlot => {
    const natural = posToRole(c.suggested_position);
    const oop = natural !== role;
    const effOverall = oop ? Math.round((c.overall ?? 0) * 0.85) : c.overall;
    return {
      role,
      creature: {
        id: c.id,
        name: c.name,
        element: c.element as Element,
        overall: effOverall,
        physical: Math.round(((c.attr_pique ?? 40) + (c.attr_forca ?? 40)) / 2),
        energy: c.energy ?? 100,
        morale: c.morale ?? 50,
        affinity_fogo: c.aff_fogo ?? 0,
        affinity_agua: c.aff_agua ?? 0,
        affinity_terra: c.aff_terra ?? 0,
        affinity_ar: c.aff_ar ?? 0,
        affinity_gelo: c.aff_gelo ?? 0,
      },
    };
  };

  const posToRole = (pos: string | null | undefined): SlotRole => {
    if (pos === "Goleiro") return "GOL";
    if (pos === "Zagueiro") return "DEF";
    if (pos === "Atacante") return "ATA";
    return "MEI";
  };


  const slots = buildSlots(lineup.formation);
  const starters: EngineSlot[] = slots.map((s) => {
    const saved = savedStarters.find((x) => x.slot === s.index);
    const c = saved?.creature_id ? byId.get(saved.creature_id) : null;
    if (!c) throw new Error("Escalação inválida — recomponha os titulares.");
    if ((c.injury_matches_remaining ?? 0) > 0) {
      throw new Error(`${c.name} está lesionada e não pode jogar. Ajuste a escalação.`);
    }
    return toEngine(c, s.role);
  });


  const bench: EngineSlot[] = benchIds
    .map((id) => byId.get(id))
    .filter((c: any) => c && (c.injury_matches_remaining ?? 0) === 0)
    .map((c: any) => toEngine(c, posToRole(c.suggested_position)));

  const tactics: Tactics = (lineup.default_tactics as Tactics | null) ?? NEUTRAL_TACTICS;
  const division = await fetchTeamDivision(supabase, teamId);
  return { team_id: teamId, team_name: teamName, starters, bench, strategy: lineup.strategy, tactics, medical_level: medicalLevel, division };
}


/** Constrói o lado do jogador a partir de um DRAFT enviado pela UI (sem salvar). */
export async function buildPlayerSideFromDraft(
  supabase: any,
  trainerId: string,
  teamId: string,
  teamName: string,
  draft: {
    formation: string;
    strategy: "ofensiva" | "equilibrada" | "defensiva";
    starters: { slot: number; role: SlotRole; creature_id: string | null }[];
    bench: string[];
    tactics?: Tactics | null;
  },
): Promise<EngineSide> {
  const starterIds = draft.starters.map((s) => s.creature_id).filter(Boolean) as string[];
  if (starterIds.length !== 11) throw new Error("Preencha os 11 titulares antes de calcular o prognóstico.");

  const allIds = [...starterIds, ...draft.bench];
  const { data: creatures, error } = await supabase
    .from("creatures")
    .select(
      "id, name, element, suggested_position, overall, is_goalkeeper, attr_pique, attr_forca, energy, morale, aff_fogo, aff_agua, aff_terra, aff_ar, aff_gelo, injury_matches_remaining, owner_trainer_id",
    )
    .in("id", allIds);
  if (error) throw error;
  const byId = new Map<string, any>(
    (creatures ?? []).filter((c: any) => c.owner_trainer_id === trainerId).map((c: any) => [c.id, c]),
  );

  const posToRole = (pos: string | null | undefined): SlotRole => {
    if (pos === "Goleiro") return "GOL";
    if (pos === "Zagueiro") return "DEF";
    if (pos === "Atacante") return "ATA";
    return "MEI";
  };

  const toEngine = (c: any, role: SlotRole): EngineSlot => {
    const oop = posToRole(c.suggested_position) !== role;
    const effOverall = oop ? Math.round((c.overall ?? 0) * 0.85) : c.overall;
    return {
      role,
      creature: {
        id: c.id, name: c.name, element: c.element as Element,
        overall: effOverall,
        physical: Math.round(((c.attr_pique ?? 40) + (c.attr_forca ?? 40)) / 2),
        energy: c.energy ?? 100,
        morale: c.morale ?? 50,
        affinity_fogo: c.aff_fogo ?? 0, affinity_agua: c.aff_agua ?? 0,
        affinity_terra: c.aff_terra ?? 0, affinity_ar: c.aff_ar ?? 0,
        affinity_gelo: c.aff_gelo ?? 0,
      },
    };
  };

  const slots = buildSlots(draft.formation as any);
  const starters: EngineSlot[] = slots.map((s) => {
    const saved = draft.starters.find((x) => x.slot === s.index);
    const c = saved?.creature_id ? byId.get(saved.creature_id) : null;
    if (!c) throw new Error("Escalação inválida — recomponha os titulares.");
    if ((c.injury_matches_remaining ?? 0) > 0) {
      throw new Error(`${c.name} está lesionada e não pode jogar.`);
    }
    return toEngine(c, s.role);
  });


  const bench: EngineSlot[] = draft.bench
    .map((id) => byId.get(id))
    .filter((c: any) => c && (c.injury_matches_remaining ?? 0) === 0)
    .map((c: any) => toEngine(c, posToRole(c.suggested_position)));

  const medicalLevel = await fetchMedicalLevel(supabase, trainerId);
  const division = await fetchTeamDivision(supabase, teamId);
  return {
    team_id: teamId, team_name: teamName, starters, bench,
    strategy: draft.strategy,
    tactics: (draft.tactics as Tactics | null) ?? NEUTRAL_TACTICS,
    medical_level: medicalLevel,
    division,
  };
}



