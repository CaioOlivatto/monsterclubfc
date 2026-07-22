import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  seedWorldAcademiesIfNeeded,
  upsertPlayerAcademy,
  evolveCpuAcademies,
  type SortKey,
} from "./ranking/logic";

export type { SortKey } from "./ranking/logic";

const SELECT_COLS =
  "id, trainer_id, academy_name, trainer_name, division, level, wins, patrimony, primary_color, secondary_color, is_player, last_position";

function sortRows(rows: any[], sort: SortKey): any[] {
  return [...rows].sort((a, b) => {
    if (b[sort] !== a[sort]) return (b[sort] ?? 0) - (a[sort] ?? 0);
    if (b.level !== a.level) return (b.level ?? 0) - (a.level ?? 0);
    if (b.patrimony !== a.patrimony) return (b.patrimony ?? 0) - (a.patrimony ?? 0);
    return String(a.id).localeCompare(String(b.id));
  });
}

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

    // Busca todas as academias e ordena em memória (evita depender de current_position persistida)
    const all: any[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data: rows } = await supabaseAdmin
        .from("world_academies")
        .select(SELECT_COLS)
        .range(from, from + PAGE - 1);
      if (!rows || rows.length === 0) break;
      all.push(...rows);
      if (rows.length < PAGE) break;
    }

    const sorted = sortRows(all, sort);
    const withPos = sorted.map((r, i) => ({ ...r, current_position: i + 1 }));
    const top = withPos.slice(0, 50);

    let player: any = null;
    let context5: any[] = [];
    if (trainer?.id) {
      const me = withPos.find((r) => r.trainer_id === trainer.id) ?? null;
      if (me) {
        player = me;
        const from = Math.max(1, me.current_position - 2);
        const to = me.current_position + 2;
        context5 = withPos.filter((r) => r.current_position >= from && r.current_position <= to);
      }
    }

    return { sort, total: all.length, top, player, context5 };
  });

export const recomputeWorldRanking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await seedWorldAcademiesIfNeeded(supabaseAdmin);
    const updated = await evolveCpuAcademies(supabaseAdmin);
    const { data: trainer } = await supabase
      .from("trainers")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (trainer?.id) await upsertPlayerAcademy(supabaseAdmin, trainer.id);
    return { updated };
  });
