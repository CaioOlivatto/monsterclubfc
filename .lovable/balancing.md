# Tabela de Balanceamento — MVP v1 (liga 14/26 + ciclo de vida + mundo 5 divisões)

Complemento numérico do GDD e do Bestiário. Valores já aplicados no código, salvo pendências no fim.

Decisões já fechadas nesta versão:
- Empate dá 50% de XP.
- XP enche a barra → força/overall sobe. Afinidades sobem via treino nos CTs.
- Salários por temporada.
- Curva de XP difícil, ~1 temporada por meia-estrela no começo.
- Mercado renova por temporada (24 criaturas).
- Liga 14 times, 26 rodadas (turno/returno).
- Atributos escala 0–100 (linha: Defender/Passar/Atacar/Técnica/Força/Pique; goleiro: Mãos/Concentração/Elasticidade).
- Bestiário mitológico de 60 espécies.
- Contratação limitada por calibre + teto de folha.
- Idade 18→33 (5 temporadas), aposentadoria com venda (−25%) ou renascimento perdendo estrelas.
- 1ª Divisão nasce com craques (§7.1).

## 1. XP e Evolução

### 1.1 XP por partida
- Vitória (titular jogado): **100 XP**
- Empate: **50 XP**
- Derrota: **0 XP**
- Reserva que entrou: **metade do valor** (arredondado)
- Reserva que não entrou: **25 XP** só em vitória

### 1.2 Referência de temporada (14 times, 26 rodadas)
- Time mediano (13V 5E 8D): **1.550 XP**
- Time forte (18V 4E 4D): **2.000 XP**

### 1.3 Curva de custo por meia-estrela
`custo(n) = round(800 × 1,25^(n−1))` — recalibrada para carreiras de 5 temporadas.

| Degrau | Estrela | Custo (XP) | Acum. | ≈ Temporadas |
|---|---|---|---|---|
| 1 | 0,5★ | 800 | 800 | 0,5 |
| 2 | 1,0★ | 1.000 | 1.800 | 0,6 |
| 3 | 1,5★ | 1.250 | 3.050 | 0,8 |
| 4 | 2,0★ | 1.560 | 4.610 | 1,0 |
| 5 | 2,5★ | 1.950 | 6.560 | 1,3 |
| 6 | 3,0★ | 2.440 | 9.000 | 1,6 |
| 7 | 3,5★ | 3.050 | 12.050 | 2,0 |
| 8 | 4,0★ | 3.810 | 15.860 | 2,5 |
| 9 | 4,5★ | 4.770 | 20.630 | 3,1 |
| 10 | 5,0★ | 5.960 | 26.590 | 3,8 |

Uma carreira inteira (~7.750 XP) sobe ~2 estrelas. 5★ exige nascimento excepcional, mercado ou auge de uma carreira privilegiada.

### 1.4 Aceleradores
- **CT de Treinamento**: `XP_efetivo = XP_base × (1 + 0,05 × nível_CT + bônus_burst)`
- **Burst de XP** (Gemas): +5%, +10% ou +15% por um período.

## 2. Economia — Por Partida

Modelo vigente ("Economia por Partida"): salários, receitas fixas e manutenção são processados **a cada rodada**, não por temporada. Valores refletidos em `src/lib/economy.ts` (`MATCH_REVENUE`, `MAINTENANCE_PER_MATCH`, `seasonSalary`/`matchSalary`).

### 2.1 Premiação por rodada (aplicada em `league.functions.ts`)
| Divisão | V | E | D |
|---|---|---|---|
| Bronze | $15.000 | $6.000 | $2.000 |
| Prata | $28.000 | $11.000 | $4.000 |
| Ouro | $50.000 | $20.000 | $7.000 |
| Diamante | $90.000 | $36.000 | $13.000 |
| Lendária | $160.000 | $64.000 | $24.000 |

### 2.2 Receita fixa por partida (`MATCH_REVENUE`)
Recebida em **toda** partida oficial (casa ou fora). `Sponsor` unifica Master + Camisa da spec original — o jogador vê o extrato agregado.

