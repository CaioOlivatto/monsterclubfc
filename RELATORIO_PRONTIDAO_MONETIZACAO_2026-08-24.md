# 1 STATUS GERAL

**NO-GO técnico para playtest pago.** O código local compila e os testes estruturais/simuladores passam, mas as migrations não foram validadas nem aplicadas no Supabase remoto e não foi possível executar o smoke test autenticado remoto. O sistema pode continuar em desenvolvimento e playtest gratuito controlado, sem checkout real.

# 2 MIGRATIONS

Auditadas: `20260824120000_cpu_roster_balance.sql`, `20260824130000_final_integration_calibration.sql`, `20260824140000_gem_market_economy.sql` e a nova `20260824150000_monetization_readiness.sql`. A ordem local é consistente e a última migration é aditiva: não reseta banco, não trunca tabelas, não reduz saldos existentes e não recria projeto/schema. Projeto local vinculado a `gwqvninbrmrsabuseqbx`. O dry-run remoto falhou antes de listar o plano, com `LegacyDbConfigLoginRoleNetworkError / TransportError`. Nenhuma migration remota foi aplicada e o histórico remoto não pôde ser confirmado.

# 3 BANCO

Localmente foram preparados `gem_ledger_baselines`, colunas adicionais em `payment_orders`, índice único parcial por transação do provedor, RPCs especializadas de débito/crédito e view de reconciliação. Grants sensíveis foram fechados: função genérica de movimentação fica apenas para `service_role`, e confirmação de pagamento também. RLS, defaults, objetos existentes e registro das migrations ainda precisam ser conferidos no banco remoto.

# 4 LEDGER

Migrados nesta fase: conclusão de obra, aceleração de timer, descanso, reunião de moral, cura, expansão de construtores/elenco, velocidades e prêmios de título/promoção. Mercado/refresh/Scout/Premium já possuem débito e ledger atômicos na migration de economia. A reconciliação foi preparada pela view `gem_reconciliation`. Permanecem funções históricas em migrations antigas com `UPDATE academies SET gems=...` (Clube mensal, Arena e funções financeiras antigas); como não houve aplicação/inspeção remota, ainda não é possível provar quais definições estão efetivamente ativas. Isso mantém o gate aberto.

# 5 SMOKE TEST

Onboarding: somente validação automatizada local. Partida: simuladores locais aprovados. Mercado/refresh/dinheiro/gemas/Premium/Scout/velocidades/missões/promoção/concorrência: contratos e cenários estruturais aprovados localmente pelo `monetization:readiness`, mas não executados como jornada autenticada real no Supabase remoto. Nenhuma conta real foi alterada.

# 6 SEGURANÇA

Camada canônica usa bloqueio de linha, saldo insuficiente rejeitado antes do débito, transação única e `idempotency_key`. Testes locais cobrem saldo negativo, replay, clique duplo, concorrência e webhook duplicado. A função genérica foi revogada de `authenticated`, `anon` e `PUBLIC`. Segurança remota ainda não comprovada.

# 7 PAGAMENTO

Nenhum provedor real foi ativado. Foi preparada arquitetura independente de provedor: pedido pendente, catálogo fechado, confirmação exclusiva por `service_role`, validação de SKU/valor/moeda, unicidade de transação e crédito via ledger. Pacotes e preços foram preservados. Checkout, assinatura de webhook, pagamento falho e refund dependem da escolha/configuração de um provedor em sandbox. `refund` está apenas como estado/risko documentado; não há débito automático pós-estorno.

# 8 TELEMETRIA

O catálogo admite `market_opened`, `market_refreshed`, `premium_viewed`, `premium_clicked`, `insufficient_balance`, `shop_opened`, `package_purchased`, `gems_spent`, `gems_earned`, `scout_used`, `speed_unlocked`, `speed_used`, `stadium_upgraded`, `player_signed` e `promotion`. `package_purchased` é emitido somente na confirmação server-side preparada. Emissão real remota ainda precisa de smoke test.

# 9 TESTES

Passaram localmente: `economy:sim`, `gameplay:sim`, `balance:sim`, `career:sim`, `calibration:final`, `quality:check`, `balance:check`, `monetization:check`, `monetization:readiness`, `arena:check`, `supabase:check` e `journey:check`. O teste de prontidão valida catálogo, ledger, replay, concorrência e webhook duplicado.

# 10 BUILD

`npm run build` e o build incluído em `quality:check` passaram. Restam avisos não bloqueantes de API depreciada `inputValidator()` e configuração de paths do Vite.

# 11 ARQUIVOS ALTERADOS

Nesta fase: `package.json`, `scripts/monetization-readiness-check.ts`, `src/lib/buildings.functions.ts`, `src/lib/creatures.functions.ts`, `src/lib/league.functions.ts`, `src/lib/morale-training.functions.ts`, `src/lib/rest.functions.ts`, `src/lib/shop.functions.ts`, `src/lib/training.functions.ts`, `supabase/migrations/20260824150000_monetization_readiness.sql` e este relatório. O worktree contém outras alterações anteriores do usuário/projeto, preservadas sem limpeza ou sobrescrita.

# 12 MIGRATIONS NOVAS

`20260824150000_monetization_readiness.sql`: camada privada canônica, RPCs especializadas, baseline/reconciliação, proteção de grants e esqueleto seguro de pedidos/confirmação de pagamento. Não aplicada remotamente.

# 13 PENDÊNCIAS

Restabelecer conexão CLI; executar dry-run; conferir histórico remoto; aplicar migrations com aprovação após plano seguro; validar tabelas/RPCs/RLS/grants/defaults; identificar definições legadas efetivamente ativas; executar smoke test remoto autenticado completo; selecionar provedor e configurar sandbox/webhook assinado; testar refund conforme decisão de produto.

# 14 BLOQUEADORES

Bloqueador principal: `LegacyDbConfigLoginRoleNetworkError / TransportError` ao inicializar o login role do Supabase. Sem conexão remota não há prova de migration, segurança, reconciliação ou smoke test. Bloqueador comercial: nenhum provedor/sandbox/webhook real configurado. Nenhum commit, push, merge, deploy ou publicação Lovable foi realizado.

# 15 PASSO EXATO NECESSÁRIO PARA COMEÇAR PLAYTEST COM 20–50 USUÁRIOS

Primeiro, recuperar a conectividade do Supabase CLI para `gwqvninbrmrsabuseqbx`; depois executar `supabase db push --linked --dry-run --include-all --skip-vault`, revisar o plano e aplicar apenas se ele listar exclusivamente as migrations esperadas. Em seguida, executar uma jornada autenticada remota com conta de teste, reconciliar saldo/ledger e repetir os cenários de concorrência. Para playtest gratuito, liberar somente após esses passos. Para playtest pago, adicionalmente configurar um provedor em sandbox, validar assinatura e replay do webhook e somente então habilitar checkout para o grupo de 20–50 usuários.
