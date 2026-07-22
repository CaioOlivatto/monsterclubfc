// Bancos de frases da narração cômica.
// Variáveis suportadas: {atacante} {defensor} {goleiro} {time}
// Registros: energia | deadpan | observacao | cultura
// Ver .lovable/plan.md — sistema de narração.

export type NarrRegister = "energia" | "deadpan" | "observacao" | "cultura";
export type NarrElement = "fogo" | "agua" | "terra" | "ar" | "gelo";

export interface Phrase {
  text: string;
  register: NarrRegister;
}

// ---- ABERTURA ----
export const OPENING_NEUTRAL: Phrase[] = [
  { text: "{atacante} pega a esfera e olha pro campo... e agora, meu amigo?", register: "energia" },
  { text: "Opa, opa, opa! {atacante} tá com a bola!", register: "energia" },
  { text: "{atacante} rouba a bola! ROUBOU mesmo, gente, não foi impressão!", register: "energia" },
  { text: "Cuidado que o {atacante} vem vindo aí...", register: "energia" },
  { text: "Lançamento longo! E quem tá lá? {atacante}, claro que é o {atacante}!", register: "energia" },
  { text: "Bola limpa pro {atacante}, e a torcida já levantou!", register: "energia" },
  { text: "Ó o {atacante} de novo! Esse aí não descansa!", register: "energia" },
  { text: "Tomou a bola no meio! É {atacante}, gente!", register: "energia" },
  { text: "Foi mal a defesa! A bola caiu no pé do {atacante}!", register: "energia" },
  { text: "{atacante} arranca pela lateral, e não tem ninguém perto dele!", register: "energia" },

  { text: "{atacante} recebe lá atrás. Com muita calma. Calma até demais.", register: "deadpan" },
  { text: "A bola sobrou pro {atacante}. Vamos ver no que dá.", register: "deadpan" },
  { text: "{atacante} está com a bola. Isso costuma ser um problema pra alguém.", register: "deadpan" },
  { text: "Saiu do pé de {atacante}. Ele parece saber o que quer. Parece.", register: "deadpan" },
  { text: "{atacante} domina. Ajeita. Pensa. O jogo espera.", register: "deadpan" },

  { text: "{atacante} olha pro gol. O gol olha de volta pro {atacante}...", register: "observacao" },
  { text: "Gente, é o {atacante} correndo atrás de uma bola. Pensa nisso um segundo.", register: "observacao" },
  { text: "E lá vem o {atacante}, que tecnicamente é uma criatura milenar jogando bola...", register: "observacao" },
  { text: "{atacante} com a esfera. A mitologia não previu isso, mas aqui estamos.", register: "observacao" },

  { text: "{atacante} pediu a bola. Pediu com autoridade, então deram.", register: "cultura" },
  { text: "E a bola chega no pé de quem sabe o que fazer com ela...", register: "cultura" },
  { text: "{atacante} vem de trás, chegando na hora certa, como sempre.", register: "cultura" },
  { text: "Bola pro {atacante}, o cara que a torcida esperava ver hoje!", register: "cultura" },
];

export const OPENING_ELEMENT: Record<NarrElement, Phrase[]> = {
  fogo: [
    { text: "{atacante} pega a bola e já vai soltando faísca no caminho...", register: "energia" },
    { text: "Tá esquentando o jogo! {atacante} com a esfera...", register: "energia" },
    { text: "{atacante} avança deixando um rastro de brasa no gramado...", register: "observacao" },
  ],
  agua: [
    { text: "{atacante} desliza com a bola como se o campo fosse rio...", register: "observacao" },
    { text: "Correnteza! {atacante} arranca pelo meio...", register: "energia" },
    { text: "{atacante} pega a esfera e vem descendo em ondas...", register: "energia" },
  ],
  terra: [
    { text: "{atacante} pega a bola e vem que nem trator, gente...", register: "cultura" },
    { text: "O chão treme! {atacante} avançando...", register: "energia" },
    { text: "{atacante} vem pesado, ninguém quer entrar na frente...", register: "cultura" },
  ],
  ar: [
    { text: "{atacante} pega a bola e some — literalmente some de velocidade...", register: "observacao" },
    { text: "Passou uma ventania! Era o {atacante}...", register: "energia" },
    { text: "{atacante} tá voando, e olha que nem é força de expressão...", register: "observacao" },
  ],
  gelo: [
    { text: "{atacante} desliza com a bola, friozinho na espinha...", register: "observacao" },
    { text: "{atacante} pega a esfera com aquela calma congelante...", register: "deadpan" },
    { text: "Gelou o estádio! {atacante} avançando...", register: "energia" },
  ],
};

