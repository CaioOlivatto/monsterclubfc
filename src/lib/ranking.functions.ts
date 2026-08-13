import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SortKey } from "./ranking/logic";

export type { SortKey } from "./ranking/logic";

async function invokeWorldRanking(
  supabase: any,
  body: { action: "get"; sort: SortKey } | { action: "recompute" },
) {
  const { data, error } = await supabase.functions.invoke("world-ranking", { body });
  if (error) throw new Error(error.message ?? "World ranking function failed");
  if (data?.error) throw new Error(data.error);
  return data;
}

export const getWorldRanking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: { sort?: SortKey }) => ({
    sort: (value?.sort ?? "level") as SortKey,
  }))
  .handler(async ({ data, context }) =>
    invokeWorldRanking(context.supabase, { action: "get", sort: data.sort }),
  );

export const recomputeWorldRanking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    invokeWorldRanking(context.supabase, { action: "recompute" }),
  );
