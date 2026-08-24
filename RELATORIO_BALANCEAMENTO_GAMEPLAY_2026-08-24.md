# Relatório de balanceamento de gameplay — Monster Club FC

Data: 24/08/2026

## 1. Diagnóstico encontrado

O principal desequilíbrio era estrutural: embora os clubes CPU possuíssem criaturas persistentes, partidas oficiais contra o jogador ainda podiam representar o adversário por um XI sintético derivado de `cpu_strength`. Isso reduzia a importância do elenco real, posições, energia, moral e lesões da CPU. Também havia inconsistência após promoção/rebaixamento: a divisão mudava sem uma adaptação equivalente de `cpu_strength` e do elenco persistente.

A economia apresentava outro risco: o bônus de vitória fora podia compensar manutenção de infraestrutura excessiva para a divisão. Copa e competições mundiais também injetavam dinheiro demais em relação ao ritmo desejado de carreira.

## 2. Arquivos alterados

- `src/lib/cpu-side.server.ts` — montagem do time CPU persistente.
- `src/lib/game-balance.ts` — metas e constantes centrais das divisões.
- `src/lib/league.functions.ts` — partidas, promoção, rebaixamento e evolução CPU.
- `src/lib/cup.functions.ts` — uso do elenco CPU real.
- `src/lib/world-competitions.functions.ts` — uso do elenco CPU real.
- `src/lib/odds.functions.ts` — prognóstico com o mesmo adversário real da partida.
- `src/lib/match-engine.server.ts` — referências de força coerentes entre divisões.
- `src/lib/world/catalog.ts` — curva divisional coerente.
- `src/lib/economy.ts` — limite de bônus fora e premiações recalibradas.
- `supabase/migrations/20260824120000_cpu_roster_balance.sql` — evolução segura de elencos CPU e índice.
- `scripts/gameplay-balance-sim.ts` — partidas e temporadas automatizadas.
- `scripts/balance-sim.ts`, `scripts/career-sim.ts`, `scripts/balance-check.ts` — cenários econômicos e de carreira atualizados.
- `package.json` — comando `gameplay:sim`.

## 3. Alterações realizadas

- Jogador x CPU usa prioritariamente criaturas persistentes pertencentes ao clube adversário.
- XI sintético ficou restrito a fallback quando não existem 11 criaturas válidas.
- CPU respeita posições, lesões, aposentadoria, energia e moral.
- Formação 4-4-2 e sete reservas são montadas de forma coerente e barata.
- Eficiência de escalação e inteligência tática variam por divisão, sem reduzir OVR artificialmente.
- Personalidade tática é determinística por clube, evitando adversários idênticos.
- Promoções/rebaixamentos atualizam `cpu_strength` em lote e evoluem/regridem moderadamente elencos persistentes.
- Bônus de vitória fora recebeu teto divisional.
- Premiações de Copa e Mundial foram reduzidas para conter inflação.
- Foram criadas simulações headless reprodutíveis e critérios automáticos de aprovação.

## 4. Como a CPU escala agora

A CPU carrega as criaturas do próprio clube em uma consulta, exclui aposentados e lesionados, pontua adequação à posição natural, OVR, energia e moral, e monta goleiro, quatro defensores, quatro meio-campistas, dois atacantes e sete reservas. A eficiência de escolha é aproximadamente:

| Divisão | Eficiência de escalação | Inteligência tática |
|---|---:|---:|
| Bronze | 75–85% | 30% |
| Prata | 82–88% | 50% |
| Ouro | 88–94% | 70% |
| Diamante | 94–98% | 85% |
| Lendária | 98–100% | 100% |

## 5. Como a CPU evolui agora

Na transição de temporada, clubes promovidos recebem uma evolução moderada de +1 OVR em seu elenco persistente; rebaixados recebem -1 OVR, sempre dentro dos limites existentes. Não há descarte nem regeneração completa do elenco. O mecanismo é barato, executado em lote e evita inflação infinita.

## 6. Promoção e rebaixamento

Além de alterar divisão e competição, a transição agora atualiza `cpu_strength` para o ponto médio da nova divisão e chama a evolução do elenco persistente. Assim, o clube mantém identidade e jogadores, mas passa a ocupar uma posição coerente no novo ambiente competitivo.

## 7. Curva final das cinco divisões

| Divisão | Faixa-alvo do XI | Referência central |
|---|---:|---:|
| Bronze | 36–48 | 42 |
| Prata | 47–59 | 53 |
| Ouro | 58–70 | 64 |
| Diamante | 67–80 | 74 |
| Lendária | 76–90 | 83 |

Essas faixas orientam geração e simulação; não impõem placares nem vitórias.

## 8. Resultados de 5.000 partidas por cenário

