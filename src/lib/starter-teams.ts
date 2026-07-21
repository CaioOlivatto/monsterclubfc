// Catálogo dos 6 times iniciais fixos + gerador do elenco de 22 criaturas.
// Determinístico por `starter_key` para reprodutibilidade.

export type StarterKey =
  | "titas_pedra"
  | "furacoes_vento"
  | "chamas_rubras"
  | "mares_profundas"
  | "laminas_gelo"
  | "guardioes_mistos";

export type StarterStyle = "defensivo" | "ofensivo" | "equilibrado";
export type ElementKey = "fogo" | "agua" | "terra" | "ar" | "gelo";

export interface StarterTeamDef {
  key: StarterKey;
  name: string;
  emblem: string;
  color: string; // tema (label pt-BR)
  colorClass: string; // classes tailwind (bg + border) para o card
  dominant: ElementKey | "mesclado";
  style: StarterStyle;
  description: string;
}

export const STARTER_TEAMS: StarterTeamDef[] = [
  {
    key: "titas_pedra",
    name: "Titãs de Pedra",
    emblem: "🗿",
    color: "marrom/âmbar",
    colorClass: "from-amber-900/40 to-amber-700/10 border-amber-700/40",
    dominant: "terra",
    style: "defensivo",
    description: "Muralha do elemento Terra. Segura resultado, sofre pra criar.",
  },
  {
    key: "furacoes_vento",
    name: "Furacões do Vento",
    emblem: "🌀",
    color: "lilás/branco",
    colorClass: "from-violet-500/30 to-violet-300/10 border-violet-400/40",
    dominant: "ar",
    style: "ofensivo",
    description: "Velocidade e ataque de Ar. Placar alto, defesa frágil.",
  },
  {
    key: "chamas_rubras",
    name: "Chamas Rubras",
    emblem: "🔥",
    color: "vermelho/laranja",
    colorClass: "from-red-600/40 to-orange-500/10 border-red-500/40",
    dominant: "fogo",
    style: "ofensivo",
    description: "Pressão constante do Fogo. Domina times de Gelo.",
  },
  {
    key: "mares_profundas",
    name: "Marés Profundas",
    emblem: "🌊",
    color: "azul",
    colorClass: "from-blue-600/40 to-blue-400/10 border-blue-500/40",
    dominant: "agua",
    style: "equilibrado",
    description: "Água versátil. Vantagem elemental contra Fogo.",
  },
  {
    key: "laminas_gelo",
    name: "Lâminas de Gelo",
    emblem: "❄️",
    color: "ciano/branco",
    colorClass: "from-cyan-400/30 to-sky-200/10 border-cyan-400/40",
    dominant: "gelo",
    style: "defensivo",
    description: "Gelo paciente. Controla o ritmo e contra-ataca.",
  },
  {
    key: "guardioes_mistos",
    name: "Guardiões Mistos",
    emblem: "🛡️",
    color: "verde/dourado",
    colorClass: "from-emerald-600/30 to-yellow-500/10 border-emerald-500/40",
    dominant: "mesclado",
    style: "equilibrado",
    description: "Um pouco de cada elemento. Difícil de ler.",
  },
];

export function getStarterTeam(key: string): StarterTeamDef | null {
  return STARTER_TEAMS.find((t) => t.key === key) ?? null;
}

// ------- Geração determinística -------

function hashSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h || 1;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ELEMENT_PREFIXES: Record<ElementKey, string[]> = {
  fogo: ["Vulc", "Igni", "Pyro", "Ember", "Fulg", "Piri", "Cald"],
  agua: ["Aqua", "Hydro", "Rio", "Onda", "Maré", "Nauti", "Undin"],
  terra: ["Petra", "Terra", "Monte", "Rocha", "Geo", "Silva", "Cald"],
  ar: ["Aero", "Ventus", "Aura", "Brisa", "Zeph", "Volante", "Nimbo"],
  gelo: ["Cryo", "Glacia", "Nix", "Frost", "Neva", "Cristal", "Boreal"],
};

const SUFFIXES = [
  "ron", "lith", "dorix", "vent", "frim", "tar", "mir", "zeph",
  "gorn", "dus", "phus", "tos", "quir", "nel", "dax", "ram",
  "kur", "phyx", "tan", "vor", "sol", "nix", "mel", "gar",
];

const POSITIONS = ["Goleiro", "Zagueiro", "Meio-campo", "Atacante"] as const;

type StarLevel = 1 | 2 | 3 | 4 | 5 | 6; // 1=0,5★ ... 6=3★
const STAR_TO_ATTR: Record<StarLevel, number> = {
  1: 10, 2: 20, 3: 30, 4: 40, 5: 50, 6: 60,
};

interface RosterSlot {
  position: (typeof POSITIONS)[number];
  stars: StarLevel;
}

// 22 criaturas: 3 GOL, 7 DEF, 7 MEI, 5 ATA.
// Distribuição de estrelas por time (~41★ somados = 82 meia-estrelas):
// 10 × 1  (0,5★) = 10
// 9  × 4  (2★)   = 36
// 3  × 6  (3★)   = 18   → 64 meia = 32★... ajusto:
// Vamos usar (star em meia): 10 slots com 1-3 (média 2 → 1★), 9 slots com 4-5 (média ~2,25★), 3 slots com 6 (3★)
// Soma média: 10*1 + 9*2.25 + 3*3 = 10 + 20.25 + 9 = 39.25★. Ok, próximo de 41.

