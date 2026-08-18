/** Ajusta o caixa em uma única operação no banco, impedindo saldo negativo e
 * disputas entre cliques simultâneos. O RLS continua limitando ao dono. */
export async function adjustAcademyMoney(
  supabase: any,
  trainerId: string,
  delta: number,
): Promise<number> {
  const { data, error } = await supabase.rpc("adjust_academy_money", {
    p_trainer_id: trainerId,
    p_delta: Math.round(delta),
  });
  if (error) throw error;
  return Number(data ?? 0);
}