| Divisão | TV | Sponsor | Merch | **Total/partida** |
|---|---|---|---|---|
| Bronze | $8.000 | $9.000 | $4.000 | **$21.000** |
| Prata | $20.000 | $21.000 | $9.000 | **$50.000** |
| Ouro | $42.000 | $43.000 | $18.000 | **$103.000** |
| Diamante | $85.000 | $88.000 | $36.000 | **$209.000** |
| Lendária | $160.000 | $168.000 | $70.000 | **$398.000** |

### 2.3 Bilheteria (só em casa) — atrelada à moral do elenco
- `Bilheteria = attendance × $25` onde `attendance = capacidade × ocupação`.
- **Ocupação (%)** = `clamp(10 + moral_média_do_elenco × 0,9, 10, 100)`, com ±5% de ruído por partida.
- Consome a MESMA moral já calculada pelo sistema existente (0–100); piso 10% (estádio nunca fica literalmente vazio).
- Âncora prática: moral 70 → ~73% (próxima do 75% em que a economia foi calibrada). Moral 40 → 46%; moral 100 → 100%.
- Rótulos de UI: `<20 Vazio 🪑 · 20–39 Poucas 🙁 · 40–59 Metade 😐 · 60–84 Muitas 🙂 · ≥85 Lotado 🔥`.
- Fora de casa continua sem bilheteria (regra intocada).
- Substituiu a ocupação por posição na tabela (`0.70 + 0.03 × pos_invertida`, média ~87%). A nova fórmula tende a produzir ocupação **igual ou menor** para times bem administrados (moral 70–90 → 73–91%), então não reabre o problema de excesso de lucro corrigido antes.
- 13 jogos em casa por temporada.

### 2.3.1 Bônus de vitória fora (dinâmico)
Substituiu o `AWAY_WIN_BONUS` fixo de $25.000. Agora calculado no momento da partida em `computeAwayWinBonus` (`src/lib/economy.ts`):

```
bonus = max(0, despesas_da_partida − receita_fixa_sem_bilheteria − prêmio_vitória) + MARGEM_MINIMA
MARGEM_MINIMA = $8.000
```

O bônus sobe automaticamente conforme manutenção e salários crescem com as construções do jogador, garantindo que uma vitória fora sempre feche em torno de +$8.000 em vez de virar prejuízo. Aplicado consistentemente em Campeonato, Copa e Liga/Copa Mundial.

Validação (Prata, prêmio vitória $28k, receita fixa fora $50k):
- Despesas originais $94.314 → bônus $32.314 → net **+$8.000** (antes: $25k fixo dava +$8.686).
- Despesas pós-upgrade $103.114 → bônus $41.114 → net **+$8.000** (antes: $25k fixo dava −$114).
- Despesas ≤ $78k (receita fixa + prêmio) → bônus = margem mínima $8.000 (nunca abaixo).



### 2.4 Bônus de fim de temporada — Campeonato Nacional (× prêmio de vitória da divisão)
| Posição | Multiplicador |
|---|---|
| 1º | ×10 (+50💎 campeão) |
| 2º | ×6 |
| 3º–4º | ×3 |
| 5º–6º | ×1,5 |
| 7º–8º | ×0,5 |
| 9º–14º | 0 |

### 2.4.1 Prêmio de fase — Copa Nacional (`CUP_PHASE_BONUS`)
Valores fixos (spec `Sistema-Tres-Competicoes.md`), independentes de divisão — a Copa é cross-divisão.
| Fase alcançada | Prêmio |
|---|---|
| Campeão | $5.000.000 |
| Vice-campeão | $2.000.000 |
| Semifinalista | $900.000 |
| Quartas de final | $300.000 |

### 2.4.2 Prêmio de fase — Liga Mundial (`WORLD_LEAGUE_PHASE_BONUS`)
| Fase alcançada | Prêmio |
|---|---|
| Campeão | $3.000.000 |
| Vice-campeão | $1.500.000 |
| Semifinalista | $700.000 |
| Fase de grupos | $200.000 |

### 2.4.3 Hierarquia de prestígio (prêmio de fase do campeão)
Copa Nacional ($5M) > Liga Mundial ($3M) > Campeonato Lendária ($1,6M = 160k×10) > demais divisões do Campeonato. Coerente com o desenho: a Copa é o troféu mais cobiçado do jogo.

