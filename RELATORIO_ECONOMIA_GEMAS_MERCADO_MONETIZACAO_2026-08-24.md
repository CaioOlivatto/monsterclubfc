# Relatório final — Economia de Gemas, Mercado e Monetização

## 1. Diagnóstico antes da implementação

O gameplay esportivo estava calibrado, mas a economia de gemas era fragmentada: mercado sem ciclo econômico definitivo, Premium ligado ao modelo antigo, missões sem emissão semanal controlada e movimentações sem um ledger único. A classificação inicial foi: gameplay **IMPLEMENTADO**; velocidades **IMPLEMENTADAS**; mercado, Premium, missões e ledger **PARCIAIS**; simulador econômico **NÃO IMPLEMENTADO**; pacote central **DIVERGENTE**.

## 2. O que já existia

Foram encontrados e reaproveitados mercado rotativo, jogadores Premium, Scout da Arena, velocidades 1×/2×/4×/instantâneo, bundle, loja de gemas, construções, descanso, energia, moral, treinamento, progressão, temporadas, telemetria e simuladores esportivos.

## 3. O que foi preservado

Foram preservados o motor esportivo V1, CPU persistente, estádio, construções, velocidades permanentes, desconto do bundle, dados existentes, RLS e a identidade visual do dashboard. Nenhum saldo existente foi reduzido ou reiniciado.

## 4. O que foi alterado

O saldo inicial passou a 10 gemas para novas academias; o mercado ganhou ciclo server-side de 12 horas; refresh progressivo; contratação normal por dinheiro **ou** gemas; Premium por gemas; limite por temporada/divisão; Scout posicional; recompensas semanais; título/promoção; pacote central de 2.500 para 2.200 gemas; instrumentação comercial.

## 5. O que foi criado

Foram criados `GEM_ECONOMY_CONFIG`, ledger de gemas, operações idempotentes, estado de ciclo do mercado, RPCs transacionais de refresh/Scout/contratação, missões semanais, simulador econômico e migration consolidada.

## 6. Fontes de gemas

Fontes controladas: onboarding (10 apenas na criação), missões semanais, bônus semanal, objetivos de temporada, promoção, campeonato e futura confirmação de pacote por webhook. Não há missão que exija compra ou gasto real.

## 7. Sinks

Mercado por gemas, Premium, refreshes, Scout posicional, velocidades, descanso, energia, moral, treinamento, acelerações, construção, construtor adicional, expansão e conversões existentes. Os novos sinks comerciais competem entre si para forçar escolha.

## 8. Gemas iniciais

Novas academias recebem 10 gemas. A migration altera somente o `DEFAULT`; não modifica contas nem saldos existentes.

## 9. Missões semanais

Pool com 10 tipos, incluindo cinco dias distintos, partidas, vitórias, gols, treino, mercado, contratação, construção, estratégia e substituição. A semana seleciona sete objetivos e não perde progresso ao faltar um dia.

## 10. Máximo semanal

As sete missões somam até 15 gemas e o bônus integral entrega 5, totalizando teto de 20 gemas por semana.

## 11. Objetivos de temporada

A infraestrutura aceita objetivos de posição, Top 8/5, promoção, Copa e título. As recompensas devem permanecer moderadas e usar chave idempotente por temporada para impedir duplicidade.

## 12. Títulos e promoções

Campeões recebem Bronze 20, Prata 30, Ouro 40, Diamante 50 e Lendária 75 gemas. Promoção rende 10 gemas. O crédito é atômico e idempotente por temporada/divisão.

## 13. Emissão mensal casual/ativo/muito ativo

Simulação calibrada: casual 32, ativo 58 e muito ativo 88 gemas/mês. Os valores ficam dentro das metas 25–40, 40–70 e 70–100.

## 14. Mercado 12h

O ciclo é calculado no servidor em janelas UTC de 43.200 segundos. Ao mudar o ciclo, lista, rotação, Scout e contador de refresh são reiniciados automaticamente, sem confiar no relógio do navegador.

## 15. Refresh

Lista inicial automática; primeiro refresh manual grátis; segundo em dinheiro do clube; terceiro 5 gemas; quarto 10; quinto 20; sexto e seguintes 30. O gasto não altera secretamente a qualidade.

## 16. Custo do segundo refresh em dinheiro por divisão

Bronze $25.000; Prata $60.000; Ouro $140.000; Diamante $320.000; Lendária $700.000.

## 17. Fórmula de preço de jogadores em gemas

Preço central considera divisão, OVR, faixa de estrelas, idade, valor de mercado e condição de prodígio. O resultado é arredondado em blocos de 5, com mínimo 12 e máximo 450 gemas. A fórmula está em `normalPlayerGemPrice` e não exige precificação manual.

## 18. Frequência Premium

Chance-base documentada de 14% por lista elegível. Refresh pago apenas cria outra lista; não garante Premium nem muda RNG por gasto.

## 19. Limite Premium

Uma contratação por combinação treinador + temporada + divisão, protegida por índice único e verificação transacional.

## 20. Preço Premium por divisão

Bronze 1.300; Prata 1.500; Ouro 1.700; Diamante 1.900; Lendária 2.200 gemas.

## 21. Impacto esportivo Premium

Preservado: chance aproximada de promoção Bronze 46,5%, Prata 45,1%, Ouro 44,2%, Diamante 43,9% e Lendária 43,5%. É desejável, mas não garante promoção.

## 22. Scout

Scout de mercado por GOL/DEF/MEI/ATA custa 10 gemas e reduz somente a incerteza de posição. Não promete qualidade e não é loot box.

## 23. Velocidades

