// Fonte ÚNICA de verdade para "qual divisão o jogador está AGORA".
//
// Nunca ler isso de `competitions`: cada treinador tem uma competição "league"
// ativa por divisão (o mundo inteiro é semeado), então uma consulta única
// retorna vazio e cai silenciosamente em "bronze". A divisão real é a do time
// atual do jogador.

export type PlayerDivision = "bronze" | "prata" | "ouro" | "diamante" | "lendaria";

const VALID: PlayerDivision[] = ["bronze", "prata", "ouro", "diamante", "lendaria"];

function coerce(d: unknown): PlayerDivision | null {
  return VALID.includes(d as PlayerDivision) ? (d as PlayerDivision) : null;
}

/** Divisão atual do jogador, resolvida pelo time atual (com fallback pelo time do jogador na liga). */
export async function resolvePlayerDivision(
  supabase: any,
  trainerId: string,
  currentTeamId?: string | null,
): Promise<PlayerDivision> {
  let teamId = currentTeamId ?? null;

  if (!teamId) {
    const { data: trainer } = await supabase
      .from("trainers")
      .select("current_team_id")
      .eq("id", trainerId)
      .maybeSingle();
    teamId = trainer?.current_team_id ?? null;
  }

  if (teamId) {
    const { data: team } = await supabase
      .from("teams")
      .select("division")
      .eq("id", teamId)
      .maybeSingle();
    const d = coerce(team?.division);
    if (d) return d;
  }

  const { data: fallback } = await supabase
    .from("teams")
    .select("division")
    .eq("trainer_id", trainerId)
    .eq("is_player", true)
    .not("division", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return coerce(fallback?.division) ?? "bronze";
}
