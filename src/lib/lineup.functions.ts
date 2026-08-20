import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { buildSlots, FORMATIONS, MAX_BENCH, type SlotRole } from "./lineup.server";
import { NEUTRAL_TACTICS, type Tactics } from "./match-engine.server";
import { ensureStarterRoster, resolvePlayerCareerTeam } from "./starter-roster-recovery.server";
import { getDirectSession } from "./direct-session.server";

// Controles HTML/Radix podem serializar valores movidos como texto. Coagir aqui
// mantem a fronteira do servidor estrita depois da conversao e evita rejeitar
// uma tatica valida por diferenca de transporte.
const TacticAxis = z.coerce.number().int().min(-2).max(2);
const TacticsSchema = z.object({
  mentalidade: TacticAxis,
  verticalidade: TacticAxis,
  pressao: TacticAxis,
  cortes: TacticAxis,
});


const StrategyEnum = z.enum(["ofensiva", "equilibrada", "defensiva"]);
const FormationEnum = z.enum(FORMATIONS);

const SlotSchema = z.object({
  slot: z.number().int().min(0).max(10),
  role: z.enum(["GOL", "DEF", "MEI", "ATA"]),
  creature_id: z.string().uuid().nullable(),
});

const SaveInput = z.object({
  formation: FormationEnum,
  strategy: StrategyEnum,
  starters: z.array(SlotSchema).length(11),
  bench: z.array(z.string().uuid()).max(MAX_BENCH),
});

function roleForPosition(position: string | null | undefined): SlotRole {
  if (position === "Goleiro") return "GOL";
  if (position === "Zagueiro") return "DEF";
  if (position === "Atacante") return "ATA";
  return "MEI";
}

function buildAutomaticLineup(creatures: any[], formation: typeof FORMATIONS[number]) {
  const remaining = [...creatures]
    .filter((creature) => (creature.injury_matches_remaining ?? 0) === 0)
    .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
  const take = (role: SlotRole) => {
    const matchingIndex = remaining.findIndex((creature) => roleForPosition(creature.suggested_position) === role);
    const index = matchingIndex >= 0 ? matchingIndex : 0;
    return remaining.splice(index, 1)[0] ?? null;
  };
  const starters = buildSlots(formation).map((slot) => ({
    slot: slot.index,
    role: slot.role,
    creature_id: take(slot.role)?.id ?? null,
  }));
  return { starters, bench: remaining.slice(0, MAX_BENCH).map((creature) => creature.id) };
}

async function getTrainer(supabase: any, userId: string): Promise<{ id: string; current_team_id: string | null }> {
  const { data: trainer } = await supabase
    .from("trainers")
    .select("id, current_team_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!trainer) throw new Error("Treinador não encontrado.");
  return trainer;
}

async function getTrainerId(supabase: any, userId: string): Promise<string> {
  return (await getTrainer(supabase, userId)).id;
}

async function loadMyLineup(supabase: any, userId: string) {
    const trainer = await getTrainer(supabase, userId);
    const trainerId = trainer.id;
    // A escalação pode ser a primeira tela aberta após o onboarding. Garante
    // aqui o mesmo reparo seguro do painel para nunca renderizar 11 slots vazios.
    const playerTeam = await resolvePlayerCareerTeam(supabase, trainer);
    await ensureStarterRoster(supabase, trainerId, playerTeam);

    const [{ data: lineup }, { data: creatures }, { data: membership }, { data: clubPreset }] = await Promise.all([
      supabase
        .from("team_lineups")
        .select("formation, strategy, starters, bench, default_tactics")
        .eq("trainer_id", trainerId)
        .maybeSingle(),
      supabase
        .from("creatures")
        .select("id, name, element, suggested_position, overall, energy, morale, injury_matches_remaining, injury_severity")
        .eq("owner_trainer_id", trainerId)
        .order("overall", { ascending: false }),
      (supabase as any).from("club_memberships").select("active_until").eq("trainer_id", trainerId).maybeSingle(),
      (supabase as any).from("club_lineup_presets").select("formation,strategy,starters,bench").eq("trainer_id", trainerId).maybeSingle(),
    ]);

    const savedStarters = Array.isArray(lineup?.starters) ? lineup.starters : [];
    const hasCompleteLineup = savedStarters.filter((slot: any) => slot?.creature_id).length === 11;
    const formation = (lineup?.formation as typeof FORMATIONS[number] | undefined) ?? "4-4-2";
    const automatic = !hasCompleteLineup && (creatures?.length ?? 0) >= 11
      ? buildAutomaticLineup(creatures ?? [], formation)
      : null;

    // Todo clube novo entra em campo pronto. Persistimos uma única vez para que
    // a escalação continue igual ao reabrir a página ou iniciar a partida.
    if (automatic) {
      const { error } = await supabase.from("team_lineups").upsert({
        trainer_id: trainerId,
        formation,
        strategy: lineup?.strategy ?? "equilibrada",
        starters: automatic.starters,
        bench: automatic.bench,
        default_tactics: lineup?.default_tactics ?? NEUTRAL_TACTICS,
      }, { onConflict: "trainer_id" });
      if (error) throw error;
    }

  return {
      lineup: automatic ? {
        formation,
        strategy: lineup?.strategy ?? "equilibrada",
        starters: automatic.starters,
        bench: automatic.bench,
        default_tactics: lineup?.default_tactics ?? NEUTRAL_TACTICS,
      } : lineup ?? {
        formation: "4-4-2",
        strategy: "equilibrada",
        starters: [],
        bench: [],
        default_tactics: NEUTRAL_TACTICS,
      },
      creatures: creatures ?? [],
      club_active: !!membership && new Date(membership.active_until).getTime() > Date.now(),
      club_preset: clubPreset ?? null,
  };
}

export const getMyLineup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => loadMyLineup(context.supabase, context.userId));