function buildRosterPlan(rand: () => number): RosterSlot[] {
  const positions: (typeof POSITIONS)[number][] = [
    ...Array(3).fill("Goleiro"),
    ...Array(7).fill("Zagueiro"),
    ...Array(7).fill("Meio-campo"),
    ...Array(5).fill("Atacante"),
  ];
  // 10 low, 9 mid, 3 high
  const starLevels: StarLevel[] = [
    ...Array(4).fill(1), ...Array(4).fill(2), ...Array(2).fill(3), // 10 low
    ...Array(5).fill(4), ...Array(4).fill(5),                       // 9 mid
    ...Array(3).fill(6),                                            // 3 high
  ] as StarLevel[];
  // shuffle positions e stars independentemente e junta
  const shuffle = <T,>(arr: T[]) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const sp = shuffle(positions);
  const ss = shuffle(starLevels);
  return sp.map((p, i) => ({ position: p, stars: ss[i] }));
}

// Distribuição de elementos por time
function pickElement(
  team: StarterTeamDef,
  rand: () => number,
): ElementKey {
  const elems: ElementKey[] = ["fogo", "agua", "terra", "ar", "gelo"];
  if (team.dominant === "mesclado") {
    return elems[Math.floor(rand() * 5)];
  }
  const dom = team.dominant as ElementKey;
  // Elemento de apoio
  const support: Record<ElementKey, ElementKey> = {
    fogo: "ar",
    agua: "gelo",
    terra: "agua",
    ar: "fogo",
    gelo: "terra",
  };
  const r = rand();
  if (r < 0.70) return dom;
  if (r < 0.90) return support[dom];
  // resto: qualquer outro elemento
  const others = elems.filter((e) => e !== dom && e !== support[dom]);
  return others[Math.floor(rand() * others.length)];
}

// Distribui os pontos de atributo com viés de estilo.
function distributeAttrs(
  base: number,
  position: (typeof POSITIONS)[number],
  style: StarterStyle,
  rand: () => number,
): { attack: number; defense: number; goalkeeper: number; physical: number; strength: number } {
  // ± 10 de variação, alinhado em múltiplos de 10.
  const jitter = () => (Math.floor(rand() * 3) - 1) * 10; // -10 / 0 / +10
  const clamp = (v: number) => Math.max(10, Math.min(90, Math.round(v / 10) * 10));

  let atk = base + jitter();
  let def = base + jitter();
  let gk = base + jitter();
  let phy = base + jitter();
  let str = base + jitter();

  // Viés por posição
  if (position === "Goleiro") gk += 20;
  else gk -= 10;
  if (position === "Zagueiro") { def += 10; str += 10; }
  if (position === "Atacante") { atk += 10; phy += 10; }
  if (position === "Meio-campo") { phy += 10; }

  // Viés por estilo do time
  if (style === "defensivo") { def += 10; gk += 5; str += 5; atk -= 10; }
  if (style === "ofensivo") { atk += 15; phy += 5; def -= 10; gk -= 5; }
  // equilibrado: sem viés

  return {
    attack: clamp(atk),
    defense: clamp(def),
    goalkeeper: clamp(gk),
    physical: clamp(phy),
    strength: clamp(str),
  };
}

export interface GeneratedCreature {
  name: string;
  element: ElementKey;
  suggested_position: string;
  attack: number;
  defense: number;
  goalkeeper: number;
  physical: number;
  strength: number;
  aff_fogo: number;
  aff_agua: number;
  aff_terra: number;
  aff_ar: number;
  aff_gelo: number;
  overall: number;
  xp: number;
  half_stars_earned: number;
  energy: number;
  market_value: number;
  stars: number; // meia-estrelas (para UI de preview)
}

export function generateStarterRoster(teamKey: StarterKey): GeneratedCreature[] {
  const team = getStarterTeam(teamKey);
  if (!team) throw new Error("Time inicial inválido.");
  const rand = mulberry32(hashSeed(teamKey));
  const plan = buildRosterPlan(rand);

  const creatures: GeneratedCreature[] = plan.map((slot) => {
    const element = pickElement(team, rand);
    const prefix = ELEMENT_PREFIXES[element][
      Math.floor(rand() * ELEMENT_PREFIXES[element].length)
    ];
    const suffix = SUFFIXES[Math.floor(rand() * SUFFIXES.length)];
    const base = STAR_TO_ATTR[slot.stars];
    const attrs = distributeAttrs(base, slot.position, team.style, rand);
    const overall = Math.round(
      (attrs.attack + attrs.defense + attrs.goalkeeper + attrs.physical + attrs.strength) / 5,
    );
    // Afinidade inicial: 3 no elemento dominante do time p/ criaturas Fogo do time ofensivo (Chamas)
    // Demais times: 0 para todos (§2.3).
    const aff = { aff_fogo: 0, aff_agua: 0, aff_terra: 0, aff_ar: 0, aff_gelo: 0 };
    if (team.key === "chamas_rubras" && element === "fogo") {
      aff.aff_fogo = 3;
    }
    return {
      name: prefix + suffix,
      element,
      suggested_position: slot.position,
      ...attrs,
      ...aff,
      overall,
      xp: 0,
      half_stars_earned: slot.stars,
      energy: 100,
      market_value: overall * 800,
      stars: slot.stars,
    };
  });

  return creatures;
}

export function starterTeamSummary(teamKey: StarterKey) {
  const roster = generateStarterRoster(teamKey);
  const totalStars = roster.reduce((s, c) => s + c.stars, 0) / 2; // meia → estrela
  const avgAttack = Math.round(roster.reduce((s, c) => s + c.attack, 0) / roster.length);
  const avgDefense = Math.round(roster.reduce((s, c) => s + c.defense, 0) / roster.length);
  return { totalStars, avgAttack, avgDefense };
}
