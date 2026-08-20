import { createClient } from "@supabase/supabase-js";

/**
 * O host publicado pode não encaminhar cookies/cabeçalhos de funções internas.
 * Para ações essenciais do jogo, validamos o JWT que o próprio cliente do
 * Supabase possui e criamos um cliente RLS equivalente à sessão do jogador.
 */
export async function getDirectSession(accessToken: string) {
  const supabase = createClient(
    "https://gwqvninbrmrsabuseqbx.supabase.co",
    "sb_publishable_ycTtamLVwKvO3G89F5dAfw_W6ozxpo9",
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user?.id) throw new Error("Sua sessão expirou. Entre novamente.");
  return { supabase, userId: data.user.id };
}
