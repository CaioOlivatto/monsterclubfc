import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EventSchema = z.object({
  event: z.enum([
    "page_view",
    "slow_page",
    "onboarding_started",
    "onboarding_completed",
    "club_viewed",
    "club_activated",
    "arena_played",
    "purchase_intent",
    "session_started",
  ]),
  route: z.string().max(160).optional(),
  duration_ms: z.number().int().min(0).max(120000).optional(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

export const recordGameTelemetry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => EventSchema.parse(raw))
  .handler(async ({ context, data }) => {
    // A função entra por migração antes da próxima regeneração dos tipos do Supabase.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (context.supabase as any).rpc("record_game_telemetry", {
      p_event: data.event,
      p_route: data.route ?? null,
      p_duration_ms: data.duration_ms ?? null,
      p_metadata: data.metadata ?? {},
    });
    if (error) throw error;
    return { ok: true };
  });