Sanity — total arrecadado pelo campeão vencendo tudo (piso, sem bilheteria e sem bônus de vitória fora), somando receita fixa + prêmio por partida + prêmio de fase:
| Competição | Partidas | Match income | Phase bonus | **Total** |
|---|---|---|---|---|
| Copa Nacional (Lendária) | 3 | $1,79M | $5,00M | **$6,79M** |
| Liga Mundial (Lendária) | 8 | $4,12M | $3,00M | **$7,12M** |
| Campeonato Lendária | 26 | $14,51M | $1,60M | $16,11M |

Observação: o Campeonato ainda supera em volume por ter 26 rodadas (base salarial e de manutenção do time durante o ano inteiro). Copa e Liga Mundial são os prêmios com maior *prestígio* (phase bonus e retorno por partida), enquanto o Campeonato é a espinha dorsal financeira da temporada.

### 2.4.4 Nota de processo — valores implementados vs documento
Antes desta correção, `CUP_PHASE_BONUS` estava com valores 3–4% da spec ($200k/$80k/$30k/$10k vs $5M/$2M/$900k/$300k) e a Liga Mundial não pagava phase bonus algum. A causa foi uma constante criada na implementação inicial sem consulta ao documento `Sistema-Tres-Competicoes.md`. Esse tipo de divergência silenciosa (código diverge da spec sem que ninguém perceba) apareceu mais de uma vez nesta sessão — economia de manutenção 21× menor, `CHANCE_RATE` do motor, receitas de patrocínio. **Padrão a seguir**: antes de fechar qualquer implementação de constante econômica, comparar o valor no código com o valor no documento-fonte e registrar no balancing quando divergir por decisão intencional.



### 2.5 Salários (por partida, `matchSalary = seasonSalary / 26`)
| Overall (~★) | Salário/temp | Salário/partida |
|---|---|---|
| <30 (0–1★) | $4.000 | ~$154 |
| 30–49 (1,5–2★) | $12.000 | ~$462 |
| 50–69 (2,5–3★) | $35.000 | ~$1.346 |
| 70–89 (3,5–4★) | $110.000 | ~$4.231 |
| 90+ (4,5–5★) | $400.000 | ~$15.385 |

### 2.6 Manutenção por partida (`MAINTENANCE_PER_MATCH`, por nível 1–5)
| Prédio | Nv1 | Nv2 | Nv3 | Nv4 | Nv5 |
|---|---|---|---|---|---|
| Estádio | 2.000 | 4.500 | 9.000 | 16.000 | 27.000 |
| CT Treino | 1.000 | 2.200 | 4.500 | 9.000 | 16.000 |
| CT Elemental | 1.000 | 2.200 | 4.500 | 9.000 | 16.000 |
| Centro Médico | 800 | 1.800 | 3.600 | 6.500 | 12.000 |

### 2.7 Sanity check (temporada mediana 13V/5E/8D, estádio dimensionado à divisão, 80% ocupação)
| Divisão | Fixo | Prêmio | Bilheteria | **Receita** | Teto §8.2 | folha/rec |
|---|---|---|---|---|---|---|
| Bronze | 546k | 241k | 2.080k | 2.867k | 770k | 26,9% |
| Prata | 1.300k | 451k | 3.900k | 5.651k | 1.440k | 25,5% |
| Ouro | 2.678k | 806k | 6.500k | 9.984k | 2.410k | 24,1% |
| Diamante | 5.434k | 1.454k | 10.400k | 17.288k | 3.920k | 22,7% |
| Lendária | 10.348k | 2.592k | 15.600k | 28.540k | 6.020k | 21,1% |

Teto de folha §8.2 fica com margem (21–27%) sobre o alvo de 35% quando o estádio está maxed. Alinha-se aos 35% assumindo estádio Nv1 baseline; upgrade do estádio vira alavanca de receita, não pressuposto.

### 2.8 Sanity check dinâmico — Prata baseline (moral evoluindo, 300 seeds)
Temporada Prata (13V/5E/8D), Estádio Nv1 (8k), CT Nv1, Centro Médico Nv1, overall médio 55-65, moral atualizada rodada a rodada por `xp.server.ts` (penalidade de banco graduada `-6/-3/-1` por rank de overall, spec Sistema-Moral.md):

| Elenco | Saldo médio | Mediana | P10/P90 | Moral média |
|---|---|---|---|---|
| 18 (enxuto) | $726k | $733k | $631k / $811k | 57 |
| 22 (médio) | $493k | $499k | $405k / $586k | 53 |
| 26 (starter completo) | $303k | $307k | $204k / $404k | 50 |

