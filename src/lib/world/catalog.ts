// Catálogo global dos 70 times (5 divisões × 14 times).
// Nomes, elemento dominante e cores conforme a especificação do jogo.

import type { Element } from "@/lib/bestiary";
import type { StarterKey } from "@/lib/starter-teams";

export type DivisionSlug = "lendaria" | "diamante" | "ouro" | "prata" | "bronze";

export const DIVISION_ORDER: DivisionSlug[] = ["bronze", "prata", "ouro", "diamante", "lendaria"];

export const DIVISION_LABEL: Record<DivisionSlug, string> = {
  lendaria: "1ª — Liga Lendária",
  diamante: "2ª — Liga Diamante",
  ouro: "3ª — Liga Ouro",
  prata: "4ª — Liga Prata",
  bronze: "5ª — Liga Bronze",
};

export type ElementKey = Element | "mesclado";

export interface WorldTeam {
  name: string;
  element: ElementKey;
  primary: string;   // cor primária (hex)
  secondary: string; // cor secundária (hex)
  starterKey?: StarterKey; // marca os 6 times iniciais da 5ª divisão
}

// -------- Cor helpers (mapeamento de rótulos das tabelas para hex) --------

const C = {
  dourado: "#D4A857",
  preto: "#111827",
  vermelho: "#DC2626",
  azulMarinho: "#0B2545",
  prata: "#C0C0C0",
  marrom: "#7C4A2A",
  branco: "#FAFAFA",
  roxo: "#7C3AED",
  ciano: "#22D3EE",
  laranja: "#F97316",
  amarelo: "#FACC15",
  azulEscuro: "#1E3A8A",
  verde: "#22C55E",
  cinza: "#6B7280",
  ocre: "#B08948",
  azulPetroleo: "#08415C",
  turquesa: "#2DD4BF",
  azul: "#2563EB",
  verdeAgua: "#38B2AC",
  azulGelo: "#BAE6FD",
  azulClaro: "#7DD3FC",
  lilas: "#C084FC",
  rosa: "#F472B6",
  verdeClaro: "#86EFAC",
  bege: "#EBD7B1",
  coral: "#FF7F50",
  ambar: "#B08948",
  cinzaEscuro: "#374151",
  cinzaClaro: "#9CA3AF",
};

// -------- 5ª Divisão – Liga Bronze --------
export const BRONZE: WorldTeam[] = [
  { name: "Titãs de Pedra",     element: "terra", primary: C.marrom,    secondary: C.ambar,       starterKey: "titas_pedra" },
  { name: "Furacões do Vento",  element: "ar",    primary: C.lilas,     secondary: C.branco,      starterKey: "furacoes_vento" },
  { name: "Chamas Rubras",      element: "fogo",  primary: C.vermelho,  secondary: C.laranja,     starterKey: "chamas_rubras" },
  { name: "Marés Profundas",    element: "agua",  primary: C.azul,      secondary: C.azulEscuro,  starterKey: "mares_profundas" },
  { name: "Lâminas de Gelo",    element: "gelo",  primary: C.ciano,     secondary: C.branco,      starterKey: "laminas_gelo" },
  { name: "Guardiões Mistos",   element: "mesclado", primary: C.verde,  secondary: C.dourado,     starterKey: "guardioes_mistos" },
  { name: "Faísca FC",          element: "fogo",  primary: C.laranja,   secondary: C.amarelo },
  { name: "Nascente FC",        element: "agua",  primary: C.azulClaro, secondary: C.verde },
  { name: "Barranco FC",        element: "terra", primary: C.marrom,    secondary: C.cinza },
  { name: "Sopro FC",           element: "ar",    primary: C.branco,    secondary: C.lilas },
  { name: "Permafrost FC",      element: "gelo",  primary: C.azulGelo,  secondary: C.cinza },
  { name: "Gruta FC",           element: "terra", primary: C.cinzaEscuro, secondary: C.verde },
  { name: "Fogueira FC",        element: "fogo",  primary: C.vermelho,  secondary: C.amarelo },
  { name: "Neblina FC",         element: "ar",    primary: C.cinza,     secondary: C.branco },
];

