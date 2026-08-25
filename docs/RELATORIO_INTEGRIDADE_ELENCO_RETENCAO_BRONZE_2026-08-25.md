# Integridade do elenco e retenção Bronze — 25/08/2026

## Veredito

**INÍCIO DA CARREIRA APROVADO LOCALMENTE.** A publicação continua bloqueada até a migration ser revisada/aplicada no Supabase e a auditoria somente leitura confirmar os dados reais.

## 1–6. Integridade do elenco

### Causa exata

O projeto tratava `owner_trainer_id` como prova suficiente de pertencimento. A regra canônica é dupla: `owner_trainer_id = trainer.id` e `owner_team_id = trainer.current_team_id`. Assim, uma criatura antiga, órfã de clube ou mantida após troca podia ser carregada e salva. A mensagem observada vinha de `lineup.functions.ts`: “Uma das criaturas selecionadas não pertence ao seu elenco.”

### Entradas responsáveis

- `lineup.functions.ts`: carregamento e validação somente por treinador.
- `player-side.server.ts`: montagem da partida por IDs, sem filtro de treinador/time/aposentadoria.
- `team_lineups`: titulares e banco em JSONB, sem FK individual; escrita direta permitia contornar o servidor.
- Venda/aposentadoria/troca de clube podem deixar IDs antigos no JSON.
- A compra de mercado vigente grava `owner_trainer_id`, mas não `owner_team_id`. Não foi alterada nesta tarefa porque mercado foi explicitamente excluído do escopo.

### Correção local

- Leitura filtra treinador, clube atual e `retired=false`.
- IDs antigos são removidos e a escalação é recomposta de forma segura.
- Salvamento usa `save_team_lineup_atomic`, valida todos os IDs antes do `UPSERT` e rejeita a operação inteira.
- Partida e prognóstico revalidam treinador, clube e aposentadoria.
- Preset secundário valida pertencimento, disponibilidade e duplicatas.
- Escrita direta `INSERT/UPDATE` em `team_lineups` é revogada; cliente usa a RPC.
- Mensagem passa a ser “Um jogador selecionado não está mais disponível para este clube”.

Não existe coluna/regra persistente de suspensão no esquema atual; nenhuma regra fictícia foi criada. Lesão permanece indisponibilidade válida e distinta de pertencimento.

### Dados remotos

Não auditados nem corrigidos nesta execução. Nenhum registro foi apagado. Antes da publicação, executar consulta somente leitura para medir: criatura do treinador com `owner_team_id` nulo/diferente, ID inexistente em titulares/banco, duplicata, aposentado ou lesionado selecionado.

### Testes

Cobertos localmente: 11 próprios; estrangeiro; órfão; aposentado; lesionado; duplicata; reload/saneamento; validação no início da partida; bloqueio de escrita direta. Resultado: `PASS lineup integrity`.

## 7–18. Bronze

### Força

- XI inicial após calibração: **46 OVR efetivo** nos seis starters.
- CPU Bronze: blocos explícitos de **39, 40, 41, 42, 43, 44, 44, 44, 44, 44, 45, 46 e 47**.
- Média dos adversários: **43,0 OVR**; vantagem inicial: aproximadamente **+3 OVR**.
- Elite Bronze: **46–47 OVR**.

Os seis clubes iniciais mantêm estilos/elementos diferentes, mas são normalizados pelo melhor XI natural 4-4-2.

### Resultados — 1.000 temporadas por perfil

| Perfil | R1–5 V/E/D | R6–13 V/E/D | R14–26 V/E/D | Promoção aproximada |
| --- | --- | --- | --- | --- |
| Sem mudanças | 48,9 / 23,6 / 27,6% | 47,0 / 24,3 / 28,8% | 47,5 / 24,2 / 28,3% | 28,2% |
| Boa escalação | 48,9 / 23,6 / 27,6% | 47,0 / 24,3 / 28,8% | 47,5 / 24,2 / 28,3% | 28,2% |
| +2 contratações | 53,3 / 22,7 / 24,0% | 50,8 / 23,4 / 25,9% | 51,6 / 23,3 / 25,1% | 43,8% |
| +4 contratações | 57,2 / 21,6 / 21,1% | 55,1 / 23,1 / 21,9% | 55,8 / 22,0 / 22,2% | 61,3% |
| Gestão otimizada | 60,4 / 21,0 / 18,6% | 59,5 / 21,2 / 19,3% | 59,9 / 20,9 / 19,2% | 76,8% |

Antes da calibração, o simulador anterior indicava 17,9% de promoção sem mudanças; o teste segmentado inicial desta tarefa, com XI 44, indicou apenas 7,0%. Depois: 28,2%.

### Calendário

A primeira temporada usava a ordem fixa do catálogo, criando uma sequência diferente e previsível por starter. Agora os 14 times são embaralhados por seed `trainer + season + division`, mantendo reprodutibilidade, ida/volta e neutralidade.

### XP e CPU

- Jogador não cresce excessivamente em 3–5 jogos: a primeira meia-estrela custa 800 XP, enquanto cinco vitórias rendem cerca de 500–525 XP por titular.
- A CPU usa elenco persistente e não recebe crescimento de OVR intra-temporada equivalente; sua evolução ocorre na transição. Isso permanece como ponto de observação, mas os blocos R1–5, R6–13 e R14–26 não mostraram colapso competitivo no simulador calibrado.
- OVR de referência do jogador: R1 46; R5 46; R10 46 na maioria dos casos sem treino; R20 pode começar a variar conforme vitórias/treino. CPU permanece no tier 39–47 durante a temporada.

## 19–23. Entrega e validação

### Arquivos alterados

- `src/lib/lineup.functions.ts`
- `src/lib/player-side.server.ts`
- `src/lib/starter-teams.ts`
- `src/lib/world/seed.server.ts`
- `scripts/lineup-integrity-check.ts`
- `scripts/bronze-retention-sim.ts`
- `supabase/migrations/20260826120000_lineup_team_integrity.sql`
- `package.json`

### Validação executada

- `lineup:integrity`: PASS.
- `bronze:retention`: 5 perfis × 1.000 temporadas.
- `gameplay:sim`: 5.000 partidas por cenário + 1.000 temporadas no simulador geral: PASS.
- `journey:check`: PASS.
- build de produção: PASS.
- `git diff --check`: PASS.

### Pendências antes de publicar

1. Revisar/aplicar a migration no Supabase.
2. Rodar auditoria somente leitura dos dados reais e corrigir apenas inconsistências comprovadas.
3. Tratar em tarefa separada o `owner_team_id` ausente na compra de mercado, pois mercado estava fora do escopo.
4. Testar uma conta real com lineup antigo, venda, lesão, reload e troca de temporada.

Nenhum commit, push ou deploy foi realizado.
