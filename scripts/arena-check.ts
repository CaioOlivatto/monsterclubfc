import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20260815013000_arena_integrity_v2.sql", import.meta.url),
  "utf8",
);
const fairArena = readFileSync(
  new URL("../supabase/migrations/20260815003000_fair_competitive_arena.sql", import.meta.url),
  "utf8",
);

assert.match(migration, /p_mode='competitive' THEN 3/);
assert.match(migration, /active_until>now\(\)\) THEN 6 ELSE 3/);
assert.match(migration, /play_arena_duel_v2/);
assert.match(migration, /jsonb_array_elements\(tl\.starters\)/);
assert.match(migration, /bot_ranked_matches<=10/);
assert.match(migration, /THEN 9 ELSE -4/);
assert.match(migration, /REVOKE ALL ON FUNCTION public\.play_arena_duel\(/);
assert.match(fairArena, /difficulty:=dp::numeric\/greatest\(1,effective_power\)/);
assert.match(fairArena, /IF NEW\.mode<>'competitive' THEN RETURN NEW/);
assert.match(fairArena, /xp_room:=greatest\(0,150-a\.arena_xp_awarded\)/);
assert.match(fairArena, /IF xp_room=0 THEN cxp:=0/);
assert.match(fairArena, /strength_buffs>=3/);

console.log("Arena integrity checks: OK");
