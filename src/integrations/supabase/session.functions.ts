import { createServerFn } from "@tanstack/react-start";
import { setCookie } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const PUBLIC_SUPABASE_URL = "https://gwqvninbrmrsabuseqbx.supabase.co";
const PUBLIC_SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_ycTtamLVwKvO3G89F5dAfw_W6ozxpo9";

export const GAME_SESSION_COOKIE = "monster_club_session";

const sessionSchema = z.object({
  accessToken: z.string().min(20),
});

/**
 * Cria a sessão segura do servidor a partir de uma sessão já autenticada no
 * Supabase. O token chega no corpo da Server Function (canal que funciona no
 * proxy do Lovable), é validado no Auth e só então vai para um cookie HttpOnly.
 */
export const syncServerSession = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => sessionSchema.parse(input))
  .handler(async ({ data }) => {
    const supabase = createClient(
      PUBLIC_SUPABASE_URL,
      PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const { data: authData, error } = await supabase.auth.getUser(
      data.accessToken,
    );
    if (error || !authData.user?.id) {
      throw new Error("Sua sessão expirou. Entre novamente para continuar.");
    }

    setCookie(GAME_SESSION_COOKIE, data.accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 50 * 60,
    });

    return { ok: true };
  });
