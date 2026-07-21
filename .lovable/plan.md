# Monster Club Manager — Estado do MVP v1

GDD é a fonte de verdade. Este arquivo rastreia o que já está no código.

## Status por seção do GDD

| § | Tema | Status |
|---|---|---|
| 1.1 | Escolha de 1 entre 6 times iniciais (22 criaturas, 5ª Div. – Bronze) | ✅ `src/lib/starter-teams.ts`, wizard em `/onboarding` |
| 2.1–2.2 | Identidade, atributos em estrelas (0–5, meia-estrela) | ✅ |
| 2.3 | Afinidade elemental (+1% a +15%), treinável no CT Elemental | ✅ com teto por nível [5/8/11/13/15] |
| 2.4 | Overall com pesos por posição | ✅ |
| 3.1–3.2 | Ciclo pentagonal, +6%/−5% | ✅ no motor |
| 3.3 | Clima | Campo salvo, sem efeito no MVP |
| 4 | Motor minuto a minuto, mando +4, cartão amarelo/vermelho, lesão | ✅ |
| 4.7 | Velocidade 1x/2x grátis, 4x (300💎) e Instantâneo (800💎) desbloqueio permanente | ✅ |
| 5.1 | Elenco 18–26, começa com 22, expansível 30/36 | ✅ |
| 5.2–5.3 | 16 formações, Auto definir | ✅ |
| 5.4 | Estratégia Ofensiva/Equilibrada/Defensiva | ✅ |
| 5.5 | Substituições (limite 3) | ✅ |
| 6.1 | XP: vitória cheio, empate 50%, derrota 0; reservas 50%/25% | ✅ `xp.server.ts` |
| 6.2 | CT Treinamento +5% por nível | ✅ |
| 6.3 | Curva `850 × 1,35^(n−1)`, jogador escolhe atributo | ✅ `spendHalfStar` |
| 6.4 | Burst de XP +5/10/15% (14 partidas) | ✅ |
| 7 | 4 construções, custos/tempos por nível, aceleração 1💎/10min, construtor extra escalonado | ✅ |
| 8.1–8.4 | Duas moedas, bilheteria dinâmica, premiação por divisão/posição, salários sazonais | ✅ |
| 8.5 | Poção Individual/Coletiva/Cristal Vital, itens iniciais no onboarding | ✅ |
| 9 | Mercado 24 listagens por temporada, preços por estrela | ✅ |
| 10 | 5 divisões, 8 times, 14 rodadas, promoção/rebaixamento, bônus +50💎 campeão | ✅ |
| 11 | Loja de Gemas com pacotes +10/20/30% bônus | ✅ |
| 12 | Todas as telas do MVP (Dashboard, Elenco, Detalhe, Escalação, Partida, Liga, Copa, Mercado, Construções, Finanças, Loja, Mensagens) | ✅ |
| 13 | Modelo de dados alinhado ao GDD | ✅ |

## Adicionais implementados

- Recompensa semanal de 30💎 (§8.1) via `claimWeeklyGems`.
- Copa mata-mata (bônus além do MVP).
- Amistosos a partir do Dashboard.
- Auto definir escalação.

## Fase 2 (fora de escopo)

Envelhecimento/aposentadoria, personalidade, clima ativo, penalidade de energia baixa no overall, economia viva no mercado (mod_elemento, propostas por criaturas, leilão), Laboratório/Dormitório/Biblioteca, olheiros, moral/química, cosméticos, Hall da Fama.

## Decisões fechadas (antes eram §15)

- Empate = 50% do XP de vitória. ✅
- Atributo ao subir meia-estrela: **jogador escolhe** via `spendHalfStar`. ✅
- Curva de XP por meia-estrela: `custoMeiaEstrela(n) = round(850 × 1,35^(n−1), 10)`. ✅
- Salários: **por temporada** (aplicados em `finishSeasonAndAdvance`). ✅
- Renovação de mercado: **por temporada** (24 listagens). ✅
- Tabela de balanceamento: aplicada.