1× grátis, 2× 100 gemas, 4× 300 e instantâneo 800. Desbloqueio permanente e sem cobrança duplicada foram preservados.

## 24. Bundle

Bundle completo custa 1.050 gemas e mantém desconto dos itens já possuídos.

## 25. Pacotes de gemas

100 = R$7,90; 450 = R$24,90; 1.050 = R$49,90; 2.200 = R$84,90; 6.000 = R$199,90. Checkout permanece sinalizado como indisponível enquanto não existir confirmação server-side real.

## 26. Análise específica do pacote R$84,90

2.200 gemas compram um Premium Lendário **ou** um Premium Bronze mais serviços, mas não Premium Bronze + bundle (2.350). Assim o pacote é relevante sem comprar simultaneamente tudo importante.

## 27. Perfil FREE

Recebe apenas emissão orgânica. Precisa escolher entre serviços recorrentes, velocidades e poupança longa para Premium; todo conteúdo esportivo permanece acessível.

## 28. Perfil R$10

Adiciona 100 gemas/mês, suficiente para conveniência limitada ou acelerar 2×, sem eliminar decisões de longo prazo.

## 29. Perfil R$25

Adiciona 450 gemas/mês, permitindo Scout/refresh frequentes ou formação de reserva para velocidade/Premium.

## 30. Perfil R$50

Adiciona 1.050 gemas/mês, equivalente ao bundle, mas ainda abaixo do Premium mais barato.

## 31. Perfil R$85

Adiciona 2.200 gemas/mês. Permite uma decisão grande: Premium de qualquer divisão elegível ou combinação de velocidades e serviços.

## 32. Perfil R$200

Adiciona 6.000 gemas/mês e acelera fortemente conveniência, mas Premium continua limitado por temporada/divisão e seu impacto esportivo permanece absorvido pelo balanceamento.

## 33. Tempo para desbloqueios FREE

Meses típicos (casual/ativo/muito ativo): 2× 5/3/3; 4× 14/10/8; instantâneo 36/27/21; bundle 48/35/28; Premium Bronze 59/43/34; Prata 68/50/40; Ouro 77/57/45; Diamante 86/63/50; Lendária 100/73/58. Poupador: respectivamente 3/2/2, 10/5/4, 25/14/9, 33/18/12, 41/23/15, 47/26/17, 53/30/20, 60/33/22 e 69/38/25.

## 34. Fontes x sinks

Emissão mensal 32/58/88 versus consumo orgânico simulado 10/28/50, deixando saldo líquido 22/30/38. Isso mantém utilidade, escassez e escolhas para jogadores ativos.

## 35. Inflação em 3/6/12 meses

Saldo FREE após consumo típico: casual 76/142/274; ativo 100/190/370; muito ativo 124/238/466. Não há expiração. A acumulação é moderada frente a Premium de 1.300–2.200 e bundle de 1.050.

## 36. Ledger

O novo ledger registra treinador, valor, direção, motivo, saldo anterior/posterior, data, referência e chave idempotente. Refresh, Scout, contratação, missões, campeonato e promoção usam operações atômicas. Auditoria detectou sete sinks legados ainda com débito direto; eles são pendência bloqueadora para conformidade total.

## 37. Telemetria

Instrumentados mercado aberto/atualizado, Premium visto/clicado, saldo insuficiente, loja aberta, gemas gastas/ganhas, Scout, velocidade, estádio, contratação e promoção. O evento `package_purchased` só deve ser emitido após webhook confiável.

## 38. Segurança

Saldo final é decidido por RPC server-side com `auth.uid()`, `FOR UPDATE`, checagem de saldo, RLS, revogação de acesso público e idempotência. Não há crédito por resposta do frontend nem lógica de relógio local.

## 39. Migrations

Migration preparada: `20260824140000_gem_market_economy.sql`. Ela foi validada localmente, mas **não foi aplicada no Supabase remoto nesta execução**. Não se deve publicar a interface dependente dela antes de `supabase db push` e smoke test remoto.

## 40. Arquivos alterados

Principais: `src/lib/gem-economy.ts`, `src/lib/market.server.ts`, `src/lib/market.functions.ts`, `src/lib/shop.server.ts`, `src/lib/club.functions.ts`, `src/lib/league.functions.ts`, páginas de Mercado/Clube/Dashboard/Loja, `scripts/gem-economy-sim.ts`, `package.json` e a migration de economia.

## 41. Testes executados

PASS: `economy:sim`, `gameplay:sim`, `balance:sim`, `career:sim`, `calibration:final` e `quality:check`. A simulação esportiva reproduziu os percentuais aprovados e confirmou determinismo das velocidades.

## 42. Build

`npm.cmd run build` concluído com sucesso. Existem apenas avisos de depreciação do validador, sem erro de compilação.

## 43. Pendências

Aplicar a migration remota; centralizar sete sinks legados ainda fora do ledger; executar smoke test autenticado no Supabase remoto; integrar provedor/webhook antes de habilitar checkout; validar responsividade final no Lovable após importação.

## 44. Riscos

Publicar antes da migration causa RPCs ausentes. Débitos legados fora do ledger reduzem rastreabilidade e podem falhar sem compensação. O pacote de R$200 exige monitoramento de retenção e conversão, embora os limites de Premium protejam a competição.

## 45. Recomendação GO/NO-GO comercial

**NO-GO comercial condicional neste momento.** O desenho econômico e a implementação principal estão aprovados, todos os simuladores e o build passam, mas o lançamento pago deve aguardar: migration remota aplicada, sinks legados centralizados, smoke test completo e webhook real idempotente. Após esses quatro gates, a recomendação passa a **GO**.
