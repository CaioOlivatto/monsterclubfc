import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const checks: Array<[string, boolean]> = [];
const expect = (label: string, condition: boolean) => checks.push([label, condition]);

const match = read("src/routes/_authenticated/match.$id.tsx");
const gems = read("src/lib/gem-economy.ts");
const league = read("src/lib/league.functions.ts");
const dashboard = read("src/routes/_authenticated/dashboard.tsx");
const leagueUi = read("src/routes/_authenticated/league.tsx");
const market = read("src/lib/market.functions.ts");
const marketMigration = read("supabase/migrations/20260824140000_gem_market_economy.sql");
const seasonMigration = read("supabase/migrations/20260825110000_season_transition_guard.sql");
const moraleMigration = read("supabase/migrations/20260825120000_atomic_morale_cycles.sql");
const timerMigration = read("supabase/migrations/20260825130000_authoritative_offline_timers.sql");
const morale = read("src/lib/morale-training.functions.ts");
const buildings = read("src/lib/buildings.functions.ts");
const training = read("src/lib/training.functions.ts");

expect("custos 2x/4x/instantâneo", /speed2x:\s*100[\s\S]*speed4x:\s*300[\s\S]*instant:\s*800/.test(gems));
expect("confirmação de velocidade com saldo", match.includes("Saldo após a compra") && match.includes("Confirmar por ${cost} gemas"));
expect("fim de temporada protegido", seasonMigration.includes("claim_season_transition") && seasonMigration.includes("complete_season_transition") && seasonMigration.includes("pg_advisory_xact_lock"));
expect("transição canônica no servidor", league.includes("claim_season_transition") && league.includes("complete_season_transition"));
expect("CTAs da temporada", /Ver resultados/i.test(dashboard) && /Iniciar nova temporada/i.test(dashboard) && /Iniciar nova temporada/i.test(leagueUi));
expect("compra de mercado atômica", market.includes("purchase_market_creature_atomic") && marketMigration.includes("CREATE OR REPLACE FUNCTION public.purchase_market_creature_atomic"));
expect("mercado com idempotência", marketMigration.includes("idempotency") && marketMigration.includes("FOR UPDATE"));
expect("ciclos coletivos atômicos", morale.includes("apply_collective_morale_action_atomic") && moraleMigration.includes("CREATE OR REPLACE FUNCTION public.apply_collective_morale_action_atomic"));
expect("janelas reais 12h/24h", gems.includes("meetingHours: 12") && gems.includes("generalHours: 24"));
expect("custos extras progressivos", gems.includes("[15, 30, 60, 120]") && gems.includes("[30, 60, 120, 240]"));
expect("timer de construção autoritativo", buildings.includes("start_building_upgrade_atomic_v2") && timerMigration.includes("CREATE OR REPLACE FUNCTION public.start_building_upgrade_atomic_v2"));
expect("timer de treino autoritativo", training.includes("start_attribute_training_atomic") && timerMigration.includes("CREATE OR REPLACE FUNCTION public.start_attribute_training_atomic"));
expect("timer de moral autoritativo", morale.includes("start_individual_morale_atomic") && timerMigration.includes("CREATE OR REPLACE FUNCTION public.start_individual_morale_atomic"));
expect("relógio do banco", (timerMigration.match(/clock_timestamp\(\)|now\(\)/g) ?? []).length >= 3);

for (const [label, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
const failed = checks.filter(([, ok]) => !ok);
if (failed.length) throw new Error(`${failed.length} verificação(ões) do playtest falharam.`);
console.log(`PASS playtest bugfix gate (${checks.length}/${checks.length})`);
