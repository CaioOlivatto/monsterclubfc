// Bestiário Mitológico — 60 espécies de domínio público + 100 epítetos.
// Todas as espécies vêm de mitologia/folclore livre (grega, nórdica, brasileira etc).

export type Element = "fogo" | "agua" | "terra" | "ar" | "gelo";
export type Position = "Goleiro" | "Zagueiro" | "Meio-campo" | "Atacante";

// Atributos de linha (0..100)
export interface LineAttrs {
  defender: number;
  passar: number;
  atacar: number;
  tecnica: number;
  forca: number;
  pique: number;
}

// Atributos de goleiro (0..100)
export interface GkAttrs {
  maos: number;
  concentracao: number;
  elasticidade: number;
}

export interface SpeciesBase {
  species: string;
  element: Element;
  position: Position;
  origin: string;
  power_key: string;
  power_name: string;
  power_desc: string;
  // Exatamente um destes é preenchido de acordo com a posição
  line?: LineAttrs;
  gk?: GkAttrs;
}

// -------- Catálogo --------

export const BESTIARY: SpeciesBase[] = [
  // 🔥 FOGO — linha
  { species: "Fênix", element: "fogo", position: "Atacante", origin: "Grega/Egípcia", power_key: "renascer", power_name: "Renascer", power_desc: "Se sair lesionada, volta com energia cheia na próxima partida.", line: { defender: 22, passar: 45, atacar: 74, tecnica: 62, forca: 38, pique: 70 } },
  { species: "Salamandra", element: "fogo", position: "Meio-campo", origin: "Europeia", power_key: "pele_brasa", power_name: "Pele de Brasa", power_desc: "Reduz o desgaste de energia pela metade.", line: { defender: 40, passar: 58, atacar: 50, tecnica: 66, forca: 35, pique: 62 } },
  { species: "Ifrit", element: "fogo", position: "Atacante", origin: "Árabe", power_key: "explosao", power_name: "Explosão", power_desc: "Chute com chance extra de gol de fora da área.", line: { defender: 30, passar: 40, atacar: 72, tecnica: 48, forca: 68, pique: 52 } },
  { species: "Quimera", element: "fogo", position: "Atacante", origin: "Grega", power_key: "tres_cabecas", power_name: "Três Cabeças", power_desc: "Pode atuar em qualquer posição sem perder rendimento.", line: { defender: 44, passar: 42, atacar: 68, tecnica: 55, forca: 64, pique: 58 } },
  { species: "Boitatá", element: "fogo", position: "Zagueiro", origin: "Brasileira", power_key: "cerca_fogo", power_name: "Cerca de Fogo", power_desc: "Aumenta a defesa do time inteiro quando está em campo.", line: { defender: 70, passar: 44, atacar: 25, tecnica: 48, forca: 60, pique: 55 } },
  { species: "Zhu Que", element: "fogo", position: "Meio-campo", origin: "Chinesa", power_key: "voo_sul", power_name: "Voo do Sul", power_desc: "Melhora o passe longo em contra-ataques.", line: { defender: 35, passar: 68, atacar: 58, tecnica: 70, forca: 32, pique: 66 } },
  { species: "Surtur", element: "fogo", position: "Zagueiro", origin: "Nórdica", power_key: "espada_flamejante", power_name: "Espada Flamejante", power_desc: "Vence disputas físicas com vantagem.", line: { defender: 72, passar: 30, atacar: 45, tecnica: 35, forca: 78, pique: 30 } },
  { species: "Mula-sem-Cabeça", element: "fogo", position: "Meio-campo", origin: "Brasileira", power_key: "galope", power_name: "Galope", power_desc: "Dispara e ignora a marcação uma vez por jogo.", line: { defender: 48, passar: 50, atacar: 52, tecnica: 45, forca: 62, pique: 74 } },
  { species: "Drakon", element: "fogo", position: "Zagueiro", origin: "Grega", power_key: "sopro_ardente", power_name: "Sopro Ardente", power_desc: "Intimida atacantes e reduz a chance de gol adversária.", line: { defender: 68, passar: 38, atacar: 48, tecnica: 42, forca: 72, pique: 40 } },
  { species: "Vouivre", element: "fogo", position: "Atacante", origin: "Francesa", power_key: "rubi_ardente", power_name: "Rubi Ardente", power_desc: "Primeira finalização do jogo tem bônus de precisão.", line: { defender: 28, passar: 52, atacar: 66, tecnica: 68, forca: 40, pique: 64 } },
  // 🔥 FOGO — GK
  { species: "Cérbero", element: "fogo", position: "Goleiro", origin: "Grega", power_key: "tres_guardas", power_name: "Três Guardas", power_desc: "Defende com vantagem em lances seguidos.", gk: { maos: 72, concentracao: 68, elasticidade: 45 } },
  { species: "Ládon", element: "fogo", position: "Goleiro", origin: "Grega", power_key: "vigilia_eterna", power_name: "Vigília Eterna", power_desc: "Não perde concentração no fim do jogo.", gk: { maos: 62, concentracao: 74, elasticidade: 50 } },

  // 🌊 ÁGUA — linha
  { species: "Kraken", element: "agua", position: "Zagueiro", origin: "Nórdica", power_key: "tentaculos", power_name: "Tentáculos", power_desc: "Desarma múltiplos adversários no mesmo lance.", line: { defender: 76, passar: 32, atacar: 30, tecnica: 38, forca: 74, pique: 28 } },
  { species: "Iara", element: "agua", position: "Meio-campo", origin: "Brasileira", power_key: "canto", power_name: "Canto", power_desc: "Atrai a marcação e abre espaço para os companheiros.", line: { defender: 34, passar: 72, atacar: 55, tecnica: 74, forca: 28, pique: 58 } },
  { species: "Hidra", element: "agua", position: "Zagueiro", origin: "Grega", power_key: "regeneracao", power_name: "Regeneração", power_desc: "Recupera energia sozinha durante a partida.", line: { defender: 74, passar: 40, atacar: 42, tecnica: 44, forca: 68, pique: 35 } },
  { species: "Leviatã", element: "agua", position: "Zagueiro", origin: "Hebraica", power_key: "abismo", power_name: "Abismo", power_desc: "Bloqueia finalizações de longa distância.", line: { defender: 78, passar: 30, atacar: 38, tecnica: 32, forca: 76, pique: 25 } },
  { species: "Sereia", element: "agua", position: "Meio-campo", origin: "Grega", power_key: "melodia", power_name: "Melodia", power_desc: "Melhora o passe de todo o time.", line: { defender: 30, passar: 70, atacar: 52, tecnica: 72, forca: 26, pique: 60 } },
  { species: "Kelpie", element: "agua", position: "Meio-campo", origin: "Escocesa", power_key: "correnteza", power_name: "Correnteza", power_desc: "Arranca em velocidade pela lateral.", line: { defender: 45, passar: 55, atacar: 58, tecnica: 62, forca: 55, pique: 72 } },
  { species: "Tritão", element: "agua", position: "Meio-campo", origin: "Grega", power_key: "buzio_guerra", power_name: "Búzio de Guerra", power_desc: "Eleva a moral do time após sofrer um gol.", line: { defender: 52, passar: 66, atacar: 55, tecnica: 60, forca: 58, pique: 54 } },
  { species: "Selkie", element: "agua", position: "Atacante", origin: "Nórdica/Celta", power_key: "pele_foca", power_name: "Pele de Foca", power_desc: "Escapa da marcação com facilidade.", line: { defender: 26, passar: 58, atacar: 68, tecnica: 70, forca: 30, pique: 68 } },
  { species: "Ningyo", element: "agua", position: "Atacante", origin: "Japonesa", power_key: "sorte_mar", power_name: "Sorte do Mar", power_desc: "Chance extra de gol em rebotes.", line: { defender: 24, passar: 50, atacar: 70, tecnica: 64, forca: 34, pique: 62 } },
  { species: "Cetus", element: "agua", position: "Zagueiro", origin: "Grega", power_key: "mare_alta", power_name: "Maré Alta", power_desc: "Empurra a linha adversária para trás.", line: { defender: 70, passar: 34, atacar: 44, tecnica: 36, forca: 74, pique: 32 } },
  // 🌊 ÁGUA — GK
  { species: "Caribde", element: "agua", position: "Goleiro", origin: "Grega", power_key: "redemoinho_gk", power_name: "Redemoinho", power_desc: "Engole a bola e não dá rebote.", gk: { maos: 74, concentracao: 62, elasticidade: 52 } },
  { species: "Bake-kujira", element: "agua", position: "Goleiro", origin: "Japonesa", power_key: "nevoa", power_name: "Névoa", power_desc: "Confunde o atacante em bolas cruzadas.", gk: { maos: 66, concentracao: 70, elasticidade: 55 } },

  // ⛰️ TERRA — linha
  { species: "Golem", element: "terra", position: "Zagueiro", origin: "Judaica", power_key: "muralha", power_name: "Muralha", power_desc: "Praticamente não é ultrapassado em disputas.", line: { defender: 80, passar: 25, atacar: 22, tecnica: 28, forca: 78, pique: 20 } },
  { species: "Minotauro", element: "terra", position: "Zagueiro", origin: "Grega", power_key: "investida", power_name: "Investida", power_desc: "Atropela a marcação em jogadas de força.", line: { defender: 72, passar: 35, atacar: 48, tecnica: 40, forca: 76, pique: 42 } },
  { species: "Curupira", element: "terra", position: "Meio-campo", origin: "Brasileira", power_key: "pes_virados", power_name: "Pés Virados", power_desc: "Confunde totalmente quem tenta marcá-lo.", line: { defender: 50, passar: 60, atacar: 52, tecnica: 74, forca: 44, pique: 76 } },
  { species: "Ciclope", element: "terra", position: "Zagueiro", origin: "Grega", power_key: "martelo", power_name: "Martelo", power_desc: "Cabeceio com força extra em bolas paradas.", line: { defender: 74, passar: 28, atacar: 45, tecnica: 30, forca: 80, pique: 30 } },
  { species: "Troll", element: "terra", position: "Zagueiro", origin: "Nórdica", power_key: "pele_pedra", power_name: "Pele de Pedra", power_desc: "Resiste a faltas sem se machucar.", line: { defender: 76, passar: 26, atacar: 38, tecnica: 30, forca: 74, pique: 26 } },
  { species: "Dvergr", element: "terra", position: "Meio-campo", origin: "Nórdica", power_key: "forja", power_name: "Forja", power_desc: "Melhora o rendimento dos companheiros a cada temporada.", line: { defender: 62, passar: 62, atacar: 44, tecnica: 58, forca: 60, pique: 40 } },
  { species: "Fomoriano", element: "terra", position: "Zagueiro", origin: "Irlandesa", power_key: "furia_antiga", power_name: "Fúria Antiga", power_desc: "Cresce quando o time está perdendo.", line: { defender: 70, passar: 32, atacar: 52, tecnica: 38, forca: 78, pique: 34 } },
  { species: "Gnomo", element: "terra", position: "Meio-campo", origin: "Europeia", power_key: "toca_secreta", power_name: "Toca Secreta", power_desc: "Enxerga passes que ninguém vê.", line: { defender: 55, passar: 68, atacar: 40, tecnica: 66, forca: 38, pique: 52 } },
  { species: "Saci", element: "terra", position: "Meio-campo", origin: "Brasileira", power_key: "redemoinho", power_name: "Redemoinho", power_desc: "Drible imprevisível, quase impossível de prever.", line: { defender: 42, passar: 64, atacar: 55, tecnica: 78, forca: 32, pique: 74 } },
  { species: "Tarasca", element: "terra", position: "Zagueiro", origin: "Francesa", power_key: "carapaca", power_name: "Carapaça", power_desc: "Reduz o dano de qualquer investida adversária.", line: { defender: 78, passar: 28, atacar: 40, tecnica: 32, forca: 76, pique: 24 } },
  // ⛰️ TERRA — GK
  { species: "Talos", element: "terra", position: "Goleiro", origin: "Grega", power_key: "bronze_vivo", power_name: "Bronze Vivo", power_desc: "Corpo fechado em finalizações rasteiras.", gk: { maos: 76, concentracao: 70, elasticidade: 38 } },
  { species: "Humbaba", element: "terra", position: "Goleiro", origin: "Mesopotâmica", power_key: "guardiao", power_name: "Guardião", power_desc: "Nunca falha em bolas dentro da pequena área.", gk: { maos: 70, concentracao: 74, elasticidade: 42 } },

  // 🌪️ AR — linha
  { species: "Grifo", element: "ar", position: "Atacante", origin: "Grega/Persa", power_key: "rasante", power_name: "Rasante", power_desc: "Ataque aéreo devastador.", line: { defender: 40, passar: 52, atacar: 72, tecnica: 60, forca: 58, pique: 78 } },
  { species: "Pégaso", element: "ar", position: "Meio-campo", origin: "Grega", power_key: "voo_livre", power_name: "Voo Livre", power_desc: "Cobre todo o campo sem se cansar.", line: { defender: 38, passar: 70, atacar: 58, tecnica: 72, forca: 42, pique: 80 } },
  { species: "Harpia", element: "ar", position: "Atacante", origin: "Grega", power_key: "rapina", power_name: "Rapina", power_desc: "Rouba a bola do zagueiro e sai em disparada.", line: { defender: 30, passar: 48, atacar: 70, tecnica: 62, forca: 40, pique: 76 } },
  { species: "Roc", element: "ar", position: "Zagueiro", origin: "Árabe", power_key: "sombra_gigante", power_name: "Sombra Gigante", power_desc: "Domina completamente o jogo aéreo.", line: { defender: 68, passar: 36, atacar: 52, tecnica: 40, forca: 74, pique: 58 } },
  { species: "Thunderbird", element: "ar", position: "Atacante", origin: "Norte-americana", power_key: "trovao", power_name: "Trovão", power_desc: "Finalização com potência absurda.", line: { defender: 34, passar: 50, atacar: 74, tecnica: 58, forca: 62, pique: 72 } },
  { species: "Sílfide", element: "ar", position: "Meio-campo", origin: "Alquímica", power_key: "brisa", power_name: "Brisa", power_desc: "Passes precisos que cortam a defesa.", line: { defender: 32, passar: 74, atacar: 48, tecnica: 76, forca: 24, pique: 70 } },
  { species: "Garuda", element: "ar", position: "Atacante", origin: "Indiana", power_key: "asas_douradas", power_name: "Asas Douradas", power_desc: "Desequilibra em jogadas rápidas.", line: { defender: 42, passar: 56, atacar: 70, tecnica: 64, forca: 60, pique: 74 } },
  { species: "Quetzalcóatl", element: "ar", position: "Meio-campo", origin: "Asteca", power_key: "serpente_emplumada", power_name: "Serpente Emplumada", power_desc: "Comanda o meio-campo inteiro.", line: { defender: 46, passar: 76, atacar: 60, tecnica: 74, forca: 44, pique: 66 } },
  { species: "Anzu", element: "ar", position: "Meio-campo", origin: "Mesopotâmica", power_key: "tempestade", power_name: "Tempestade", power_desc: "Melhora o time em partidas com chuva ou vento.", line: { defender: 50, passar: 62, atacar: 55, tecnica: 60, forca: 56, pique: 68 } },
  { species: "Simurgh", element: "ar", position: "Atacante", origin: "Persa", power_key: "renovacao", power_name: "Renovação", power_desc: "Recupera a energia dos companheiros no intervalo.", line: { defender: 36, passar: 60, atacar: 68, tecnica: 70, forca: 46, pique: 70 } },
  // 🌪️ AR — GK
  { species: "Argos", element: "ar", position: "Goleiro", origin: "Grega", power_key: "cem_olhos", power_name: "Cem Olhos", power_desc: "Enxerga o lance antes de acontecer.", gk: { maos: 62, concentracao: 80, elasticidade: 58 } },
  { species: "Alicanto", element: "ar", position: "Goleiro", origin: "Chilena", power_key: "voo_cintilante", power_name: "Voo Cintilante", power_desc: "Defesas espetaculares no ângulo.", gk: { maos: 58, concentracao: 66, elasticidade: 76 } },

  // ❄️ GELO — linha
  { species: "Jötun", element: "gelo", position: "Zagueiro", origin: "Nórdica", power_key: "gigante_gelo", power_name: "Gigante do Gelo", power_desc: "Congela o avanço adversário.", line: { defender: 78, passar: 28, atacar: 42, tecnica: 32, forca: 78, pique: 26 } },
  { species: "Wendigo", element: "gelo", position: "Atacante", origin: "Algonquina", power_key: "fome_insaciavel", power_name: "Fome Insaciável", power_desc: "Quanto mais gols marca, mais forte fica.", line: { defender: 38, passar: 40, atacar: 72, tecnica: 52, forca: 70, pique: 66 } },
  { species: "Yeti", element: "gelo", position: "Zagueiro", origin: "Himalaia", power_key: "avalanche", power_name: "Avalanche", power_desc: "Derruba qualquer atacante na dividida.", line: { defender: 74, passar: 30, atacar: 46, tecnica: 34, forca: 76, pique: 38 } },
  { species: "Draugr", element: "gelo", position: "Zagueiro", origin: "Nórdica", power_key: "morto_vivo", power_name: "Morto-vivo", power_desc: "Não se cansa nunca durante a partida.", line: { defender: 72, passar: 34, atacar: 44, tecnica: 40, forca: 68, pique: 32 } },
  { species: "Ymir", element: "gelo", position: "Zagueiro", origin: "Nórdica", power_key: "ancestral", power_name: "Ancestral", power_desc: "O zagueiro mais imponente do bestiário.", line: { defender: 80, passar: 26, atacar: 38, tecnica: 28, forca: 80, pique: 22 } },
  { species: "Amarok", element: "gelo", position: "Meio-campo", origin: "Inuit", power_key: "lobo_solitario", power_name: "Lobo Solitário", power_desc: "Melhora muito quando o time está com um a menos.", line: { defender: 58, passar: 52, atacar: 58, tecnica: 55, forca: 66, pique: 72 } },
  { species: "Qiqirn", element: "gelo", position: "Meio-campo", origin: "Inuit", power_key: "passo_silencioso", power_name: "Passo Silencioso", power_desc: "Some da marcação e reaparece livre.", line: { defender: 52, passar: 60, atacar: 50, tecnica: 62, forca: 48, pique: 74 } },
  { species: "Tizheruk", element: "gelo", position: "Meio-campo", origin: "Inuit", power_key: "bote_gelado", power_name: "Bote Gelado", power_desc: "Intercepta passes com facilidade.", line: { defender: 56, passar: 64, atacar: 52, tecnica: 58, forca: 58, pique: 62 } },
  { species: "Jack Frost", element: "gelo", position: "Meio-campo", origin: "Inglesa", power_key: "geada", power_name: "Geada", power_desc: "Deixa o campo escorregadio para o adversário.", line: { defender: 40, passar: 68, atacar: 55, tecnica: 74, forca: 30, pique: 68 } },
  { species: "Skoll", element: "gelo", position: "Atacante", origin: "Nórdica", power_key: "cacada", power_name: "Caçada", power_desc: "Persegue e alcança qualquer defensor.", line: { defender: 34, passar: 46, atacar: 70, tecnica: 56, forca: 64, pique: 76 } },
  // ❄️ GELO — GK
  { species: "Fafnir", element: "gelo", position: "Goleiro", origin: "Nórdica", power_key: "guardiao_tesouro", power_name: "Guardião do Tesouro", power_desc: "Não deixa passar nada rasteiro.", gk: { maos: 78, concentracao: 66, elasticidade: 44 } },
  { species: "Nix", element: "gelo", position: "Goleiro", origin: "Germânica", power_key: "reflexo_gelido", power_name: "Reflexo Gélido", power_desc: "Reação instantânea em chutes de perto.", gk: { maos: 64, concentracao: 62, elasticidade: 74 } },
];

