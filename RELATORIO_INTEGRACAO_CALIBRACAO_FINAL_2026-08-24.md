# Monster Club FC — Relatório final de integração e calibração

Data: 24/08/2026
Escopo: gameplay V1, economia, gemas, monetização, estádio, mercado, telemetria e prontidão de publicação.

## Resumo executivo

**Decisão:** `NO-GO para publicação comercial`, `GO para continuar testes locais`.

O motor esportivo V1 foi preservado e passou nas simulações de Bronze, Prata, impacto de OVR, Premium e reprodução determinística das velocidades. A economia do estádio e os perfis financeiros também ficaram dentro dos objetivos. Entretanto, não é seguro declarar a fase concluída em produção porque as migrations pendentes não puderam ser validadas/aplicadas no Supabase remoto, a auditoria dos elencos reais não pôde ser executada e alguns sistemas exigidos ainda não existem de ponta a ponta (refresh progressivo de mercado, scout posicional e pagamentos reais).

Nenhum commit, push, merge ou publicação no Lovable foi realizado nesta fase.

## Critérios de aprovação

| Área | Critério | Resultado | Status |
|---|---|---:|---|
| Bronze inicial | 15–20% de promoção | 17,9% | Aprovado |
| Bronze +2 contratações | 40–50% | 46,1% | Aprovado |
| Bronze +4 contratações | 55–70% | 66,3% | Aprovado |
| Bronze otimizado | 70–82% | 81,1% | Aprovado |
| Prata recém-promovido | não ser favorito automático | 17,5% no cenário inicial | Aprovado |
| Economia razoável | não quebrar inevitavelmente | sem falência nos perfis testados | Aprovado |
| Economia frágil | má gestão poder quebrar | P10 negativo/baixo em Prata e Ouro | Aprovado com monitoramento |
| Velocidades | mesmo resultado para mesma seed | placar/eventos/XP/energia/moral idênticos | Aprovado |
| Gemas iniciais | aproximadamente 10 | migration preparada para novos cadastros | Pendente no banco |
| Migração real | aplicada e auditada | transporte Supabase falhou | Reprovado para produção |
| Mercado 12h/refresh | sequência grátis/dinheiro/5/10/20/30 gemas | não implementado | Pendente |
| Scout posicional | GOL/DEF/MEI/ATA | existe scout de Arena, não o de Mercado | Pendente |
| Pagamentos | pacotes compráveis | catálogo existe; cobrança real desativada | Pendente |
| Telemetria do funil | todos os eventos efetivamente emitidos | esquema completo, instrumentação parcial | Pendente |

## 1. Migration aplicada ou status

Foram revisadas:

- `20260824120000_cpu_roster_balance.sql`: aditiva, não apaga registros, usa `CREATE INDEX IF NOT EXISTS` e `CREATE OR REPLACE FUNCTION`. A evolução de CPU só ocorre quando a função é chamada; reaplicar a definição não duplica dados. A função limita OVR entre 1 e 100 e afeta apenas criaturas CPU não aposentadas.
- `20260824130000_final_integration_calibration.sql`: adiciona `paid_2x` com `IF NOT EXISTS`, normaliza apenas novos inserts com 50 gemas para 10, cria desbloqueio atômico de velocidades e amplia a lista segura de telemetria. Saldos existentes não são reduzidos.

Tentativas de `supabase db push --linked --dry-run --include-all --skip-vault` falharam antes da aplicação com `LegacyDbConfigLoginRoleNetworkError / TransportError` ao inicializar o login remoto.

**Status:** migrations preparadas e auditadas estaticamente, porém **não confirmadas/aplicadas no Supabase remoto nesta execução**. O banco não foi apagado nem resetado.

## 2. Análise dos elencos reais CPU

Não foi possível consultar amostras reais porque o mesmo canal remoto do Supabase falhou. Portanto, não há evidência válida nesta execução para afirmar médias reais por divisão, melhor XI, XI da IA, energia, moral, lesões ou estrelas.

Os alvos permanecem:

- Bronze: XI 36–48
- Prata: XI 47–59
- Ouro: XI 58–70
- Diamante: XI 67–80
- Lendária: XI 76–90

O código e as simulações headless respeitam as bandas, mas isso não substitui a auditoria do banco real.

## 3. Bronze pós-migration

Simulação A–G:

