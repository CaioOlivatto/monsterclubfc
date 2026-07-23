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

### 2.3 Bilheteria (só em casa)
- `Bilheteria = capacidade × ocupação × $25`
- Ocupação = `min(100%, 70% + 3% × posição_invertida)` — líder lota (100%), lanterna ≈ 70%
- 13 jogos em casa por temporada.

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


## 3. Gemas

### 3.1 Ganho gratuito
- Recompensa semanal: **30💎 / 7 dias**
- Bônus campeão de temporada: **+50💎**

### 3.2 Pacotes pagos (referência BR)
| Pacote | Gemas | Bônus | Preço |
|---|---|---|---|
| Punhado | 100 | — | R$ 9,90 |
| Saco | 550 | +10% | R$ 44,90 |
| Baú | 1.200 | +20% | R$ 89,90 |
| Cofre | 2.600 | +30% | R$ 179,90 |
| Tesouro | 6.000 | melhor | R$ 349,90 |

### 3.3 Usos
| Uso | Custo |
|---|---|
| Acelerar obra | 1💎 / 10 min restantes |
| Construtor 2º / 3º / 4º | 250 / 600 / 1.200 💎 |
| Expansão 26→32 / 32→38 | 400 / 900 💎 |
| Burst XP +5 / +10 / +15% (1 temporada) | 80 / 150 / 220 💎 |
| Velocidade 4x (permanente) | 300 💎 |
| Instantâneo (permanente) | 800 💎 |

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

## FASE 2 / Pendências

- Migrar §2 para `Economia-Por-Partida.md` (salário/partida, TV, patrocínios, merchandising, manutenção).
- `mod_elemento` variável no mercado.
- Ocupação de público refinada por fama.
- Penalidade de overall por energia baixa.
- Preço de ingresso ajustável pelo jogador.
- Playtest de 5 temporadas para calibragem final.
