# Escolha de time inicial (6 times fixos)

Adiciona uma etapa após o cadastro do treinador: selecionar 1 entre 6 times pré-montados. O time escolhido vira o elenco do jogador; os outros 5 viram adversários da 5ª Divisão – Liga Bronze (mais 2 CPU gerados para fechar 8).

## 1. Especificação dos 6 times

Constantes fixas em `src/lib/starter-teams.server.ts`:

| # | Nome | Elemento dom. | Estilo | Cor | Escudo |
|---|------|---------------|--------|-----|--------|
| 1 | Titãs de Pedra | terra | defensivo | marrom/âmbar | 🗿 |
| 2 | Furacões do Vento | ar | ofensivo | lilás/branco | 🌀 |
| 3 | Chamas Rubras | fogo | ofensivo | vermelho/laranja | 🔥 |
| 4 | Marés Profundas | agua | equilibrado | azul | 🌊 |
| 5 | Lâminas de Gelo | gelo | defensivo | ciano/branco | ❄️ |
| 6 | Guardiões Mistos | mesclado | equilibrado | verde/dourado | 🛡️ |

Cada time = 22 criaturas (3 GOL, 7 DEF, 7 MEI, 5 ATA), soma ~41★, sendo ~10 entre 0,5–1,5★, ~9 entre 2–2,5★, ~3 destaques 3★. Distribuição por elemento: dominante ~70%, apoio ~20%, resto ~10%; Guardiões Mistos ~20% cada elemento. Viés de atributos:
- defensivo: +defesa/goleiro/strength
- ofensivo: +attack/physical
- equilibrado: distribuição plana

Nomes das criaturas: prefixo temático por elemento + sufixo do gerador existente, com seed determinística por time para reprodutibilidade.

## 2. Backend

**`src/lib/starter-teams.server.ts`** (novo) — catálogo dos 6 times e `generateStarterRoster(teamKey, ownerTrainerId | null)` retornando 22 rows de criatura com atributos, elemento e afinidade inicial já ajustados.

**`src/lib/creatures.functions.ts`**
- `createInitialTrainer` deixa de gerar as 18 criaturas aleatórias e não cria mais a Liga; retorna `trainerId` sem elenco.
- Nova `listStarterTeams`: devolve os 6 cards com resumo (força total, ataque médio, defesa médio) — sem criaturas.
- Nova `getStarterTeamDetail({ key })`: devolve as 22 criaturas do time (para o modal de detalhe).
- Nova `chooseStarterTeam({ key })`:
  - valida que o treinador não tem criaturas ainda,
  - insere as 22 criaturas do time escolhido como `owner_trainer_id = trainer.id`,
  - cria a competição de liga (bronze / 5ª divisão) para o treinador,
  - insere o time do jogador com nome, cor, escudo, elemento dominante,
  - insere os outros 5 times como CPU na mesma competição, cada um com seu elenco de 22 criaturas (`owner_trainer_id = null`, `cpu_team_key` para identificar),
  - gera mais 2 times CPU aleatórios pra fechar 8,
  - cria `standings` zeradas e o `schedule` round-robin duplo (reaproveita `generateSchedule`),
  - $400.000 e 50💎 (sobrescreve os 300k do onboarding se necessário — ajustar `createInitialTrainer` para já criar academia com esses valores).

## 3. Migração de banco

- `teams`: adicionar `color text`, `emblem text`, `dominant_element element_type`, `starter_key text` (identifica qual dos 6 times fixos, útil pra idempotência e UI).
- `creatures`: adicionar `cpu_team_id uuid references teams(id) on delete cascade` para associar criaturas CPU dos 5 times rivais (nullable; jogador continua usando `owner_trainer_id`).
- GRANTs mantidos; políticas RLS existentes continuam válidas — CPU creatures ficam acessíveis via `teams.trainer_id = auth.uid()` na competição do jogador (adicionar policy de SELECT em creatures via `cpu_team_id` cuja team pertence à competição do treinador).

## 4. Frontend

**`src/routes/_authenticated/onboarding.tsx`** — vira wizard de 2 passos:
1. Passo 1 (atual): nome do treinador + academia → chama `createInitialTrainer`.
2. Passo 2 (novo): grid dos 6 times (`listStarterTeams`). Cada card: escudo grande, nome, badge de elemento, badge de estilo, força (⭐ soma) e resumo ATK/DEF médios, cor de acento. Clique → dialog com lista das 22 criaturas (nome, elemento, posição, estrelas). Botão "Escolher este time" → `chooseStarterTeam` → `/dashboard`.

Se o jogador atualizar sem escolher, ao voltar em `/` a lógica em `src/routes/index.tsx` precisa distinguir "tem trainer mas não tem criaturas" → mandar pra `/onboarding` passo 2. Ajustar `getMyTrainer` para retornar também `has_roster`.

## 5. Impactos

- `createFriendlyMatch`, `startLeague` etc. continuam funcionando — mas `startLeague` não é mais chamada pelo onboarding (fica só como fallback manual). O jogador já entra na liga direto pelo `chooseStarterTeam`.
- Textos: divisão sempre "5ª Divisão – Liga Bronze".

## Detalhes técnicos

- Todos os inserts em uma única server function transacional (múltiplos `insert`; sem `rpc`). Se qualquer passo falhar, cleanup manual das criaturas/times criados antes de rethrow.
- Seed determinística por `starter_key` para o gerador de nomes das criaturas → mesma escolha sempre produz o mesmo elenco (facilita QA).
- 5 times rivais + jogador = 6; +2 CPUs gerados via `pickCpuTeamNames` para totalizar 8.

## Verificação

- `bun run build`.
- Fluxo manual: novo usuário → onboarding passo 1 → passo 2 → escolher Titãs → dashboard mostra 22 criaturas, $400k, 50💎, liga Bronze com 8 times.

## Fora de escopo

- Editar cor/escudo do time depois de escolhido.
- Balancear afinidades elementais iniciais além do dominante (afinidades ficam em 0 exceto pequeno bônus no elemento dominante das criaturas do estilo ofensivo do Fogo, conforme GDD).
