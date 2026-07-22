# Tabela de Balanceamento — MVP v1 (recalibrada p/ liga 14/26 + ciclo de vida)

Complemento numérico do GDD e do Bestiário. Valores já aplicados no código, salvo pendências no fim.

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

## 2. Economia — Dinheiro

### 2.1 Premiação por rodada
| Divisão | V | E | D |
|---|---|---|---|
| Bronze | $15.000 | $6.000 | $2.000 |
| Prata | $28.000 | $11.000 | $4.000 |
| Ouro | $50.000 | $20.000 | $7.000 |
| Diamante | $90.000 | $36.000 | $13.000 |
| Lendária | $160.000 | $64.000 | $24.000 |

### 2.2 Bilheteria (só em casa)
- `Bilheteria = capacidade × ocupação × $25`
- Ocupação = `min(100%, 70% + 3% × posição_invertida)` — líder lota (100%), lanterna ≈ 70%
- 13 jogos em casa por temporada (turno/returno em liga de 14).

### 2.3 Bônus de fim de temporada (× prêmio de vitória da divisão)
| Posição | Multiplicador |
|---|---|
| 1º | ×10 (+50💎 campeão) |
| 2º | ×6 |
| 3º–4º | ×3 |
| 5º–6º | ×1,5 |
| 7º–8º | ×0,5 |
| 9º–14º | 0 |

### 2.4 Salários (por temporada)
| Estrelas | Salário |
|---|---|
| 0–1★ | $4.000 |
| 1,5–2★ | $9.000 |
| 2,5–3★ | $20.000 |
| 3,5–4★ | $45.000 |
| 4,5–5★ | $90.000 |

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
- Distribuição: 60% 0,5–1,5★, 30% 2–2,5★, 8% 3–3,5★, 2% 4★+.
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
- Elenco: **22 criaturas** (time inicial escolhido)
- Vagas de elenco: 26
- Estádio nv 1, CT Treinamento nv 1, Centro Médico nv 1, CT Elemental **nv 0**
- Divisão inicial: **5ª Divisão – Liga Bronze**
- Itens: 3 Poção Individual + 1 Poção Coletiva

## 7. Liga e Promoção / Rebaixamento

- **14 times, 26 rodadas** (turno e returno).
- Sobem **3** (1º–3º); caem **3** (12º–14º).
- **Bronze não rebaixa**, **Lendária não promove**.

## 8. Calibre e Teto Salarial (PENDÊNCIAS)

Regras aprovadas mas ainda **não implementadas em código**:

### 8.1 Calibre por divisão (limite de contratação)
| Sua divisão | Contrata até | Observação |
|---|---|---|
| 5ª – Bronze | 3★ | melhores recusam |
| 4ª – Prata | 4★ | — |
| 3ª – Ouro | 5★ | chance alta de recusa |
| 2ª – Diamante | 5★ | — |
| 1ª – Lendária | 5★ | sem restrição |

### 8.2 Teto de folha salarial (~35% da receita típica)
| Divisão | Receita típica | Teto de folha |
|---|---|---|
| Bronze | $2.190.000 | $770.000 |
| Prata | $4.105.000 | $1.440.000 |
| Ouro | $6.895.000 | $2.410.000 |
| Diamante | $11.193.000 | $3.920.000 |
| Lendária | $17.191.000 | $6.020.000 |

## FASE 2 / Pendências

- `mod_elemento` variável no mercado.
- Ocupação de público refinada por fama.
- Penalidade de overall por energia baixa.
- Preço de ingresso ajustável pelo jogador.
- **Enforce §8.1 e §8.2** no `buyCreature`.
- Playtest de 5 temporadas para calibragem final.
