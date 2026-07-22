import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  seedWorldAcademiesIfNeeded,
  upsertPlayerAcademy,
  recomputePositionsBy,
  evolveCpuAcademies,
  type SortKey,
} from "./ranking/logic";

export type { SortKey } from "./ranking/logic";

export const getWorldRanking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: { sort?: SortKey }) => ({ sort: (v?.sort ?? "level") as SortKey }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sort = data.sort;

    await seedWorldAcademiesIfNeeded(supabaseAdmin);
    const { data: trainer } = await supabase
      .from("trainers")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (trainer?.id) await upsertPlayerAcademy(supabaseAdmin, trainer.id);

    await recomputePositionsBy(supabaseAdmin, sort);


    const { count: total } = await supabase
      .from("world_academies")
      .select("id", { count: "exact", head: true });

    const { data: top } = await supabase
      .from("world_academies")
      .select("id, academy_name, trainer_name, division, level, wins, patrimony, primary_color, secondary_color, is_player, current_position, last_position")
      .order("current_position", { ascending: true })
      .limit(50);

    let player: any = null;
    let context5: any[] = [];
    if (trainer?.id) {
      const { data: me } = await supabase
        .from("world_academies")
        .select("id, academy_name, trainer_name, division, level, wins, patrimony, primary_color, secondary_color, is_player, current_position, last_position")
        .eq("trainer_id", trainer.id)
        .maybeSingle();
      if (me?.current_position) {
        player = me;
        const from = Math.max(1, me.current_position - 2);
        const to = me.current_position + 2;
        const { data: nearby } = await supabase
          .from("world_academies")
          .select("id, academy_name, trainer_name, division, level, wins, patrimony, primary_color, secondary_color, is_player, current_position, last_position")
          .gte("current_position", from)
          .lte("current_position", to)
          .order("current_position", { ascending: true });
        context5 = nearby ?? [];
      }
    }

    return { sort, total: total ?? 0, top: top ?? [], player, context5 };
  });

export const recomputeWorldRanking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await seedWorldAcademiesIfNeeded(supabase);
    const updated = await evolveCpuAcademies(supabase);
    const { data: trainer } = await supabase
      .from("trainers")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (trainer?.id) await upsertPlayerAcademy(supabase, trainer.id);
    await recomputePositionsBy(supabase, "level");
    return { updated };
  });