// -------- Epítetos --------

export const EPITHETS: Record<Element, string[]> = {
  fogo: ["Escarlate","Rubro","das Brasas","do Crepúsculo","Incandescente","Flamejante","do Vulcão","das Cinzas","Ardente","da Fornalha","Carmesim","Solar","do Estio","de Enxofre","da Pira","Fulgente","do Braseiro","Coruscante","da Lava","do Ocaso"],
  agua: ["Abissal","das Profundezas","da Maré","Turquesa","das Correntes","do Recife","Salino","Cristalino","do Estuário","das Ondas","do Golfo","da Enseada","Nauta","da Foz","das Marés Vivas","do Arrecife","Pluvial","da Nascente","Sereno","do Dilúvio"],
  terra: ["de Basalto","Rúnico","Ancestral","de Granito","das Cavernas","Musgoso","da Mata Fechada","de Ferro","das Raízes","Pétreo","do Vale","Ocre","das Montanhas","Milenar","de Argila","do Barranco","Telúrico","da Gruta","de Quartzo","do Sertão"],
  ar: ["Célere","das Alturas","do Vendaval","Prateado","das Nuvens","Errante","do Zênite","Sussurrante","da Ventania","Etéreo","do Horizonte","Alado","da Brisa","do Cume","Nefelino","do Sopro","Volante","da Rajada","Aéreo","do Firmamento"],
  gelo: ["Glacial","do Norte","das Geleiras","Invernal","Congelado","da Tundra","Boreal","de Cristal","Silencioso","das Neves","Gélido","do Solstício","Alvo","da Nevasca","do Permafrost","Hibernal","de Quartzo Azul","do Degelo","Frígido","da Aurora"],
};