Referência ex-ante com moral estável ~70: ~$911k. A diferença vem do custo real da moral partindo de 50 e estabilizando em 50-57 ao longo de 26 rodadas. Economia é positiva em todos os tamanhos; profundidade tem custo gradual, não penhasco.

**Correção histórica:** `xp.server.ts` aplicava `outOfSquad = -7` fixo a quem não estava no matchday de 18, ignorando o rank. Divergia da spec Sistema-Moral.md. Corrigido para usar `benchPenaltyByRank` (`-6/-3/-1`) também para excedentes. Sem a correção, elenco de 26 zerava (saldo médio $40k, moral caindo a 38) — 4ª ocorrência nesta sessão de constante implementada em paralelo à spec.



## 3. Gemas

### 3.1 Ganho gratuito
- Recompensa semanal: **30💎 / 7 dias**
- Bônus campeão de temporada: **+50💎**

### 3.2 Pacotes pagos (referência BR)
| Pacote | Gemas | Bônus | Preço |
|---|---|---|---|
| Punhado | 100 | — | R$ 9,90 |
| Saco | 500 + 50 bônus = 550 | +10% | R$ 34,90 |
| Baú | 1.000 + 200 bônus = 1.200 | +20% | R$ 79,90 |
| Cofre | 2.400 + 400 bônus = 2.800 | +16,7% | R$ 159,90 |
| Tesouro | 5.600 + 600 bônus = 6.200 | +10,7% | R$ 289,90 |

### 3.3 Usos
| Uso | Custo |
|---|---|
| Poção Individual (100% energia de 1) | $8.000 ou 3💎 |
| Poção Coletiva (+15% energia elenco) | $40.000 ou 12💎 |
| Cristal Vital (+25% energia elenco) | $80.000 ou 20💎 |
| **Ânimo Individual** (+25 moral nominal, 1 criatura) | **$10.000 ou 4💎** |
| **Ânimo Coletivo** (+15 moral nominal, todo elenco) | **$45.000 ou 14💎** |
| Acelerar obra | 1💎 / 10 min restantes |
| Construtor 2º / 3º / 4º | 250 / 600 / 1.200 💎 |
| Expansão 26→32 / 32→38 | 400 / 900 💎 |
| Burst XP +5 / +10 / +15% (1 temporada) | 80 / 150 / 220 💎 |
| Velocidade 4x (permanente) | 300 💎 |
| Instantâneo (permanente) | 800 💎 |

> **Ânimo (Individual/Coletivo)** aplica a mesma fórmula de ganhos decrescentes do Sistema de Moral: `ganho_real = ganho_nominal × (1 − moral_atual / 120)`. Criaturas com moral alto recebem pouco; criaturas desanimadas recebem quase o valor cheio. Isso preserva o equilíbrio entre fadiga e moral — não é atalho para lotar 100 via compra.

### Sessões de moral GRATUITAS (por tempo) — `src/lib/morale-training.functions.ts`
Alternativa sem gastar dinheiro/gemas ao Ânimo comprado. Aplicam a mesma fórmula de ganhos decrescentes `(1 − moral_atual/120)`.

| Sessão | Duração | Alvo | Boost nominal | Aceleração |
|---|---|---|---|---|
| Sessão de Incentivo | 4h | 1 criatura | +25 moral | 1💎 / 10min restantes |
| Reunião de Equipe | 4h | Elenco inteiro | +15 moral | 1💎 / 10min restantes |

Apenas uma sessão individual por criatura e uma reunião coletiva por vez. Sessões vencidas são aplicadas por sweep ao abrir Roster/ficha da criatura.

### Incentivo Geral (pago) — `startMoraleGeneral` em `src/lib/morale-training.functions.ts`
Versão paga da Sessão de Incentivo aplicada em paralelo a todo o elenco não aposentado. Mesma duração (4h) e mesmo boost nominal (+25) da versão individual gratuita, sujeita à mesma fórmula de ganhos decrescentes. Custa dinheiro do clube, calculado como `preço_por_criatura × nº_de_criaturas_aplicáveis`, escalado pela divisão atual do time:

| Divisão | Preço por criatura |
|---|---|
| 5ª Bronze | $3.000 |
| 4ª Prata | $5.600 |
| 3ª Ouro | $9.400 |
| 2ª Diamante | $15.300 |
| 1ª Lendária | $23.500 |

Exemplo: elenco de 26 criaturas na Prata = 26 × $5.600 = **$145.600**. Criaturas que já estão em Sessão de Incentivo em andamento são puladas (não são cobradas nem afetadas). Botão fica desabilitado se o saldo for insuficiente ou se todas já estiverem em sessão.



### Crise por sequência de derrotas — `applyPostMatchXp` em `src/lib/xp.server.ts`
Substitui a penalidade fixa `-4` de moral por derrota por uma escala baseada em `trainers.losing_streak` (persistente entre partidas). Reset a zero em qualquer vitória; empate não move o contador.

| Sequência (após esta derrota) | Penalidade base de moral |
|---|---|
| 1–2 derrotas seguidas | −4 |
| 3–4 derrotas | −6 |
| 5–7 derrotas | −8 |
| 8+ derrotas | −10 |

Essa penalidade entra na cadeia de `losses` do cálculo de moral pós-partida (junto com banco, lesão etc.) e sofre o multiplicador de ganho normal — o objetivo é criar uma pressão real em más fases sem penalizar quem tropeça de vez em quando.


### 3.4 Troca de gemas por dinheiro do jogo
Taxa **BASE** (referência 5ª Bronze): **1💎 = $700** (`GEM_TO_MONEY_RATE` em `src/lib/shop.server.ts`).

**Multiplicador por divisão atual do jogador** (`DIVISION_EXCHANGE_MULT`):

| Divisão | Multiplicador | Taxa efetiva |
|---|---|---|
| 5ª – Bronze | ×1,00 | $700 / 💎 |
| 4ª – Prata | ×1,87 | $1.309 / 💎 |
| 3ª – Ouro | ×3,13 | $2.191 / 💎 |
| 2ª – Diamante | ×5,09 | $3.563 / 💎 |
| 1ª – Lendária | ×7,82 | $5.474 / 💎 |

Fórmula: `dinheiro_recebido = (gemas × 700) × multiplicador_da_divisão`.

**Dinheiro recebido por pacote inteiro convertido, por divisão atual do jogador:**

| Pacote | Bronze | Prata | Ouro | Diamante | Lendária |
|---|---|---|---|---|---|
| Punhado (100💎) | 70.000 | 130.900 | 219.100 | 356.300 | 547.400 |
| Saco (550💎) | 385.000 | 719.950 | 1.205.050 | 1.959.650 | 3.010.700 |
| Baú (1.200💎) | 840.000 | 1.570.800 | 2.629.200 | 4.275.600 | 6.568.800 |
| Cofre (2.600💎) | 1.820.000 | 3.403.400 | 5.696.600 | 9.263.800 | 14.232.400 |
| Tesouro (8.400💎) | 5.880.000 | 10.995.600 | 18.404.400 | 29.929.200 | 45.981.600 |

Calibração: mantém o custo real para "zerar" o teto de folha salarial em ~R$ 46 em **qualquer** divisão. Antes (taxa fixa), ficava relativamente mais barato quanto mais alta a divisão; agora é igualmente justo em todas.

A tela de troca (aba Trocar da Loja) exibe a taxa base como referência e a taxa efetiva já calculada para a divisão atual do jogador.

## 4. Construções

### CT de Treinamento (+5% XP por nível)
| Nv | $ | Tempo |
|---|---|---|
| 2 | 120.000 | 8h |
| 3 | 350.000 | 20h |
| 4 | 900.000 | 2d |
| 5 | 2.200.000 | 4d |

### CT Elemental (teto de afinidade: 5 / 8 / 11 / 13 / 15%)
| Nv | $ | Tempo |
|---|---|---|
| 1 | 80.000 | 6h |
| 2 | 250.000 | 16h |
| 3 | 650.000 | 1,5d |
| 4 | 1.500.000 | 3d |
| 5 | 3.200.000 | 5d |

### Estádio (capacidade 8k / 15k / 25k / 40k / 60k)
| Nv | $ | Tempo |
|---|---|---|
| 2 | 200.000 | 12h |
| 3 | 600.000 | 1d |
| 4 | 1.600.000 | 2,5d |
| 5 | 3.800.000 | 5d |