// -------- 4ª Divisão – Liga Prata --------
export const PRATA: WorldTeam[] = [
  { name: "Cinzas FC",       element: "fogo",  primary: C.cinza,       secondary: C.vermelho },
  { name: "Ondas FC",        element: "agua",  primary: C.azulClaro,   secondary: C.branco },
  { name: "Rocha Viva",      element: "terra", primary: C.marrom,      secondary: C.verde },
  { name: "Brisa FC",        element: "ar",    primary: C.branco,      secondary: C.verdeClaro },
  { name: "Geada FC",        element: "gelo",  primary: C.branco,      secondary: C.azulClaro },
  { name: "Lava Negra",      element: "fogo",  primary: C.preto,       secondary: C.vermelho },
  { name: "Recife Azul",     element: "agua",  primary: C.azul,        secondary: C.coral },
  { name: "Quartzo FC",      element: "terra", primary: C.branco,      secondary: C.cinza },
  { name: "Altitude FC",     element: "ar",    primary: C.azul,        secondary: C.branco },
  { name: "Solstício FC",    element: "gelo",  primary: C.azulEscuro,  secondary: C.prata },
  { name: "Coliseu FC",      element: "mesclado", primary: C.bege,     secondary: C.vermelho },
  { name: "Sertão FC",       element: "terra", primary: C.ocre,        secondary: C.marrom },
  { name: "Tempestade FC",   element: "ar",    primary: C.cinza,       secondary: C.roxo },
  { name: "Ártico FC",       element: "gelo",  primary: C.branco,      secondary: C.azulMarinho },
];

// -------- 3ª Divisão – Liga Ouro --------
export const OURO: WorldTeam[] = [
  { name: "Ígneos FC",     element: "fogo",  primary: C.vermelho,  secondary: C.laranja },
  { name: "Vagalhão FC",   element: "agua",  primary: C.azul,      secondary: C.cinza },
  { name: "Raízes FC",     element: "terra", primary: C.verde,     secondary: C.marrom },
  { name: "Ventania FC",   element: "ar",    primary: C.lilas,     secondary: C.cinza },
  { name: "Tundra FC",     element: "gelo",  primary: C.branco,    secondary: C.cinza },
  { name: "Tição FC",      element: "fogo",  primary: C.preto,     secondary: C.laranja },
  { name: "Sereias FC",    element: "agua",  primary: C.turquesa,  secondary: C.rosa },
  { name: "Basalto FC",    element: "terra", primary: C.preto,     secondary: C.marrom },
  { name: "Rajada FC",     element: "ar",    primary: C.roxo,      secondary: C.branco },
  { name: "Cristal FC",    element: "gelo",  primary: C.ciano,     secondary: C.azulGelo },
  { name: "Lendários FC",  element: "mesclado", primary: C.dourado, secondary: C.azul },
  { name: "Cratera FC",    element: "terra", primary: C.cinza,     secondary: C.vermelho },
  { name: "Solares FC",    element: "fogo",  primary: C.amarelo,   secondary: C.vermelho },
  { name: "Estuário FC",   element: "agua",  primary: C.verde,     secondary: C.azul },
];

// -------- 2ª Divisão – Liga Diamante --------
export const DIAMANTE: WorldTeam[] = [
  { name: "Salamandras FC",  element: "fogo",  primary: C.laranja,     secondary: C.amarelo },
  { name: "Tritões FC",      element: "agua",  primary: C.turquesa,    secondary: C.branco },
  { name: "Minotauros FC",   element: "terra", primary: C.marrom,      secondary: C.vermelho },
  { name: "Ciclone FC",      element: "ar",    primary: C.lilas,       secondary: C.branco },
  { name: "Nevasca FC",      element: "gelo",  primary: C.branco,      secondary: C.azul },
  { name: "Forja Ardente",   element: "fogo",  primary: C.vermelho,    secondary: C.cinza },
  { name: "Maremoto FC",     element: "agua",  primary: C.azul,        secondary: C.verdeAgua },
  { name: "Granito FC",      element: "terra", primary: C.cinza,       secondary: C.preto },
  { name: "Zênite FC",       element: "ar",    primary: C.azulClaro,   secondary: C.dourado },
  { name: "Boreal FC",       element: "gelo",  primary: C.azul,        secondary: C.prata },
  { name: "Mitos Unidos",    element: "mesclado", primary: C.verde,    secondary: C.dourado },
  { name: "Brasa Eterna",    element: "fogo",  primary: C.laranja,     secondary: C.preto },
  { name: "Correnteza FC",   element: "agua",  primary: C.azul,        secondary: C.branco },
  { name: "Alados FC",       element: "ar",    primary: C.branco,      secondary: C.azul },
];

