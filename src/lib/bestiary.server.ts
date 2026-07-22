// Loader do bestiário a partir do banco (tabelas public.species / public.epithets).
// Server-only. Recebe um cliente supabase — não importa client.server para poder
// ser usado tanto do meio de handlers autenticados quanto de outros helpers server.

import type { Element, EpithetMap, SpeciesBase } from "./bestiary";

export interface LoadedBestiary {
  species: SpeciesBase[];
  epithets: EpithetMap;
}

let cache: LoadedBestiary | null = null;

function rowToSpecies(r: any): SpeciesBase {
  const base: SpeciesBase = {
    species: r.species,
    element: r.element as Element,
    position: r.position_label as SpeciesBase["position"],
    origin: r.origin,
    power_key: r.power_key,
    power_name: r.power_name,
    power_desc: r.power_desc,
  };
  if (r.is_goalkeeper) {
    base.gk = {
      maos: r.base_maos,
      concentracao: r.base_concentracao,
      elasticidade: r.base_elasticidade,
    };
  } else {
    base.line = {
      defender: r.base_defender,
      passar: r.base_passar,
      atacar: r.base_atacar,
      tecnica: r.base_tecnica,
      forca: r.base_forca,
      pique: r.base_pique,
    };
  }
  return base;
}

export async function loadBestiary(supabase: any): Promise<LoadedBestiary> {
  if (cache) return cache;
  const [spRes, epRes] = await Promise.all([
    supabase.from("species").select("*"),
    // Somente epítetos preposicionais (invariáveis em gênero) — evita
    // "Fênix o Ardente" (correto seria "a Ardente"). Adjetivais virão depois
    // com marcação de gênero por espécie.
    supabase.from("epithets").select("element, epithet").eq("is_prepositional", true),
  ]);
  if (spRes.error) throw spRes.error;
  if (epRes.error) throw epRes.error;

  const species: SpeciesBase[] = (spRes.data ?? []).map(rowToSpecies);
  const epithets: EpithetMap = { fogo: [], agua: [], terra: [], ar: [], gelo: [] };
  for (const row of epRes.data ?? []) {
    const el = row.element as Element;
    if (epithets[el]) epithets[el].push(row.epithet);
  }
  cache = { species, epithets };
  return cache;
}

/** Força um refresh da próxima chamada (útil para admin / testes). */
export function invalidateBestiaryCache() {
  cache = null;
}

export function epithetsFor(bestiary: LoadedBestiary, el: Element): string[] {
  return bestiary.epithets[el] ?? [];
}