### Centro Médico (+25% recuperação por nível)
| Nv | $ | Tempo |
|---|---|---|
| 1 | 60.000 | 5h |
| 2 | 180.000 | 14h |
| 3 | 500.000 | 1,5d |
| 4 | 1.300.000 | 3d |
| 5 | 3.000.000 | 5d |

## 5. Mercado

- **24 listagens por temporada** (renova junto com a temporada).
- Venda: **90%** do valor de mercado.
- `mod_elemento = 1,0` no MVP.

| Estrelas | Valor base |
|---|---|
| 0,5★ | $15.000 |
| 1,0★ | $35.000 |
| 1,5★ | $70.000 |
| 2,0★ | $130.000 |
| 2,5★ | $240.000 |
| 3,0★ | $430.000 |
| 3,5★ | $780.000 |
| 4,0★ | $1.400.000 |
| 4,5★ | $2.500.000 |
| 5,0★ | $4.500.000 |

## 6. Valores iniciais (novo jogador)

- Dinheiro: **$400.000**
- Gemas: **50💎**
- Construtores: 1
- Elenco: **22 criaturas** (time inicial escolhido, 0,5★–3★)
- Vagas de elenco: 26
- Estádio nv 1, CT Treinamento nv 1, Centro Médico nv 1, CT Elemental **nv 0**
- Divisão inicial: **5ª Divisão – Liga Bronze**
- Itens: 3 Poção Individual + 1 Poção Coletiva

## 7. Liga, Promoção e Mundo

- **14 times, 26 rodadas** (turno e returno).
- Sobem **3** (1º–3º); caem **3** (12º–14º).
- **Bronze não rebaixa**, **Lendária não promove**.

### 7.1 Distribuição de estrelas por divisão (geração do mundo)
Perfis em `DIVISION_STAR_PROFILE` (`src/lib/economy.ts`). 14 times × 26 criaturas = 364 por divisão, 1.820 no mundo.

| Divisão | Média | 5★ | 4,5★ | 4★ |
|---|---|---|---|---|
| 1ª Lendária | 3,64★ | 5% | 12% | 25% |
| 2ª Diamante | 3,18★ | — | 4% | 14% |
| 3ª Ouro | 2,75★ | — | — | 5% |
| 4ª Prata / 5ª Bronze | — | — | — | — |

Apenas ~18 criaturas 5★ existem no mundo inteiro (1%), todas na 1ª Divisão.

### 7.2 Como os 5★ se mantêm no mundo
1. **Mercado por divisão**: cada divisão gera seu mercado seguindo o próprio perfil. Bronze nem vê 5★ à venda.
2. **Auge de carreira**: um 4,5★ que joga carreira completa pode chegar a 5★ (Bestiário §10.3).
3. **Nascimento excepcional** (opcional, ~0,5%): criatura nasce uma estrela acima do perfil da divisão.

Estoque global de craques oscila em torno de 1% — nunca some, nunca inflaciona.

## 8. Calibre e Teto Salarial (aplicado)

Enforced em `src/lib/economy.ts` + `buyCreature`:

### 8.1 Calibre por divisão (limite de contratação)
| Sua divisão | Contrata até | Recusa |
|---|---|---|
| 5ª – Bronze | 3★ | 50% ao tentar 3★ |
| 4ª – Prata | 4★ | 40% ao tentar 4★ |
| 3ª – Ouro | 5★ | 60% ao tentar 4,5★+ |
| 2ª – Diamante | 5★ | — |
| 1ª – Lendária | 5★ | — |

### 8.2 Teto de folha salarial (~35% da receita típica)
| Divisão | Receita típica | Teto de folha |
|---|---|---|
| Bronze | $2.190.000 | $770.000 |
| Prata | $4.105.000 | $1.440.000 |
| Ouro | $6.895.000 | $2.410.000 |
| Diamante | $11.193.000 | $3.920.000 |
| Lendária | $17.191.000 | $6.020.000 |

## 9. Fluxo econômico de sanidade (referência)

Time de Ouro em temporada mediana:
- Vitórias ~7 × 50.000 = 350.000
- Bilheteria ~7 × 450.000 = 3.150.000
- Prêmio de posição (5º, ×1,5) = 75.000
- **Total ≈ $3.575.000**