export const ELITE_EPITHETS = ["o Lendário", "o Imortal", "o Invicto", "o Ancião"];

// -------- Helpers --------

export function pickEpithet(element: Element, rng: () => number): string {
  const arr = EPITHETS[element];
  return arr[Math.floor(rng() * arr.length)];
}

export function pickEliteEpithet(rng: () => number): string {
  return ELITE_EPITHETS[Math.floor(rng() * ELITE_EPITHETS.length)];
}

// Pesos por posição (§1.4)
const LINE_WEIGHTS: Record<"DEF"|"MEI"|"ATA", LineAttrs> = {
  DEF: { defender: 0.40, passar: 0.10, atacar: 0.05, tecnica: 0.10, forca: 0.25, pique: 0.10 },
  MEI: { defender: 0.15, passar: 0.30, atacar: 0.15, tecnica: 0.25, forca: 0.05, pique: 0.10 },
  ATA: { defender: 0.05, passar: 0.10, atacar: 0.40, tecnica: 0.20, forca: 0.10, pique: 0.15 },
};

export function positionRole(pos: Position): "GOL"|"DEF"|"MEI"|"ATA" {
  if (pos === "Goleiro") return "GOL";
  if (pos === "Zagueiro") return "DEF";
  if (pos === "Meio-campo") return "MEI";
  return "ATA";
}