// -------- 1ª Divisão – Liga Lendária --------
export const LENDARIA: WorldTeam[] = [
  { name: "Panteão FC",           element: "mesclado", primary: C.dourado,     secondary: C.preto },
  { name: "Fênix Dourada",        element: "fogo",     primary: C.dourado,     secondary: C.vermelho },
  { name: "Kraken FC",            element: "agua",     primary: C.azulMarinho, secondary: C.prata },
  { name: "Titãs Ancestrais",     element: "terra",    primary: C.marrom,      secondary: C.dourado },
  { name: "Grifos Reais",         element: "ar",       primary: C.branco,      secondary: C.roxo },
  { name: "Coroa Glacial",        element: "gelo",     primary: C.ciano,       secondary: C.branco },
  { name: "Ifrit FC",             element: "fogo",     primary: C.laranja,     secondary: C.preto },
  { name: "Leviatã FC",           element: "agua",     primary: C.azulEscuro,  secondary: C.verde },
  { name: "Colosso de Pedra",     element: "terra",    primary: C.cinza,       secondary: C.ocre },
  { name: "Quetzal FC",           element: "ar",       primary: C.verde,       secondary: C.dourado },
  { name: "Jötun FC",             element: "gelo",     primary: C.azulGelo,    secondary: C.prata },
  { name: "Oráculo FC",           element: "mesclado", primary: C.roxo,        secondary: C.prata },
  { name: "Vulcânia Imperial",    element: "fogo",     primary: C.vermelho,    secondary: C.preto },
  { name: "Abissais FC",          element: "agua",     primary: C.azulPetroleo, secondary: C.branco },
];

export const WORLD_TEAMS: Record<DivisionSlug, WorldTeam[]> = {
  bronze: BRONZE,
  prata: PRATA,
  ouro: OURO,
  diamante: DIAMANTE,
  lendaria: LENDARIA,
};

// -------- Distribuição de estrelas por divisão (§ tabela do prompt) --------

/** Retorna array [halfStars, prob] em pares. halfStars = 0..10 (0★..5★ em passos de 0.5). */
export const STAR_PROFILE: Record<DivisionSlug, Array<[number, number]>> = {
  lendaria: [[10, 0.05], [9, 0.12], [8, 0.25], [7, 0.30], [6, 0.20], [5, 0.08]],
  diamante: [[9, 0.04], [8, 0.14], [7, 0.26], [6, 0.32], [5, 0.18], [4, 0.06]],
  ouro:     [[8, 0.05], [7, 0.15], [6, 0.30], [5, 0.30], [4, 0.15], [3, 0.05]],
  prata:    [[7, 0.04], [6, 0.14], [5, 0.28], [4, 0.32], [3, 0.17], [2, 0.05]],
  bronze:   [[6, 0.03], [5, 0.12], [4, 0.27], [3, 0.33], [2, 0.20], [1, 0.05]],
};

export function pickHalfStars(division: DivisionSlug, rng: () => number): number {
  const roll = rng();
  let acc = 0;
  for (const [half, prob] of STAR_PROFILE[division]) {
    acc += prob;
    if (roll <= acc) return half;
  }
  return STAR_PROFILE[division][STAR_PROFILE[division].length - 1][0];
}

// Composição por elenco: 3 GK / 8 DEF / 8 MID / 7 ATK = 26
export const ROSTER_COMPOSITION = {
  Goleiro: 3,
  Zagueiro: 8,
  "Meio-campo": 8,
  Atacante: 7,
} as const;

export const AGE_BUCKETS: Array<[number, number]> = [
  [18, 6],
  [21, 6],
  [24, 5],
  [27, 5],
  [30, 4],
]; // total 26