// ---- DESENVOLVIMENTO ----
export const DEVELOPMENT: Phrase[] = [
  { text: "dribla um... dribla dois... esse aí não vai parar nunca!", register: "energia" },
  { text: "tá indo, tá indo, TÁ INDO...", register: "energia" },
  { text: "cadê a marcação? CADÊ A MARCAÇÃO?", register: "energia" },
  { text: "tá livre! TÁ LIVRE! Ninguém foi nele!", register: "energia" },
  { text: "deu um chapéu no {defensor}! Chapéu, meu amigo, CHAPÉU!", register: "energia" },
  { text: "ele vai... ele vai... ele continua indo...", register: "energia" },
  { text: "a defesa toda foi atrás dele, e ele fugiu de todo mundo!", register: "energia" },
  { text: "tocou de calcanhar! CALCANHAR! Pra que isso agora?", register: "energia" },
  { text: "elástico! Fez elástico e saiu andando, tranquilo!", register: "energia" },
  { text: "tabelinha! Tabelinha na entrada da área!", register: "energia" },

  { text: "ele tenta o drible. Não vai dar certo, mas ele tenta.", register: "deadpan" },
  { text: "o {defensor} vem marcar. Vem devagar. Vem com calma. Vem tarde.", register: "deadpan" },
  { text: "tentou driblar três. Conseguiu driblar zero.", register: "deadpan" },
  { text: "tem espaço, tem tempo, tem tudo. Vamos ver o que ele faz com isso.", register: "deadpan" },
  { text: "o {defensor} tá correndo atrás. Fisicamente, não emocionalmente.", register: "deadpan" },
  { text: "ele levanta a cabeça, analisa o campo, pensa bastante... talvez pense demais.", register: "deadpan" },
  { text: "o zagueiro chega. Chega bem depois da bola, mas chega.", register: "deadpan" },
  { text: "existe um plano aqui. Eu ainda não descobri qual.", register: "deadpan" },
  { text: "ele para. Olha. Respira. O jogo inteiro esperando ele decidir.", register: "deadpan" },
  { text: "o {goleiro} sai do gol. Sai mesmo. Será que devia?", register: "deadpan" },

  { text: "o {defensor} tem o dobro do tamanho dele e mesmo assim não pegou...", register: "observacao" },
  { text: "ninguém acha estranho isso aqui? Não? Só eu?", register: "observacao" },
  { text: "eu deveria estar acostumado com isso a essa altura. Não estou.", register: "observacao" },
  { text: "tem coisas que a mitologia não explica, e essa jogada é uma delas...", register: "observacao" },
  { text: "alguém precisa avisar o {defensor} que a bola já passou...", register: "observacao" },
  { text: "o {defensor} criou raiz no gramado, não saiu do lugar...", register: "observacao" },

  { text: "aí é o cara que resolve sozinho. Vamos ver se resolve hoje.", register: "cultura" },
  { text: "esse é aquele jogador que a torcida ama e o técnico sofre...", register: "cultura" },
  { text: "tá jogando com o coração. Falta jogar com o pé também.", register: "cultura" },
  { text: "o time inteiro subiu. Se perder a bola aqui, é contra-ataque na certa...", register: "cultura" },
  { text: "tabelinha de quem treina junto, gente.", register: "cultura" },
  { text: "jogada ensaiada! Ensaiada de verdade, não é força de expressão!", register: "cultura" },
  { text: "segurou a bola, esperou o apoio... jogador experiente faz isso.", register: "cultura" },
];

// ---- DESFECHO ----
export const OUTCOME_GOAL: Phrase[] = [
  { text: "GOOOOOL! {atacante} estufa a rede e o estádio veio abaixo!", register: "energia" },
  { text: "É GOOOOL! E o {goleiro} ficou só assistindo, igual a gente!", register: "energia" },
  { text: "ENTROU! Entrou e ninguém entendeu de onde veio!", register: "energia" },
  { text: "BALANÇOU A REDE! {atacante} não perdoou!", register: "energia" },
  { text: "GOL DO {time}! E olha a festa da torcida!", register: "energia" },
  { text: "É GOOOOL! {atacante} tá comemorando igual criança, e com razão!", register: "energia" },
  { text: "GOOOOL! Colocou onde a coruja dorme!", register: "energia" },
  { text: "GOOOOOL! E olha que ele tinha três marcadores em cima!", register: "energia" },

  { text: "GOL. Simples assim. Nem preciso gritar.", register: "deadpan" },
  { text: "Entrou. Ele sabia que ia entrar. Todo mundo sabia.", register: "deadpan" },
  { text: "Gol. E a defesa vai ter uma conversa no vestiário.", register: "deadpan" },
  { text: "Entrou. O goleiro nem tentou. Sábio, ele.", register: "deadpan" },
  { text: "É gol. Era pra ser gol. Foi gol.", register: "deadpan" },

  { text: "GOOOOL! E eu aqui achando normal uma criatura mitológica comemorar gol!", register: "observacao" },
  { text: "ENTROU! Gente, quem inventou esse esporte não previu isso aqui!", register: "observacao" },
  { text: "GOOOOL! Guarda esse nome: {atacante}. Anota aí.", register: "observacao" },
  { text: "É GOL! E o {goleiro} tem três metros — não adiantou nada!", register: "observacao" },

  { text: "GOOOOL! É o tipo de gol que decide campeonato!", register: "cultura" },
  { text: "Entrou! O artilheiro fazendo o que artilheiro faz!", register: "cultura" },
  { text: "GOL! Aquele gol de oportunista, de quem estava no lugar certo!", register: "cultura" },
  { text: "GOOOOL! E olha que ele tava sendo criticado essa semana!", register: "cultura" },
];

