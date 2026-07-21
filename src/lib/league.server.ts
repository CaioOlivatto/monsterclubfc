// Utilitários de liga: geração de calendário e nomes de times CPU.

const TEAM_NAMES = [
  "Falcões Ardentes",
  "Tsunami FC",
  "Titãs de Pedra",
  "Vendaval SC",
  "Nevasca Real",
  "Cometa Elemental",
  "Fúria Selvagem",
  "Sombra Racing",
  "Vulcão United",
  "Rajada Sporting",
  "Aurora Atlético",
  "Miragem FC",
];

export function pickCpuTeamNames(count: number, seed: number): string[] {
  const pool = [...TEAM_NAMES];
  const out: string[] = [];
  let s = seed || 1;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  while (out.length < count && pool.length) {
    const i = Math.floor(rnd() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

// Round-robin (método círculo) — para N times pares (aqui 8).
// Retorna array de rounds; cada round é lista de [homeIdx, awayIdx].
export function generateSchedule(teamCount: number, doubleRound = true): Array<Array<[number, number]>> {
  if (teamCount % 2 !== 0) throw new Error("teamCount deve ser par");
  const n = teamCount;
  const rounds: Array<Array<[number, number]>> = [];
  const arr = Array.from({ length: n }, (_, i) => i);

  for (let r = 0; r < n - 1; r++) {
    const round: Array<[number, number]> = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      // Alterna mandante para equilibrar
      if (r % 2 === 0) round.push([a, b]);
      else round.push([b, a]);
    }
    rounds.push(round);
    // Rotaciona (fixa índice 0)
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop()!);
    arr.splice(0, arr.length, fixed, ...rest);
  }

  if (doubleRound) {
    const second = rounds.map((round) => round.map(([h, a]) => [a, h] as [number, number]));
    rounds.push(...second);
  }
  return rounds;
}