Gastos:
- Salários (~22 mistos): ~$600.000
- 1 evolução de construção: ~$600.000–900.000
- Sobra para mercado: ~$2.000.000+ → 1 criatura ~3★ por temporada

## Fadiga v3 — desgaste por evento (substitui v2)

A v2 desgastava ~36 pontos por partida (0,4/min). A v3 troca isso por eventos discretos.

**Desgaste ao fim da partida (só para quem jogou — titular ou reserva que entrou):**
- Vitória: −3 · Empate: −4 · Derrota: −5
- Ajuste por pressão: alta −2 extra · média 0 · baixa poupa 1

**Cartões (cumulativo, no momento do evento):**
- Amarelo: −5 · Vermelho: −10 (2º amarelo soma os dois = −15)

**Lesão (único, no momento em que ocorre — além da indisponibilidade):**
- Leve/1 partida: −4
- Moderada/2: −7 · Moderada/3: −15
- Grave/4: −20 · Grave/5: −25

**Recuperação entre partidas:**
- Jogou: +2 · Não jogou (banco não usado ou lesionado): +6

**Piso 30, teto 100.** Multiplicador de Overall efetivo **não mudou**:
- energia ≥70 → 1,00; senão 0,50 + 0,50 × (e−30)/40.

Sanity: sem revezar 26 rodadas seguidas, energia estabiliza em ~45-50%. Revezando a cada 3 rodadas, mantém ~98%. Amistoso continua sem efeito nenhum de energia.

### Modificador de idade (Fadiga v3 e Lesões)

Multiplicador extra que empilha, de forma multiplicativa, com os fatores já existentes (Físico, Pressão, Centro Médico). Não substitui nada.

| Idade | Desgaste de energia | Risco de lesão |
| --- | --- | --- |
| 18 | ×0,80 | ×0,75 |
| 21 | ×0,90 | ×0,85 |
| 24 | ×1,00 (auge) | ×1,00 (auge) |
| 27 | ×1,10 | ×1,15 |
| 30 | ×1,20 | ×1,35 |

Fora do intervalo, clampa nas pontas. Idades fora dos múltiplos de 3 usam interpolação linear entre âncoras.

**Aplicação — Fadiga:** o mult. multiplica o valor final já calculado (resultado da partida + ajuste de pressão), na mesma cadeia do Físico. Ex.: derrota (−5) + pressão média em uma criatura de 30 anos → `round(−5 × 1,20) = −6`. Cartões e lesões (adições posteriores) não são reescalonados.

**Aplicação — Lesão:** o mult. multiplica a probabilidade base (0,4%/min) junto com o mult. de fadiga e a redução do Centro Médico: `p = P_LESAO × fMul × tMul × mMul × ageMul`.

UI: na ficha da criatura, aparece "Veterano — mais propenso a cansaço e lesão" quando idade ≥ 27.



## FASE 2 / Pendências

- Migrar §2 para `Economia-Por-Partida.md` (salário/partida, TV, patrocínios, merchandising, manutenção).
- `mod_elemento` variável no mercado.
- Ocupação de público refinada por fama.
- Preço de ingresso ajustável pelo jogador.
- Playtest de 5 temporadas para calibragem final.

## §Descanso — Cargas compartilhadas + preço crescente

Sistema manual e opcional, adicional à recuperação automática pós-partida (+2 jogou / +6 não jogou).

- **Recuperação por uso:** +50 pts de energia (cap 100).
- **Temporizador:** 15 minutos reais por uso (mesmo quando grátis). Rush = 1 💎 por 10 min restantes (separado do custo de desbloqueio).
- **Pool grátis:** 3 cargas **compartilhadas por todo o elenco** do treinador. Cada uso consome 1 carga.
- **Reset:** quando a pool zera, marca `rest_pool_zeroed_at`. 12 h depois a pool volta para 3 e o contador de uso pago zera.
- **Uso extra (pool zerada) — preço em gemas crescente:**

| Uso extra no ciclo | Custo |
|---|---|
| 1º | 15 💎 |
| 2º | 25 💎 |
| 3º | 40 💎 |
| 4º+ | 60 💎 (teto) |

Assim que houver ao menos 1 carga grátis disponível de novo, o próximo uso volta a ser gratuito e o contador de pago é resetado.
