import assert from "node:assert/strict";
import { GEM_PACKAGES, SPEED_REAL_MONEY_PRODUCTS } from "../src/lib/shop.server.ts";

let previousValue = 0;
for (const pack of GEM_PACKAGES) {
  const totalGems = pack.gems + pack.bonus;
  const gemsPerReal = totalGems / (pack.priceCents / 100);
  assert.ok(pack.priceCents > 0, `${pack.name}: preço inválido`);
  assert.ok(totalGems > 0, `${pack.name}: pacote vazio`);
  assert.ok(gemsPerReal > previousValue, `${pack.name}: valor deve superar o pacote anterior`);
  previousValue = gemsPerReal;
}

assert.ok(SPEED_REAL_MONEY_PRODUCTS["4x"].priceCents > 0, "4x precisa de preço real");
assert.ok(
  SPEED_REAL_MONEY_PRODUCTS.instant.priceCents > SPEED_REAL_MONEY_PRODUCTS["4x"].priceCents,
  "Instantâneo deve valer mais que 4x",
);

console.log("Monetization checks: OK");
