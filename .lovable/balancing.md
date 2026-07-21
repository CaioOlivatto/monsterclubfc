# Tabela de Balanceamento — MVP v1

Complemento numérico do GDD. Todos os valores abaixo já estão aplicados no código, salvo notas de FASE 2.

## 1. XP e Evolução

### XP por partida
- Vitória (titular jogado): **100 XP**
- Empate: **50 XP**
- Derrota: **0 XP**
- Reserva que entrou: **proporcional ao tempo jogado** (metade, arredondado)
- Reserva que não entrou: **25 XP** só em vitória; 0 nos demais

### Curva de custo por meia-estrela
`custo(n) = round(850 × 1,35^(n−1), 10)` — 10 degraus (0 → 5★)

| Degrau | Estrela | Custo (XP) | Acum. |
|---|---|---|---|
| 1 | 0,5★ | 850 | 850 |
| 2 | 1,0★ | 1.150 | 2.000 |
| 3 | 1,5★ | 1.550 | 3.550 |
| 4 | 2,0★ | 2.090 | 5.640 |
| 5 | 2,5★ | 2.820 | 8.460 |
| 6 | 3,0★ | 3.810 | 12.270 |
| 7 | 3,5★ | 5.150 | 17.420 |
| 8 | 4,0★ | 6.950 | 24.370 |
| 9 | 4,5★ | 9.380 | 33.750 |
| 10 | 5,0★ | 12.660 | 46.410 |

### Aceleradores
- **CT de Treinamento**: `XP_efetivo = XP_base × (1 + 0,05 × nível_CT + bônus_burst)`
- **Burst de XP** (Gemas): +5%, +10% ou +15% durante **14 partidas de liga**

## 2. Economia — Dinheiro

### Premiação por rodada
| Divisão | V | E | D |
|---|---|---|---|
| Bronze | $15.000 | $6.000 | $2.000 |
| Prata | $28.000 | $11.000 | $4.000 |
| Ouro | $50.000 | $20.000 | $7.000 |
| Diamante | $90.000 | $36.000 | $13.000 |
| Lendária | $160.000 | $64.000 | $24.000 |

### Bilheteria (só em casa)
- `Bilheteria = capacidade × ocupação × $25`
- Ocupação = `0,70 + 0,03 × (9 − posição_atual)` (líder ≈ 94%)

### Bônus de fim de temporada (× prêmio de vitória da divisão)
| Posição | Multiplicador |
|---|---|
| 1º | ×10 (+50💎 campeão) |
| 2º | ×6 |
| 3º–4º | ×3 |
| 5º–6º | ×1,5 |
| 7º–8º | ×0,5 |

### Salários (por temporada)
| Estrelas | Salário |
|---|---|
| 0–1★ | $4.000 |
| 1,5–2★ | $9.000 |
| 2,5–3★ | $20.000 |
| 3,5–4★ | $45.000 |
| 4,5–5★ | $90.000 |

## 3. Gemas

### Ganho gratuito
- Recompensa semanal: **30💎 / 7 dias**
- Bônus campeão de temporada: **+50💎**

### Pacotes pagos (referência BR)
| Pacote | Gemas | Bônus | Preço |
|---|---|---|---|
| Punhado | 100 | — | R$ 9,90 |
| Saco | 550 | +10% | R$ 44,90 |
| Baú | 1.200 | +20% | R$ 89,90 |
| Cofre | 2.600 | +30% | R$ 179,90 |
| Tesouro | 6.000 | melhor | R$ 349,90 |

### Usos
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

## 7. Promoção / Rebaixamento

- 8 times, 14 rodadas.
- Sobem 2 (1º e 2º); caem 2 (7º e 8º).
- **Bronze não rebaixa**, **Lendária não promove**.

## FASE 2 (fora deste balanceamento)

- `mod_elemento` variável no mercado.
- Ocupação de público refinada por fama.
- Penalidade de overall por energia baixa.
- Preço de ingresso ajustável pelo jogador.
- Playtest de 5 temporadas para calibragem final.