export const OUTCOME_GOLACO: Phrase[] = [
  { text: "GOLAÇO! GOLAÇO! Guarda esse lance que vai passar em tudo quanto é lugar!", register: "energia" },
  { text: "QUE ISSO?! QUE ISSO, {atacante}?! Isso não é normal!", register: "energia" },
  { text: "GOOOOL! De fora da área! DE FORA DA ÁREA, gente!", register: "energia" },
  { text: "GOLAÇO ABSURDO! Eu não sei nem o que falar!", register: "energia" },
  { text: "ENTROU NO ÂNGULO! No ângulo, meu amigo! Não tem defesa pra isso!", register: "energia" },
];

export const OUTCOME_SAVE: Phrase[] = [
  { text: "PEGOU! O {goleiro} pegou! De onde saiu essa mão?!", register: "energia" },
  { text: "DEFENDEU! E salvou o time inteiro nessa!", register: "energia" },
  { text: "{goleiro} voou! Voou e espalmou!", register: "energia" },
  { text: "QUE DEFESA! Vai repetir? Repete essa, por favor!", register: "energia" },
  { text: "Pegou com o pé! COM O PÉ, gente! Nem ele acreditou!", register: "energia" },
  { text: "{goleiro} espalmou pra escanteio. Sofrimento adiado!", register: "energia" },
  { text: "Defendeu. Fez o trabalho dele. É pra isso que serve.", register: "deadpan" },
  { text: "{goleiro} fechou o gol. Não passa nem vento ali.", register: "deadpan" },
  { text: "Defendeu! Goleiro assim vale um time inteiro!", register: "cultura" },
  { text: "Pegou! Com uma mão! Com UMA mão, meu amigo!", register: "observacao" },
];

export const OUTCOME_MISS: Phrase[] = [
  { text: "PRA FORA! E o {atacante} não acredita no que fez!", register: "energia" },
  { text: "Chutou pro espaço! Literalmente pro espaço!", register: "energia" },
  { text: "NA TRAVE! NA TRAVE! Ai, ai, ai...", register: "energia" },
  { text: "A bola tá indo pro estacionamento, gente...", register: "observacao" },
  { text: "Errou o gol vazio! O GOL VAZIO! Como assim?!", register: "energia" },
  { text: "Mandou por cima. Bem por cima. Tipo, MUITO por cima.", register: "deadpan" },
  { text: "Errou. Errou feio. Vamos fingir que não vimos.", register: "deadpan" },
  { text: "Pra fora. Ele vai lembrar dessa hoje à noite.", register: "deadpan" },
  { text: "Foi pra fora. O silêncio no estádio diz tudo.", register: "deadpan" },
  { text: "Perdeu! E vai ouvir da torcida a semana inteira...", register: "cultura" },
  { text: "Chutou em cima do goleiro. Sem querer ele defendeu!", register: "observacao" },
];

export const OUTCOME_BLOCK: Phrase[] = [
  { text: "{defensor} apareceu do nada e tirou!", register: "energia" },
  { text: "CORTOU! O {defensor} salvou em cima da linha!", register: "energia" },
  { text: "{defensor} colocou o corpo e travou a finalização!", register: "energia" },
  { text: "Bloqueou! {defensor} se jogou na frente da bola!", register: "energia" },
  { text: "{defensor} tirou. Chegou tarde a vida inteira, mas chegou nessa.", register: "deadpan" },
];

// ---- CALLBACKS ----
export interface CallbackPhrase {
  text: string;
  kind: "actor_missed" | "actor_scored" | "actor_scored_again" | "defender_dribbled_again";
}
export const CALLBACKS: CallbackPhrase[] = [
  { text: "Lembra que ele perdeu antes? Ele lembra também.", kind: "actor_missed" },
  { text: "É o {atacante} de novo — depois daquela que ele errou, tá querendo se redimir...", kind: "actor_missed" },
  { text: "De novo o {atacante}! Já é o segundo dele!", kind: "actor_scored" },
  { text: "Mais UM do {atacante}! Vira jogo particular isso aqui!", kind: "actor_scored_again" },
  { text: "É a segunda vez que o {atacante} passa pelo {defensor}. Segunda!", kind: "defender_dribbled_again" },
];

// ---- CONTEXTUAIS ----
export const REACTIONS = {
  goleada: [
    "Tá virando treino isso aqui, gente...",
    "Alguém segura esse time!",
    "A essa altura já é crueldade.",
  ],
  empate_fim: [
    "Cinco minutos pro fim e tá tudo igual! Segura o coração!",
    "Tá nervoso isso aqui, hein!",
  ],
  perdendo: [
    "Precisa acordar, time! Precisa acordar!",
    "Ainda dá tempo! Ainda dá tempo!",
    "Tá difícil. Não vou mentir pra vocês.",
  ],
  elemental_gol: [
    "E a vantagem elemental fez toda a diferença aí!",
    "Elemento certo na hora certa, gente!",
  ],
};
