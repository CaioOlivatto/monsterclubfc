import { createServerFn } from "@tanstack/react-start";
import { getRequest, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { getDirectSession } from "@/lib/direct-session.server";

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
    await getDirectSession(data.accessToken);

    const request = getRequest();
    const isHttps = new URL(request.url).protocol === "https:";
    setCookie(GAME_SESSION_COOKIE, data.accessToken, {
      httpOnly: true,
      secure: isHttps,
      sameSite: "lax",
      path: "/",
      maxAge: 50 * 60,
    });

    return { ok: true };
  });