export function computeLineOverall(a: LineAttrs, pos: Position): number {
  const role = positionRole(pos) as "DEF"|"MEI"|"ATA";
  const w = LINE_WEIGHTS[role] ?? LINE_WEIGHTS.MEI;
  return Math.round(
    a.defender*w.defender + a.passar*w.passar + a.atacar*w.atacar +
    a.tecnica*w.tecnica + a.forca*w.forca + a.pique*w.pique,
  );
}

export function computeGkOverall(g: GkAttrs): number {
  return Math.round(g.maos*0.40 + g.concentracao*0.30 + g.elasticidade*0.30);
}

export function overallToStars(overall: number): number {
  // Conversão da §1.3 (retorna meia-estrelas 0..10)
  return Math.max(0, Math.min(10, Math.round(overall / 10)));
}

function clamp100(n: number) { return Math.max(0, Math.min(100, n)); }

export interface RolledCreature {
  species: string;
  epithet: string;
  name: string; // species + " " + epithet
  element: Element;
  position: Position;
  is_goalkeeper: boolean;
  power_key: string;
  power_name: string;
  power_desc: string;
  // atributos (só um dos blocos é usado; o outro fica em 20)
  attr_defender: number;
  attr_passar: number;
  attr_atacar: number;
  attr_tecnica: number;
  attr_forca: number;
  attr_pique: number;
  attr_maos: number;
  attr_concentracao: number;
  attr_elasticidade: number;
  overall: number;
  market_value: number;
}

