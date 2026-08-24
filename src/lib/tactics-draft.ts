export type TacticsDraft = {
  mentalidade: number;
  verticalidade: number;
  pressao: number;
  cortes: number;
};

export type TacticAxis = keyof TacticsDraft;

export const NEUTRAL_TACTICS: TacticsDraft = {
  mentalidade: 0,
  verticalidade: 0,
  pressao: 0,
  cortes: 0,
};

const AXES: TacticAxis[] = ["mentalidade", "verticalidade", "pressao", "cortes"];

function finiteAxis(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= -2 && parsed <= 2
    ? parsed
    : fallback;
}

export function normalizeTactics(
  value: unknown,
  fallback: TacticsDraft = NEUTRAL_TACTICS,
): TacticsDraft {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    mentalidade: finiteAxis(source.mentalidade, fallback.mentalidade),
    verticalidade: finiteAxis(source.verticalidade, fallback.verticalidade),
    pressao: finiteAxis(source.pressao, fallback.pressao),
    cortes: finiteAxis(source.cortes, fallback.cortes),
  };
}

export function updateTacticAxis(
  draft: TacticsDraft,
  axis: TacticAxis,
  sliderValues: number[],
  fallback: TacticsDraft = NEUTRAL_TACTICS,
): TacticsDraft {
  const normalized = normalizeTactics(draft, fallback);
  return {
    ...normalized,
    [axis]: finiteAxis(sliderValues[0], normalized[axis]),
  };
}

export function createTacticsPayload(
  draft: unknown,
  current: TacticsDraft = NEUTRAL_TACTICS,
): TacticsDraft {
  const payload = normalizeTactics(draft, current);
  if (AXES.some((axis) => !Number.isFinite(payload[axis]))) {
    throw new Error("Os quatro eixos táticos precisam ter valores numéricos válidos.");
  }
  return payload;
}
