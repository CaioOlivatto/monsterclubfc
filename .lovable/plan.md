# Mundo Completo — 5 Divisões / 70 Times

## Objetivo
Popular o mundo inteiro com 70 times globais (14 por divisão, 26 criaturas cada), simular todas as divisões a cada rodada e conectar promoção/rebaixamento a esse pool.

## 1. Schema (migração)

Alterações em `teams`:
- `division_id INT NOT NULL` (1=Lendária … 5=Bronze) — passa a ser MUTÁVEL
- `is_cpu BOOLEAN NOT NULL DEFAULT true`
- `element_dominant` (enum já existente) — cor primária/secundária em `colors JSONB`
- Remover unicidade por competição; time é global

Nova tabela `world_state`:
- `season_id`, `current_round`, `initialized_at`
- controla a rodada atual global (todas as divisões avançam juntas)

Ajuste em `standings`:
- passa a chavear por `(season_id, division_id, team_id)` em vez de `competition_id`
- índice por divisão + pontos

Ajuste em `matches`:
- `division_id INT`, `round INT`, `is_player_match BOOLEAN`
- `simulated_summary BOOLEAN` — quando true, sem `match_events`

Ajuste em `creatures`:
- garantir `team_id` obrigatório (já é), permitir criaturas de times CPU sem `trainer_id`

Todas com GRANT correto para `authenticated` e `service_role`. Times/criaturas CPU têm política SELECT pública (para o jogador ver classificação e escalação inimiga).

## 2. Seed do mundo (server function `seedWorld`)

Roda uma vez no primeiro onboarding após limpar mundo antigo:
- Insere os 70 times fixos da lista (nome, elemento, cores, divisão)
- O time escolhido pelo jogador ocupa o slot dos 6 iniciais na 5ª Divisão (substitui aquele CPU)
- Para cada time: gera 26 criaturas (3 GK / 8 DEF / 8 MID / 7 ATK)
  - ~50% do elemento dominante (uniforme se Misto)
  - estrelas conforme perfil da divisão (tabela do prompt)
  - idades distribuídas: 6×18 / 6×21 / 5×24 / 5×27 / 4×30
  - espécie do bestiário + epíteto elemental
- Gera calendário de 26 rodadas (round-robin duplo) por divisão
- Cria `world_state` com `current_round = 1`

Arquivo: `src/lib/world/*.server.ts` (dados + geradores) + `src/lib/world.functions.ts` (thin wrapper).

## 3. Simulação global por rodada

Nova função `advanceWorldRound`:
1. Simula a partida do jogador com engine completo (eventos minuto a minuto) — o que já existe
2. Para cada uma das 5 divisões, simula as 6 outras partidas da rodada com **`simulateSummary`** — só placar/gols (rápido, sem eventos)
3. Atualiza `standings` de todas as divisões
4. Incrementa `world_state.current_round`

Engine resumido: reaproveita cálculo de força ofensiva/defensiva por time (média ponderada de overall dos 11 melhores) + ciclo elemental + variação Poisson para placar. ~5ms por partida CPUxCPU.

## 4. Fim de temporada

Função `finishSeasonAndAdvance` (atualiza a existente):
- Para cada divisão em paralelo:
  - Top 3 → `division_id - 1` (exceto Lendária: premiação extra)
  - Bottom 3 → `division_id + 1` (exceto Bronze: só permanecem)
- **Gestão CPU** (nova, `manageCpuRoster`):
  - Para cada time CPU: aposenta criaturas de 33 anos (renascer se ≥2★ após perda, senão vender)
  - Repõe até 26 respeitando teto salarial e perfil da divisão
- Zera standings, gera novo calendário, incrementa `season_id`

## 5. UI — tela `/league`

Adicionar `<Select>` no topo com as 5 divisões (default: divisão do jogador).
- Destacar linha do jogador
- Verde nas 3 primeiras posições (promoção), vermelho nas 3 últimas (rebaixamento)
- Ocultar bandas na Lendária (topo, só verde) e Bronze (piso, só vermelho)
- Manter aba de calendário funcionando por divisão selecionada

## 6. Performance

- Simulação resumida CPUxCPU sem inserir `match_events`
- Batch INSERT/UPDATE em standings (uma query por divisão)
- Cache de força dos times por rodada
- Alvo: <500ms para simular 34 partidas CPUxCPU + a do jogador

## Arquivos técnicos

Novos:
- `src/lib/world/teams-catalog.ts` — 70 times fixos (nome, elemento, cores, divisão)
- `src/lib/world/seed.server.ts` — geradores de elenco/calendário
- `src/lib/world/simulate.server.ts` — engine resumido
- `src/lib/world/cpu-manager.server.ts` — aposentadorias e reposição CPU
- `src/lib/world.functions.ts` — thin wrapper (`seedWorld`, `advanceWorldRound`, `getDivisionStandings`)

Modificados:
- Migração schema (`teams.division_id`, `world_state`, `standings` reindex)
- `src/lib/creatures.functions.ts` (onboarding chama `seedWorld` na primeira vez)
- `src/lib/league.functions.ts` (`playNextLeagueMatch` → chama `advanceWorldRound`)
- `src/lib/season.functions.ts` (fim de temporada com gestão CPU global)
- `src/routes/_authenticated/league.tsx` (seletor + destaques visuais)

## Escopo NÃO incluído (fica para pendências seguintes)
- Destaque de idade ≥30 no `/roster` (pendência #2)
- Migrar bestiário para tabela `species` (pendência #3)

## Ordem de execução
1. Migração schema
2. Catálogo dos 70 times + geradores (código)
3. `seedWorld` + integração no onboarding
4. Engine resumido + `advanceWorldRound`
5. Ajuste do fim de temporada + gestão CPU
6. UI da liga com seletor
7. Verificação: contagem, distribuição de estrelas, rodada global

Confirma que posso executar assim?