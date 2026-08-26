import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function getTrainerId(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from("trainers")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Treinador não encontrado.");
  return data.id;
}

export const listMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const trainerId = await getTrainerId(supabase, userId);
    const { data } = await supabase
      .from("messages")
      .select("id, kind, title, body, read, created_at")
      .eq("trainer_id", trainerId)
      .neq("kind", "match")
      .order("created_at", { ascending: false })
      .limit(100);
    const list = data ?? [];
    return { messages: list, unread: list.filter((m: any) => !m.read).length };
  });

export const markMessageRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const trainerId = await getTrainerId(supabase, userId);
    await supabase
      .from("messages")
      .update({ read: true })
      .eq("id", data.id)
      .eq("trainer_id", trainerId);
    return { ok: true };
  });

export const markAllRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const trainerId = await getTrainerId(supabase, userId);
    await supabase
      .from("messages")
      .update({ read: true })
      .eq("trainer_id", trainerId)
      .neq("kind", "match")
      .eq("read", false);
    return { ok: true };
  });

export const deleteMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const trainerId = await getTrainerId(supabase, userId);
    await supabase
      .from("messages")
      .delete()
      .eq("id", data.id)
      .eq("trainer_id", trainerId);
    return { ok: true };
  });