| Cenário | Promoção | Pontos médios |
|---|---:|---:|
| A — time inicial | 17,9% | 41,2 |
| B — escalação ruim | 3,9% | 35,8 |
| C — bem escalado | 29,4% | 44,0 |
| D — +1 boa contratação | 37,8% | 45,4 |
| E — +2 boas contratações | 46,1% | 46,8 |
| F — +4 boas contratações | 66,3% | 49,8 |
| G — gestão otimizada | 81,1% | 52,7 |

O time inicial compete, mas não é normalmente campeão. Escalação, contratações e gestão produzem progressão clara.

## 4. Prata pós-migration

| Cenário | Promoção |
|---|---:|
| Recém-promovido/inicial | 17,5% |
| Escalação ruim | 4,0% |
| Bem escalado | 30,0% |
| +1 reforço | 36,5% |
| +2 reforços | 42,9% |
| +4 reforços | 61,3% |
| Consolidado/otimizado | 79,2% |

Um bom clube Bronze entra como fraco/médio na Prata, não como favorito automático.

## 5. Resultados de promoção por perfil

- Sem reestruturação: 17,9% na Bronze.
- Escalação correta, sem compra: 29,4%.
- Uma contratação: 37,8%.
- Duas contratações: 46,1%.
- Quatro contratações: 66,3%.
- Gestão excelente: 81,1%.

O desenvolvimento natural ajuda, mas a progressão competitiva relevante continua valorizando mercado e gestão.

## 6. Impacto real de Premium

Chance simulada com um único Premium no XI:

| Divisão | Chance de promoção |
|---|---:|
| Bronze | 46,5% |
| Prata | 45,1% |
| Ouro | 44,2% |
| Diamante | 43,9% |
| Lendária | 43,5% |

O Premium é desejável e transforma o clube em candidato, mas não leva 15% para 90% sozinho. O matchmaking e a força efetiva continuam considerando o jogador Premium.

Limitação atual: o código limita a contratação Premium uma vez por carreira e o produto está associado a preço real; a especificação final pede aproximadamente uma oferta por temporada/divisão e somente gemas. Isso não foi alterado parcialmente sem uma arquitetura completa de pagamento e ledger.

## 7. Impacto do estádio

Simulação com 73% de ocupação e 13 jogos em casa:

| Divisão | Nível | Receita de bilheteria | Manutenção | Líquido/temporada | Custo acumulado |
|---|---:|---:|---:|---:|---:|
| Bronze | 1 | 759.200 | 468.000 | 291.200 | 0 |
| Bronze | 3 | 949.000 | 566.280 | 382.720 | 800.000 |
| Bronze | 6 | — | — | 234.312 | 13.700.000 |
| Bronze | 10 | — | — | -38.142 | 127.700.000 |
| Prata | 4 | — | — | 691.366 | conforme catálogo |
| Ouro | 6 | — | — | 2.884.700 | conforme catálogo |
| Diamante | 8 | — | — | 6.466.824 | conforme catálogo |
| Lendária | 10 | — | — | 6.624.904 | 127.700.000 |

O teto de demanda impede um estádio monumental de ser automaticamente lucrativo na Bronze. Investir cedo demais em infraestrutura concorre de verdade com contratações.

Foi corrigida uma divergência: Construções agora usa a função econômica canônica de manutenção e a divisão real do clube, em vez de uma fórmula local diferente.

## 8. Economia Prata/Ouro

- Prata frágil: média aproximada de 83 mil; P10 negativo em cenários ruins.
- Ouro frágil: média aproximada de 142 mil; P10 levemente negativo.
- Perfis razoáveis não quebraram nas simulações de carreira.
- Má gestão, folha exagerada ou infraestrutura excessiva podem produzir caixa negativo.

Conclusão: risco financeiro existe sem falência estrutural inevitável. Monitorar P10 após o lançamento.

## 9. Emissão mensal de gemas

Faixas de calibração validadas no simulador:

- Novo jogador: 10 gemas iniciais (pendente de migration remota).
- Primeiro mês ativo: 60–90, alvo 75.
- Casual recorrente: 25–40/mês.
- Ativo: 40–70/mês.
- Muito ativo: 70–100/mês.

Essas faixas são parâmetros de calibração; a instrumentação de todas as fontes reais ainda deve ser confrontada com o ledger remoto.

## 10. Consumo mensal de gemas

Sinks concorrentes modelados:

- refreshes: 0–45/mês;
- scouts: 0–40/mês;
- consumíveis: 0–60/mês;
- velocidades: 100–1.050, como objetivos permanentes;
- reserva para Premium: 600–1.500.