const lineupSessionSchema = z.object({ access_token: z.string().min(20) });

// O host do Lovable pode alterar o cabeçalho/cookie de funções protegidas.
// A escalação usa o JWT enviado pelo próprio cliente, como o Painel e o Elenco,
// para garantir que todos leiam exatamente a mesma carreira.
export const getMyLineupWithSession = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => lineupSessionSchema.parse(raw))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      "https://gwqvninbrmrsabuseqbx.supabase.co",
      "sb_publishable_ycTtamLVwKvO3G89F5dAfw_W6ozxpo9",
      { global: { headers: { Authorization: `Bearer ${data.access_token}` } }, auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: auth, error } = await supabase.auth.getUser(data.access_token);
    if (error || !auth.user?.id) throw new Error("Sua sessão expirou. Entre novamente.");
    return loadMyLineup(supabase, auth.user.id);
  });

export const saveClubLineupPreset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SaveInput.parse(raw))
  .handler(async ({ data, context }) => {
    const trainerId = await getTrainerId(context.supabase, context.userId);
    const { data: membership } = await (context.supabase as any).from("club_memberships").select("active_until").eq("trainer_id", trainerId).maybeSingle();
    if (!membership || new Date(membership.active_until).getTime() <= Date.now()) throw new Error("O segundo plano é exclusivo do Clube Mensal.");
    const { error } = await (context.supabase as any).from("club_lineup_presets").upsert({ trainer_id: trainerId, ...data, updated_at: new Date().toISOString() }, { onConflict: "trainer_id" });
    if (error) throw error;
    return { ok: true, preset: data };
  });

export const getMyTactics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const trainerId = await getTrainerId(supabase, userId);
    const { data } = await supabase
      .from("team_lineups")
      .select("default_tactics")
      .eq("trainer_id", trainerId)
      .maybeSingle();
    return { tactics: (data?.default_tactics as Tactics | null) ?? NEUTRAL_TACTICS };
  });

export const saveTactics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => TacticsSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const trainerId = await getTrainerId(supabase, userId);
    const { error } = await supabase
      .from("team_lineups")
      .update({ default_tactics: data })
      .eq("trainer_id", trainerId);
    if (error) throw error;
    return { ok: true, tactics: data };
  });


export const saveLineup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SaveInput.parse(raw))
  .handler(async ({ data, context }) => saveLineupForUser(context.supabase, context.userId, data));

async function saveLineupForUser(supabase: any, userId: string, data: z.infer<typeof SaveInput>) {
    const trainerId = await getTrainerId(supabase, userId);

    // valida que nenhuma criatura está duplicada e todas pertencem ao treinador
    const starterIds = data.starters.map((s) => s.creature_id).filter(Boolean) as string[];
    const allIds = [...starterIds, ...data.bench];
    const uniq = new Set(allIds);
    if (uniq.size !== allIds.length) {
      throw new Error("A mesma criatura não pode ocupar dois lugares.");
    }
    if (allIds.length > 0) {
      const { data: owned } = await supabase
        .from("creatures")
        .select("id, name, injury_matches_remaining")
        .eq("owner_trainer_id", trainerId)
        .in("id", allIds);
      if ((owned?.length ?? 0) !== allIds.length) {
        throw new Error("Uma das criaturas selecionadas não pertence ao seu elenco.");
      }
      const injured = (owned ?? []).find((c: any) => (c.injury_matches_remaining ?? 0) > 0);
      if (injured) {
        throw new Error(`${injured.name} está lesionada e não pode ser escalada.`);
      }
    }

    const { error } = await supabase
      .from("team_lineups")
      .upsert(
        {
          trainer_id: trainerId,
          formation: data.formation,
          strategy: data.strategy,
          starters: data.starters,
          bench: data.bench,
        },
        { onConflict: "trainer_id" },
      );
    if (error) throw error;
    return { ok: true };
}

const DirectSaveInput = SaveInput.extend({ access_token: z.string().min(20) });
export const saveLineupWithSession = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => DirectSaveInput.parse(raw))
  .handler(async ({ data }) => {
    const { supabase, userId } = await getDirectSession(data.access_token);
    const { access_token: _accessToken, ...lineup } = data;
    return saveLineupForUser(supabase, userId, lineup);
  });