/**
 * Gera uma criatura a partir da espécie base, aplicando variação ±12.
 * Se `variation` = 0, retorna o perfil-base "puro" (útil para preview de time inicial).
 */
export function rollCreature(
  species: SpeciesBase,
  rng: () => number,
  opts: { variation?: number } = {},
): RolledCreature {
  const variation = opts.variation ?? 12;
  const jitter = () => Math.round((rng() * 2 - 1) * variation);
  const epithet = pickEpithet(species.element, rng);

  let attrs = {
    attr_defender: 20, attr_passar: 20, attr_atacar: 20, attr_tecnica: 20,
    attr_forca: 20, attr_pique: 20,
    attr_maos: 20, attr_concentracao: 20, attr_elasticidade: 20,
  };

  let overall = 40;
  if (species.gk) {
    const g = species.gk;
    const rolled = {
      maos: clamp100(g.maos + jitter()),
      concentracao: clamp100(g.concentracao + jitter()),
      elasticidade: clamp100(g.elasticidade + jitter()),
    };
    attrs.attr_maos = rolled.maos;
    attrs.attr_concentracao = rolled.concentracao;
    attrs.attr_elasticidade = rolled.elasticidade;
    overall = computeGkOverall(rolled);
  } else if (species.line) {
    const l = species.line;
    const rolled: LineAttrs = {
      defender: clamp100(l.defender + jitter()),
      passar:   clamp100(l.passar   + jitter()),
      atacar:   clamp100(l.atacar   + jitter()),
      tecnica:  clamp100(l.tecnica  + jitter()),
      forca:    clamp100(l.forca    + jitter()),
      pique:    clamp100(l.pique    + jitter()),
    };
    attrs.attr_defender = rolled.defender;
    attrs.attr_passar   = rolled.passar;
    attrs.attr_atacar   = rolled.atacar;
    attrs.attr_tecnica  = rolled.tecnica;
    attrs.attr_forca    = rolled.forca;
    attrs.attr_pique    = rolled.pique;
    overall = computeLineOverall(rolled, species.position);
  }

  const isGk = species.position === "Goleiro";
  return {
    species: species.species,
    epithet,
    name: `${species.species} ${epithet}`,
    element: species.element,
    position: species.position,
    is_goalkeeper: isGk,
    power_key: species.power_key,
    power_name: species.power_name,
    power_desc: species.power_desc,
    ...attrs,
    overall,
    market_value: computeMarketValue(overall, 18),
  };
}

/**
 * Valor de mercado com decaimento a partir dos 27 anos (§10.5).
 * Base = overall² * 22 (curva mais próxima da tabela §5 do balanceamento).
 */
export function computeMarketValue(overall: number, age: number): number {
  const base = Math.max(1, overall) * Math.max(1, overall) * 22;
  let factor = 1;
  if (age >= 27) {
    // 1.0 aos 27; 0.5 aos 33; linear
    factor = Math.max(0.4, 1 - (age - 27) * 0.08);
  }
  return Math.round((base * factor) / 1000) * 1000;
}

// Buscas
export function findSpecies(name: string): SpeciesBase | null {
  return BESTIARY.find((s) => s.species === name) ?? null;
}

export function findByPower(key: string): SpeciesBase | null {
  return BESTIARY.find((s) => s.power_key === key) ?? null;
}

export function bestiaryByElement(el: Element): SpeciesBase[] {
  return BESTIARY.filter((s) => s.element === el);
}

export function bestiaryByPosition(pos: Position): SpeciesBase[] {
  return BESTIARY.filter((s) => s.position === pos);
}

export function speciesLineOverall(s: SpeciesBase): number {
  if (s.gk) return computeGkOverall(s.gk);
  return computeLineOverall(s.line!, s.position);
}