| Cenário | Vitória casa | Empate | Vitória fora | Gols casa-fora |
|---|---:|---:|---:|---:|
| Força igual | 38,0% | 28,0% | 34,0% | 1,33–1,22 |
| +5 OVR | 57,4% | 23,3% | 19,3% | — |
| +10 OVR | 76,0% | 15,8% | 8,2% | — |
| +20 OVR | 95,5% | 3,4% | 1,1% | — |
| Energia 60 x 90 | 18,5% | 24,8% | 56,7% | — |
| Moral 40 x 80 | 21,3% | 24,4% | 54,3% | — |
| Vantagem elemental | 47,8% | 26,3% | 25,8% | — |
| Goleiro rival +15 | 24,6% | 29,7% | 45,6% | — |
| Estratégia ofensiva | 46,4% | 23,1% | 30,5% | — |
| Estratégia defensiva | 30,7% | 31,4% | 37,9% | — |
| Pressão/verticalidade | 54,2% | 21,2% | 24,6% | — |

Times equivalentes nas cinco divisões ficaram entre 37,2% e 38,6% de vitória do mandante. O fator casa é perceptível, mas não determinístico.

## 9. Simulações de temporada

Foram simuladas 1.000 temporadas por perfil em cada divisão, com 26 partidas e promoção estimada em 48 pontos.

| Divisão | Sem mudanças | 2 contratações | 4 contratações | Otimizado |
|---|---:|---:|---:|---:|
| Bronze | 17,9% | 46,1% | 66,3% | 81,1% |
| Prata | 17,5% | 42,9% | 61,3% | 79,2% |
| Ouro | 16,6% | 43,2% | 59,0% | 74,6% |
| Diamante | 16,1% | 42,7% | 57,9% | 73,4% |
| Lendária | 15,6% | 39,5% | 56,2% | 74,0% |

## 10–12. Chances de promoção

- Time inicial sem reestruturação: 15,6–17,9%.
- Duas boas contratações: 39,5–46,1%.
- Quatro boas contratações: 56,2–66,3%.
- Gestão e tática otimizadas: 73,4–81,1%.

Os resultados surgem do motor; nenhuma probabilidade foi imposta às partidas.

## 13. Média de gols

No cenário de forças iguais, a média foi 2,55 gols por partida (1,33 do mandante e 1,22 do visitante), adequada para partidas abertas sem placares excessivos.

## 14. Impacto de OVR

- +5: favoritismo perceptível, 57,4% de vitória.
- +10: favoritismo claro, 76,0%.
- +20: grande favoritismo, 95,5%, ainda sem garantia absoluta.

Energia, moral, elemento, goleiro, estratégia e tática produziram impactos mensuráveis; OVR não é a única variável relevante.

## 15. Economia

O bônus de vitória fora agora possui teto por divisão: Bronze $28 mil, Prata $55 mil, Ouro $100 mil, Diamante $180 mil e Lendária $300 mil. Ele não cobre mais manutenção estrutural incompatível com a divisão. Premiações de Copa e Mundial foram reduzidas.

Em 1.000 temporadas econômicas por perfil, a Bronze terminou em média entre $613 mil e $776 mil. Na Prata, perfis frágeis tiveram média de $83 mil e percentil 10 de -$41 mil; no Ouro, média de $142 mil e percentil 10 de -$12 mil. Isso cria risco real sem inviabilizar boa gestão.

Na simulação de carreira de 200 treinadores por dez temporadas, nenhum perfil chegou automaticamente ao topo: primeira promoção média entre temporadas 3,9 e 6,0; perfis finais permaneceram principalmente entre Bronze, Prata e Ouro. Estratégia passou a importar e o efeito cascata de títulos consecutivos foi contido.

## 16. Riscos e débitos técnicos restantes

- A migration precisa ser aplicada ao Supabase antes de a evolução persistente entrar em produção.
- A distribuição real dos elencos já salvos deve ser observada com telemetria após publicação; dados existentes foram preservados.
- CPU x CPU continua podendo usar caminho simplificado por performance; jogador x CPU usa o modelo completo.
- A simulação de temporada usa 48 pontos como aproximação estatística de promoção, não substitui a tabela real do jogo.
- O perfil otimizado da Bronze ficou em 81,1%, 1,1 ponto acima da referência de 80%; foi mantido porque não há garantia direta e o resultado continua dependente das decisões.

## 17. Comandos de teste utilizados

```text
npm.cmd run gameplay:sim
npm.cmd run balance:sim
npm.cmd run career:sim
npm.cmd run balance:check
npm.cmd run build
```

Todos passaram. O build emitiu apenas avisos preexistentes de depreciação do `inputValidator` do TanStack, sem erros.

## Avaliação final

| Frente | Antes | Depois |
|---|---:|---:|
| Motor e leitura das decisões | 6,5 | 8,8 |
| CPU como clube real | 4,0 | 8,7 |
| Economia | 6,0 | 8,2 |
| Progressão | 6,2 | 8,6 |
| Performance/arquitetura | 6,5 | 8,3 |
| Geral | 5,8 | 8,5 |

O resultado atende à filosofia definida: o elenco inicial compete, boa gestão sustenta o clube, contratações e desenvolvimento são necessários para promoção, e excelência aumenta muito as chances sem garantir o título.

Nenhum commit, push ou merge foi realizado nesta etapa.
