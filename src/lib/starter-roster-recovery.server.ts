/* eslint-disable @typescript-eslint/no-explicit-any */
import { generateStarterRoster, getStarterTeam, rosterToDbRows, type StarterKey } from "./starter-teams";

export type PlayerCareerTeam = {
  id: string;
  name: string;
  competition_id: string | null;
  division: string | null;
  starter_key?: string | null;
};

// Localiza somente o clube ativo desta carreira. Isso torna a recuperação
// segura para contas que tiveram uma tentativa de onboarding interrompida.
export async function resolvePlayerCareerTeam(supabase: any, trainer: any): Promise<PlayerCareerTeam | null> {
  if (trainer.current_team_id) {
    const { data } = await supabase
      .from("teams")
      .select("id, name, competition_id, division, starter_key")
      .eq("id", trainer.current_team_id)
      .eq("trainer_id", trainer.id)
      .eq("is_player", true)
      .maybeSingle();
    if (data) return data as PlayerCareerTeam;
  }

  const { data } = await supabase
    .from("teams")
    .select("id, name, competition_id, division, starter_key")
    .eq("trainer_id", trainer.id)
    .eq("is_player", true)
    .not("competition_id", "is", null)
    .limit(1)
    .maybeSingle();
  return (data as PlayerCareerTeam | null) ?? null;
}

// Garante que uma carreira já criada sempre possua o elenco inicial completo.
// Não altera jogadores existentes, jogos, saldo, liga ou construções.
export async function ensureStarterRoster(supabase: any, trainerId: string, team: PlayerCareerTeam | null) {
  if (!team?.starter_key || !getStarterTeam(team.starter_key)) return false;

  const { count, error: countError } = await supabase
    .from("creatures")
    .select("id", { count: "exact", head: true })
    .eq("owner_trainer_id", trainerId);
  if (countError) throw countError;
  const currentCount = count ?? 0;
  if (currentCount >= 26) return false;

  const { loadBestiary } = await import("./bestiary.server");
  const bestiary = await loadBestiary(supabase);
  const roster = generateStarterRoster(team.starter_key as StarterKey, bestiary);
  // Se uma falha rara gravou apenas parte do elenco, completamos somente o que
  // falta. Assim nunca removemos progresso nem duplicamos um elenco completo.
  const rows = rosterToDbRows(trainerId, roster).slice(currentCount).map((row) => ({
    ...row,
    owner_team_id: team.id,
  }));
  const { error } = await supabase.from("creatures").insert(rows as any);
  if (error) throw error;
  return true;
}
