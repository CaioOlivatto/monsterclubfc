import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const migration = read("supabase/migrations/20260820220034_atomic_career_activation.sql");
for (const required of [
  "SECURITY INVOKER",
  "auth.uid()",
  "v_roster_count <> 26",
  "jsonb_array_length(p_starters) <> 11",
  "jsonb_array_length(p_bench) <> 7",
  "INSERT INTO public.academies",
  "INSERT INTO public.buildings",
  "INSERT INTO public.items",
  "INSERT INTO public.team_lineups",
  "UPDATE public.trainers",
  "INSERT INTO public.trainer_career",
  "UPDATE public.buildings b",
  "SET team_id = p_team_id",
  "v_academy_count <> 1",
  "v_building_count <> 3",
  "v_item_count <> 2",
  "v_lineup_count <> 1",
]) assert.ok(migration.includes(required), `Migração atômica incompleta: ${required}`);

const middleware = read("src/integrations/supabase/auth-middleware.ts");
assert.ok(
  middleware.includes("transportedToken || forwardedToken || bearerToken || sessionCookieToken"),
  "A autenticação não prioriza a sessão atual do navegador.",
);
assert.ok(middleware.includes("getDirectSession(token)"), "O middleware não usa o verificador central de sessão.");

const directSession = read("src/lib/direct-session.server.ts");
assert.ok(
  directSession.includes("/auth/v1/user") && directSession.includes("Authorization: `Bearer ${token}`"),
  "A sessão central não é validada diretamente pelo Supabase Auth.",
);
const authRoute = read("src/routes/auth.tsx");
assert.ok(!authRoute.includes("syncServerSession"), "O login ainda depende do cookie do host.");
const authenticatedGate = read("src/routes/_authenticated/route.tsx");
assert.ok(!authenticatedGate.includes("syncServerSession"), "A entrada no jogo ainda depende do cookie do host.");
const browserClient = read("src/integrations/supabase/client.ts");
assert.ok(browserClient.includes("installServerFunctionAuthTransport();"), "O transporte de autenticação não inicia antes das rotas.");
assert.ok(browserClient.includes("x-supabase-access-token"), "As Server Functions não recebem a sessão atual do navegador.");

for (const path of [
  "src/lib/creatures.functions.ts",
  "src/lib/lineup.functions.ts",
  "src/lib/market.functions.ts",
  "src/lib/buildings.functions.ts",
  "src/lib/league.functions.ts",
  "src/lib/match.functions.ts",
  "src/lib/official-match.functions.ts",
  "src/lib/odds.functions.ts",
]) {
  const source = read(path);
  assert.ok(
    source.includes("getDirectSession") || source.includes("requireSupabaseAuth"),
    `${path} não usa autenticação central.`,
  );
}

const gate = read("src/routes/_authenticated/route.tsx");
const readyIndex = gate.indexOf("setSessionReady(true)");
const repairIndex = gate.indexOf("repairCareer", readyIndex);
assert.ok(readyIndex >= 0 && repairIndex > readyIndex, "Uma manutenção secundária ainda bloqueia uma sessão válida.");
assert.ok(gate.includes("[career-repair]"), "A recuperação automática da carreira deixou de ser monitorada.");
assert.ok(!gate.includes("preparationFailed"), "A tela de preparação manual ainda pode bloquear o jogador.");

const creatures = read("src/lib/creatures.functions.ts");
const trainerCreation = creatures.slice(
  creatures.indexOf("export const createInitialTrainer"),
  creatures.indexOf("export const listStarterTeams"),
);
for (const forbidden of ['.from("academies")', '.from("buildings")', '.from("items")']) {
  assert.ok(!trainerCreation.includes(forbidden), `Recurso parcial ainda criado antes do clube: ${forbidden}`);
}

const buildings = read("src/lib/buildings.functions.ts");
assert.ok(buildings.includes('.eq("team_id", trainer.current_team_id)'), "Construções não estão isoladas pelo clube ativo.");

const finances = read("src/routes/_authenticated/finances.tsx");
assert.ok(finances.includes("getFinancesWithSession"), "Finanças não usa a sessão Supabase validada diretamente.");

for (const path of [
  "src/routes/_authenticated/market.tsx",
  "src/routes/_authenticated/buildings.tsx",
  "src/routes/_authenticated/league.tsx",
  "src/routes/_authenticated/finances.tsx",
]) assert.ok(read(path).length > 500, `Tela obrigatória ausente ou incompleta: ${path}`);

console.log("Jornada validada: autenticação, carreira 26/11/7, Mercado, Construções, Liga e Finanças.");