Como refresh e scout de Mercado não estão concluídos, os dois primeiros valores ainda são metas de produto, não consumo real comprovado.

## 11. Mercado

O mercado atual gera listagens determinísticas por treinador, temporada e divisão, calcula salário, teto de folha, reserva operacional e remove compras já efetuadas. A contratação registra telemetria server-side.

O mercado continua necessário para atingir as faixas altas de promoção. Compra com dinheiro do clube é mais lenta e preserva gemas.

## 12. Refresh

O ciclo de 12 horas e a sequência `grátis → dinheiro → 5 → 10 → 20 → 30 gemas` **não estão implementados de ponta a ponta**. A rotação atual ocorre no início da próxima temporada. Não foi criada uma implementação parcial para evitar inconsistência de ledger e abuso de Premium.

## 13. Scout

Existe scout ligado à Arena, mas não um scout posicional de Mercado completo para GOL/DEF/MEI/ATA. Portanto, o requisito está pendente.

## 14. Velocidade

Configuração implementada:

- 1×: grátis;
- 2×: 100 gemas;
- 4×: 300 gemas;
- Instantâneo: 800 gemas;
- Bundle: 1.050 gemas, descontando itens já possuídos e sem cobrança dupla.

Teste determinístico com mesma seed aprovou placar, eventos, XP, energia e moral idênticos em todos os modos. A velocidade altera apenas apresentação.

## 15. Pacotes

| Pacote | Gemas totais | Preço |
|---|---:|---:|
| Primeiro Reforço | 100 | R$ 7,90 |
| Saco | 450 | R$ 24,90 |
| Baú | 1.050 | R$ 49,90 |
| Cofre | 2.500 | R$ 84,90 |
| Tesouro | 6.000 | R$ 199,90 |

O Cofre foi posicionado como oferta central. Contudo, a função de compra real ainda informa que pagamentos não foram ativados. O catálogo não equivale a checkout funcional.

## 16. Equivalência aproximada R$/benefício

- R$ 7,90: libera 2× ou pequenos consumíveis.
- R$ 24,90: libera 2× + 4× ou combina conveniência e consumíveis.
- R$ 49,90: cobre o bundle completo de velocidades.
- R$ 84,90: 2.500 gemas; permite uma decisão importante e preserva saldo para outros sinks, sem comprar tudo.
- R$ 199,90: maior valor, precisa de monitoramento rigoroso contra concentração de vantagem.

Essas equivalências avaliam catálogo, não receita real, pois checkout não está ativo.

## 17. Perfil free

- Gemas estimadas: 45/mês em atividade normal.
- Tempo relativo: 100%.
- Acesso ao progresso esportivo: 100%.
- 2× exige poupança de alguns meses ou primeiro mês muito ativo.
- 4×, Instantâneo e Premium exigem planejamento longo.

Não existe RNG baseado em gasto nem bloqueio de divisões para o perfil gratuito.

## 18. Perfil R$ 10

- Aproximação: 145 gemas disponíveis no período considerado.
- Tempo relativo simulado: 91%.
- Benefício típico: 2× e pequenos consumíveis.
- Sem título ou promoção garantidos.

## 19. Perfil R$ 30–40

- Aproximação: 595 gemas.
- Tempo relativo: 72%.
- Pode combinar 2×, 4× e decisões de recuperação/mercado.
- Ainda precisa de gestão esportiva.

## 20. Perfil R$ 80–90

- Aproximação conservadora do simulador: 1.500 gemas; catálogo atual do Cofre oferece 2.500.
- Tempo relativo: 55%.
- Pode desbloquear velocidades e manter reserva estratégica.
- Não compra todas as evoluções e não garante vitória.

A discrepância entre 1.500 da simulação conservadora e 2.500 do catálogo deve ser observada em telemetria de gasto antes de qualquer aumento adicional.

## 21. Riscos encontrados

1. Migrations ainda não confirmadas no banco remoto.
2. Elencos CPU reais não auditados.
3. Refresh e scout de Mercado ausentes.
4. Premium diverge da regra final de frequência/moeda.
5. Checkout real desativado.
6. Telemetria aceita todos os eventos, mas nem todos possuem ponto de emissão.
7. Lint global possui dívida técnica extensa e antiga.
8. Uso amplo de APIs `inputValidator()` depreciadas.
9. P10 financeiro de Prata/Ouro precisa ser acompanhado com jogadores reais.

