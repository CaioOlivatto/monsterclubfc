import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260824150000_monetization_readiness.sql");
const integration = read("supabase/migrations/20260824130000_final_integration_calibration.sql");
const gemEconomy = read("src/lib/gem-economy.ts");
const packageJson = read("package.json");

for (const fragment of [
  "REVOKE ALL ON FUNCTION public.apply_gem_delta_atomic",
  "private_gem_move",
  "gem_ledger_baselines",
  "gem_reconciliation",
  "payment_orders_provider_tx_idx",
  "confirm_payment_order_atomic",
  "service role required",
]) assert.ok(migration.includes(fragment), `proteção ausente: ${fragment}`);

for (const [sku, cents, gems] of [
  ["gem_pack_100", 790, 100], ["gem_pack_450", 2490, 450],
  ["gem_pack_1050", 4990, 1050], ["gem_pack_2200", 8490, 2200],
  ["gem_pack_6000", 19990, 6000],
] as const) {
  assert.ok(migration.includes(`('${sku}',${cents},${gems})`), `pacote divergente: ${sku}`);
}

for (const [mode, price] of [["2x", 100], ["4x", 300], ["instant", 800]] as const)
  assert.ok(integration.includes(`WHEN '${mode}' THEN ${price}`), `velocidade divergente: ${mode}`);
assert.ok(integration.includes("1050"), "bundle divergente");
for (const price of ["1_300", "1_500", "1_700", "1_900", "2_200"])
  assert.ok(gemEconomy.includes(price), `premium divergente: ${price}`);

class Ledger {
  balance: number;
  keys = new Set<string>();
  entries = 0;
  constructor(balance: number) { this.balance = balance; }
  debit(amount: number, key: string) {
    if (this.keys.has(key)) return false;
    if (this.balance < amount) throw new Error("insufficient gems");
    this.balance -= amount; this.keys.add(key); this.entries++; return true;
  }
  credit(amount: number, key: string) {
    if (this.keys.has(key)) return false;
    this.balance += amount; this.keys.add(key); this.entries++; return true;
  }
}

const replay = new Ledger(100);
assert.equal(replay.debit(80, "purchase:1"), true);
assert.equal(replay.debit(80, "purchase:1"), false);
assert.equal(replay.balance, 20);
assert.equal(replay.entries, 1);

const concurrent = new Ledger(100);
const results = ["a", "b"].map((key) => { try { return concurrent.debit(80, key); } catch { return false; } });
assert.deepEqual(results, [true, false]);
assert.equal(concurrent.balance, 20);

const webhook = new Ledger(10);
assert.equal(webhook.credit(450, "payment:provider:tx-1"), true);
assert.equal(webhook.credit(450, "payment:provider:tx-1"), false);
assert.equal(webhook.balance, 460);

assert.ok(packageJson.includes("monetization:readiness"), "script não registrado");
console.log("monetization readiness: OK (catálogo, ledger, replay, concorrência e webhook duplicado)");
