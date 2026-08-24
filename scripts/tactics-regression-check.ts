import assert from "node:assert/strict";
import {
  createTacticsPayload,
  NEUTRAL_TACTICS,
  normalizeTactics,
  updateTacticAxis,
  type TacticAxis,
} from "../src/lib/tactics-draft.ts";

const axes: TacticAxis[] = ["mentalidade", "verticalidade", "pressao", "cortes"];
const current = { mentalidade: -1, verticalidade: 1, pressao: 2, cortes: -2 };

function assertFinite(payload: Record<TacticAxis, number>) {
  for (const axis of axes) assert.equal(Number.isFinite(payload[axis]), true, `${axis} deve ser finito`);
}

// Alterar somente a mentalidade preserva os demais valores persistidos.
let draft = updateTacticAxis(current, "mentalidade", [2], current);
assert.deepEqual(createTacticsPayload(draft, current), { ...current, mentalidade: 2 });

// Alterar cada eixo individualmente.
for (const axis of axes) {
  const changed = updateTacticAxis(current, axis, [0], current);
  assert.equal(changed[axis], 0);
  assertFinite(createTacticsPayload(changed, current));
}

// Alterar todos os eixos.
draft = current;
for (const [index, axis] of axes.entries()) draft = updateTacticAxis(draft, axis, [index - 2], current);
assertFinite(createTacticsPayload(draft, current));

// Salvar sem alterar nada e reabrir preservam os valores.
assert.deepEqual(createTacticsPayload(current, current), current);
assert.deepEqual(normalizeTactics(current), current);

// Dados antigos/incompletos nunca propagam undefined ou NaN ao Slider/payload.
const legacy = normalizeTactics({ mentalidade: "1", verticalidade: undefined, pressao: Number.NaN }, current);
assert.deepEqual(legacy, { mentalidade: 1, verticalidade: 1, pressao: 2, cortes: -2 });
assertFinite(createTacticsPayload(legacy, current));
assert.deepEqual(normalizeTactics({ mentalidade: 99, verticalidade: 1.5 }, current), current);
assert.deepEqual(normalizeTactics(null), NEUTRAL_TACTICS);

console.log("Tactics regression: PASS");
