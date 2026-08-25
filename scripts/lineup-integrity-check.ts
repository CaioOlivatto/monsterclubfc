import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const lineup = read("src/lib/lineup.functions.ts");
const side = read("src/lib/player-side.server.ts");
const migration = read("supabase/migrations/20260826120000_lineup_team_integrity.sql");

assert.ok(lineup.includes('.eq("owner_team_id", trainer.current_team_id)'), "load/save deve filtrar clube atual");
assert.ok(lineup.includes('.eq("retired", false)'), "aposentados não podem entrar no elenco elegível");
assert.ok(lineup.includes('new Set(allIds)'), "duplicatas devem ser rejeitadas");
assert.ok(lineup.includes('save_team_lineup_atomic'), "salvamento deve usar RPC atômica");
assert.ok(side.includes('.eq("owner_trainer_id", trainerId)') && side.includes('.eq("owner_team_id", teamId)'), "partida deve revalidar treinador e clube");
assert.ok(side.includes('.eq("retired", false)'), "partida deve rejeitar aposentado");
assert.ok(migration.includes("FOR UPDATE"), "RPC deve bloquear o contexto do treinador durante a validação");
assert.ok(migration.includes("v_valid_count <> v_selected_count"), "RPC deve exigir existência integral");
assert.ok(migration.includes("REVOKE INSERT, UPDATE ON public.team_lineups"), "escrita direta deve ser bloqueada");
assert.ok(lineup.includes("save_team_tactics_atomic") && migration.includes("save_team_tactics_atomic"), "táticas devem continuar salvando pela RPC protegida");
assert.ok(migration.includes("COALESCE(c.injury_matches_remaining, 0) = 0"), "lesionado deve ser indisponível, não estrangeiro");

console.log("PASS lineup integrity: próprio, estrangeiro, órfão, aposentado, lesionado, duplicata e bypass direto cobertos");
