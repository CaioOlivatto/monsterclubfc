// Geradores de nome para academias simuladas e treinadores.
// Estilo mitológico/elemental, coerente com o catálogo dos 70 times profissionais.

const ACADEMY_PREFIX = [
  "Academia",
  "Instituto",
  "Casa",
  "Ordem",
  "Círculo",
  "Guilda",
  "Templo",
  "Colégio",
  "Confraria",
  "Escola",
  "Clube",
  "Grêmio",
  "Liceu",
  "União",
];

const ACADEMY_THEMES = [
  "Bruma Ancestral", "Chama Eterna", "Maré Profunda", "Vento Uivante", "Neve Serena",
  "Pedra Antiga", "Estrela Cadente", "Lua Prateada", "Sol Nascente", "Trovão Distante",
  "Raiz Profunda", "Onda Solene", "Faísca Sagrada", "Aurora Boreal", "Deserto Vermelho",
  "Vale Verdejante", "Céu Aberto", "Rio Sereno", "Neblina Cinza", "Cume Nevado",
  "Vulcão Adormecido", "Baía Cristalina", "Mata Encantada", "Bosque Silente", "Colina Dourada",
  "Cascata Rugidora", "Ilha Perdida", "Planície Vasta", "Lagoa Sagrada", "Montanha Solene",
  "Areias Ardentes", "Gelo Antigo", "Fumaça Densa", "Chuva de Estrelas", "Serra Encantada",
  "Nuvem Prateada", "Fenda Sombria", "Grande Vale", "Céu Claro", "Cratera Silente",
  "Espelho d'Água", "Fogueira Distante", "Muralha Verde", "Rocha Sagrada", "Onda Serena",
  "Farol Antigo", "Costa Brava", "Pântano Místico", "Cume Solar", "Manto Boreal",
  "Chamas Livres", "Cinzas Douradas", "Marés Claras", "Ventania Livre", "Geleira Serena",
  "Areal Dourado", "Bosque Sagrado", "Mar Interior", "Céu de Fogo", "Rio Cristal",
  "Vale Sombrio", "Colina Verde", "Cume Solene", "Trilha Antiga", "Poente Vermelho",
  "Alvorada Azul", "Pedreira Branca", "Grande Riacho", "Vulcania Menor", "Vale das Brumas",
  "Serra dos Ecos", "Cume das Auroras", "Vale dos Ventos", "Baía Serena", "Colina Cinzenta",
  "Península Dourada", "Grande Ilha", "Rio dos Cervos", "Mata dos Guardiões", "Torre Antiga",
  "Grande Fenda", "Passagem Livre", "Passo do Sol", "Vale Encantado", "Alto Refúgio",
  "Cume Perene", "Cristal Sagrado", "Névoa Densa", "Manto Solar", "Rio Vermelho",
  "Bosque das Sombras", "Trilha do Norte", "Serra Fria", "Ilhas Distantes", "Farol do Sul",
  "Boreal Dourado", "Alva Cinzenta", "Neblina Verde", "Estepe Azul", "Chama do Oeste",
];

const TRAINER_FIRST = [
  "Carlos", "João", "Pedro", "Marina", "Ana", "Lucas", "Rafael", "Beatriz", "Fernanda", "Bruno",
  "Gabriel", "Mariana", "Ricardo", "Camila", "André", "Juliana", "Felipe", "Larissa", "Thiago", "Renata",
  "Rodrigo", "Patrícia", "Diego", "Vanessa", "Marcelo", "Aline", "Gustavo", "Amanda", "Leonardo", "Débora",
  "Vinicius", "Tatiana", "Eduardo", "Cristina", "Fábio", "Roberta", "Alexandre", "Priscila", "Henrique", "Bianca",
  "Igor", "Letícia", "Matheus", "Natália", "Otávio", "Paula", "Renan", "Sofia", "Túlio", "Yasmin",
  "Vitor", "Isabela", "Wagner", "Elaine", "César", "Denise", "Murilo", "Rosana", "Sérgio", "Melissa",
  "Miguel", "Luiza", "Enzo", "Helena", "Arthur", "Alice", "Bento", "Manuela", "Davi", "Valentina",
];

const TRAINER_LAST = [
  "Silva", "Souza", "Oliveira", "Santos", "Costa", "Pereira", "Almeida", "Ferreira", "Ribeiro", "Rodrigues",
  "Gomes", "Martins", "Araújo", "Barbosa", "Lima", "Carvalho", "Nunes", "Cardoso", "Teixeira", "Correia",
  "Mendes", "Dias", "Castro", "Cavalcanti", "Rocha", "Moreira", "Freitas", "Pinto", "Andrade", "Sales",
  "Batista", "Barros", "Fonseca", "Marques", "Farias", "Duarte", "Vieira", "Neves", "Machado", "Guimarães",
  "Tavares", "Pires", "Melo", "Braga", "Nogueira", "Peixoto", "Câmara", "Vasconcelos", "Bittencourt", "Coelho",
];

const COLORS = [
  ["#DC2626", "#111827"], ["#0B2545", "#D4A857"], ["#22C55E", "#0F172A"], ["#2563EB", "#FAFAFA"],
  ["#7C3AED", "#F5F3FF"], ["#F97316", "#111827"], ["#0EA5E9", "#082F49"], ["#EAB308", "#1F2937"],
  ["#059669", "#064E3B"], ["#DB2777", "#831843"], ["#0891B2", "#083344"], ["#6B7280", "#F9FAFB"],
  ["#B08948", "#3B2A16"], ["#38B2AC", "#0F172A"], ["#7C4A2A", "#F5DEB3"], ["#22D3EE", "#0E7490"],
];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

export interface GeneratedAcademy {
  academy_name: string;
  trainer_name: string;
  primary_color: string;
  secondary_color: string;
}

/** Gera N academias/treinadores únicos determinísticos a partir de uma seed. */
export function generateAmateurAcademies(count: number, seed = 20260722): GeneratedAcademy[] {
  const rng = mulberry32(seed);
  const usedAcademy = new Set<string>();
  const usedTrainer = new Set<string>();
  const out: GeneratedAcademy[] = [];
  let guard = 0;
  while (out.length < count && guard < count * 20) {
    guard++;
    const prefix = pick(ACADEMY_PREFIX, rng);
    const theme = pick(ACADEMY_THEMES, rng);
    const academy = `${prefix} ${theme}`;
    if (usedAcademy.has(academy)) continue;
    let trainer = `${pick(TRAINER_FIRST, rng)} ${pick(TRAINER_LAST, rng)}`;
    let attempt = 0;
    while (usedTrainer.has(trainer) && attempt < 40) {
      trainer = `${pick(TRAINER_FIRST, rng)} ${pick(TRAINER_LAST, rng)}`;
      attempt++;
    }
    if (usedTrainer.has(trainer)) continue;
    usedAcademy.add(academy);
    usedTrainer.add(trainer);
    const [primary, secondary] = pick(COLORS, rng);
    out.push({ academy_name: academy, trainer_name: trainer, primary_color: primary, secondary_color: secondary });
  }
  return out;
}
