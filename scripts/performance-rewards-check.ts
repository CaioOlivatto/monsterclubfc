import assert from "node:assert/strict";
import { calculatePerformanceRewards } from "../src/lib/performance-rewards.ts";

const offensive = calculatePerformanceRewards({ division: "bronze", official: true, playerGoals: 9, opponentGoals: 0, playerCards: 0, outcome: "W", strategy: "ofensiva", strategyMinutes: 90 });
assert.equal(offensive.find((r) => r.type === "goals")?.amount, 6_250, "gols devem respeitar teto de 5");
assert.ok(offensive.some((r) => r.type === "total_attack"));
assert.ok(!offensive.some((r) => r.type === "tactical_wall"));
assert.equal(calculatePerformanceRewards({ division: "ouro", official: false, playerGoals: 5, opponentGoals: 0, playerCards: 0, outcome: "W", strategy: "defensiva", strategyMinutes: 90 }).length, 0, "amistoso não recompensa");
assert.ok(!calculatePerformanceRewards({ division: "prata", official: true, playerGoals: 1, opponentGoals: 0, playerCards: 0, outcome: "W", strategy: "defensiva", strategyMinutes: 53 }).some((r) => r.type === "tactical_wall"), "último minuto não habilita tática");
console.log("PASS performance rewards: cap, amistoso e janela tática");
