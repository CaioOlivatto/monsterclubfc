import { createClient } from "@supabase/supabase-js";

export const PUBLIC_SUPABASE_URL = "https://gwqvninbrmrsabuseqbx.supabase.co";
export const PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ycTtamLVwKvO3G89F5dAfw_W6ozxpo9";

function normalizeAccessToken(accessToken: string) {
  const token = accessToken.trim().replace(/^Bearer\s+/i, "");
  if (token.split(".").length !== 3) throw new Error("Sua sessão expirou. Entre novamente.");
  return token;
}

/**
 * O host publicado pode não encaminhar cookies/cabeçalhos de funções internas.
 * Para ações essenciais do jogo, validamos o JWT que o próprio cliente do
 * Supabase possui e criamos um cliente RLS equivalente à sessão do jogador.
 */
export async function getDirectSession(accessToken: string) {
  const token = normalizeAccessToken(accessToken);
  // The game was migrated away from Lovable Cloud and has one canonical
  // backend. Lovable can still inject SUPABASE_* values from its former
  // managed project into the server runtime. Validating a gwqvn... JWT against
  // that old project always looks like an expired session.
  // These are browser-safe project coordinates; RLS remains authoritative.
  const supabaseUrl = PUBLIC_SUPABASE_URL;
  const publishableKey = PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Valide o JWT diretamente no Auth. Isto evita que clientes criados com as
  // novas chaves opacas `sb_publishable_*` confundam a chave pública do projeto
  // com o bearer token da sessão recém-criada.
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!userResponse.ok) {
    console.error(`[direct-session] Auth recusou a sessão (${userResponse.status}).`);
    throw new Error("Sua sessão expirou. Entre novamente.");
  }
  const authenticatedUser = (await userResponse.json()) as { id?: unknown };
  if (typeof authenticatedUser.id !== "string" || !authenticatedUser.id) {
    throw new Error("Sua sessão expirou. Entre novamente.");
  }

  const supabase = createClient(
    supabaseUrl,
    publishableKey,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  return { supabase, userId: authenticatedUser.id };
}