## 22. Alterações efetuadas

- Preservação integral do motor V1.
- Novos simuladores A–G, Premium, velocidades, perfis e estádio.
- 2× por gemas e bundle permanente sem cobrança duplicada.
- Gemas iniciais normalizadas para novos cadastros via migration preparada.
- Cofre ajustado para R$ 84,90.
- Construções alinhadas à economia canônica e divisão real.
- Telemetria server-side best-effort em construção, velocidade e contratação.
- Lista de eventos de telemetria ampliada e protegida por whitelist/limite diário.

## 23. Arquivos alterados nesta fase

Principais arquivos diretamente relacionados:

- `scripts/final-calibration-sim.ts`
- `scripts/gameplay-balance-sim.ts`
- `src/components/GameTelemetry.tsx`
- `src/integrations/supabase/types.ts`
- `src/lib/buildings.functions.ts`
- `src/lib/market.functions.ts`
- `src/lib/match.functions.ts`
- `src/lib/shop.functions.ts`
- `src/lib/shop.server.ts`
- `src/lib/telemetry.functions.ts`
- `src/lib/telemetry.server.ts`
- `src/routes/_authenticated/match.$id.tsx`
- `src/routes/_authenticated/shop.tsx`
- `package.json`

O worktree já continha outras alterações do projeto; nenhuma foi descartada ou sobrescrita.

## 24. Migrations

- `20260824120000_cpu_roster_balance.sql` — preparada, segura, aplicação remota não confirmada.
- `20260824130000_final_integration_calibration.sql` — preparada, aditiva, aplicação remota não confirmada.
- `20260820220034_atomic_career_activation.sql` — novos cadastros locais alinhados a 10 gemas; confirmar histórico remoto antes de publicar.

## 25. Testes executados

- `npm.cmd run gameplay:sim` — aprovado.
- `npm.cmd run balance:sim` — aprovado.
- `npm.cmd run career:sim` — aprovado.
- `npm.cmd run calibration:final` — aprovado.
- `npm.cmd run quality:check` — aprovado, incluindo build, jornada, economia, arena e projeto Supabase canônico.
- Dry-run de migration Supabase — bloqueado por erro de transporte remoto.

## 26. Build, typecheck e lint

- Build: aprovado.
- Validação funcional agregada: aprovada.
- Typecheck isolado: não executado porque o binário local não está instalado e a tentativa de resolver pelo registro foi bloqueada; o build TypeScript passou.
- Lint global: reprovado com aproximadamente 12,5 mil ocorrências, majoritariamente formatação/Prettier e dívida anterior. Nenhum `--fix` massivo foi aplicado para não reformatar o projeto inteiro e misturar mudanças não relacionadas.

## 27. Recomendações de telemetria pós-lançamento

O banco aceita os eventos:

`market_opened`, `market_refreshed`, `premium_viewed`, `premium_clicked`, `insufficient_balance`, `shop_opened`, `package_purchased`, `gems_spent`, `gems_earned`, `scout_used`, `speed_unlocked`, `speed_used`, `stadium_upgraded`, `player_signed` e `promotion`.

Já existem emissões para abertura de Mercado/Loja, páginas, sessão, contratação, estádio e desbloqueio de velocidade. Antes do lançamento comercial, ligar os eventos restantes exatamente nos pontos transacionais — especialmente refresh, Premium, falta de saldo, compra confirmada, gemas ganhas/gastas, scout e promoção.

Painéis mínimos:

1. retenção D1/D7/D30 por divisão;
2. funil `necessidade → mercado → loja → compra`;
3. gemas emitidas versus gastas por fonte/sink;
4. taxa de promoção por perfil de gasto;
5. falência/P10 financeiro por divisão;
6. uso de velocidades e efeito sobre retenção;
7. Premium visto, clicado e adquirido;
8. ROI real de estádio por nível/divisão.

## Próximos gates obrigatórios

1. Restabelecer o transporte da CLI e executar dry-run das migrations.
2. Aplicar as migrations sem reset e confirmar o histórico remoto.
3. Rodar consulta de auditoria dos elencos CPU reais por divisão.
4. Implementar refresh e scout completos com ledger atômico.
5. Integrar checkout real e webhook idempotente antes de vender pacotes.
6. Instrumentar todos os eventos transacionais faltantes.
7. Reexecutar a jornada completa no host Lovable antes de publicar.

Somente após esses gates o projeto deve mudar de `NO-GO` para `GO` comercial.
