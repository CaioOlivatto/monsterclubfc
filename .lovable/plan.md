
# Aplicar Tabela de Balanceamento (MVP v1)

Traz os números do jogo para os valores oficiais do documento: curva de XP lenta, economia por temporada, custos/tempos das construções, loja em gemas, velocidades permanentes e valor de mercado por estrelas.

## Escopo

### 1. Curva de XP e evolução (§1)

**`src/lib/xp.server.ts` — reescrever a distribuição de meia-estrelas**
- Curva `custoMeiaEstrela(n) = round(850 × 1,35^(n−1), 10)` — 10 degraus até 5★.
- Contar meia-estrelas ganhas com base em `xp` acumulado + `half_stars_earned`, incrementando `pending_half_stars` quando `xp ≥ soma_custos(half_stars_earned + pending + 1)`.
- CT de Treinamento: multiplicador `1 + 0,05 × nível` (era 0,10).
- Burst de XP: multiplicador variável (5/10/15%), não mais fixo em 2×.
- Reservas: `entrou no jogo → 50%` do XP do titular (independente de resultado); `não entrou → 25 XP só em vitória`.

**`src/lib/training.functions.ts` — usar mesma curva**
- Trocar a lógica ad-hoc "a cada 100 XP → +1 atributo" por incremento de `xp` puro; a subida de estrela vem exclusivamente via `pending_half_stars` na tela da criatura.
- Bônus CT ajustado para +5%/nível.
- Bônus CT Elemental: mantém treino de afinidade, mas com nova regra de teto por nível (ver §3).

### 2. Economia — Dinheiro (§2)

**`src/lib/league.functions.ts` — `playNextLeagueMatch`**
- Premiação por divisão (V/E/D):
  - bronze 15.000 / 6.000 / 2.000
  - prata 28.000 / 11.000 / 4.000
  - ouro 50.000 / 20.000 / 7.000
  - diamante 90.000 / 36.000 / 13.000
  - lendaria 160.000 / 64.000 / 24.000
- Bilheteria só quando o jogador é mandante: `capacidade × ocupação × 25`, ocupação = `0,70 + 0,03 × (9 − posição_atual)` (líder = 94%).
- **Remover** cobrança de salário por rodada.

**`src/lib/league.functions.ts` — `finishSeasonAndAdvance`**
- Bônus de posição (multiplicador × prêmio de vitória da divisão): 1º=×10, 2º=×6, 3º–4º=×3, 5º–6º=×1,5, 7º–8º=×0,5.
- Aplicar **salários por temporada**: soma `salário_por_estrela(criatura)` sobre todo o elenco.
  - Estrela ≈ `overall / 20`, arredondado para meia-estrela.
  - Faixas: 0–1★ $4k, 1,5–2★ $9k, 2,5–3★ $20k, 3,5–4★ $45k, 4,5–5★ $90k.
- Inserir transação "Salários da temporada X" no extrato.
- Rebaixamento: bronze nunca cai; lendária nunca promove.

### 3. Construções (§5)

**`src/lib/buildings.server.ts`**
- Novas tabelas de `COSTS` e `DURATIONS` por tipo, seguindo o doc:
  - `ct_treino`: custos [—, 120k, 350k, 900k, 2,2M]; tempos [—, 8h, 20h, 2d, 4d]; efeito +5%×nível XP.
  - `ct_elemental`: [80k, 250k, 650k, 1,5M, 3,2M]; [6h, 16h, 1,5d, 3d, 5d]; teto afinidade [5, 8, 11, 13, 15]%.
  - `estadio`: [—, 200k, 600k, 1,6M, 3,8M]; [—, 12h, 1d, 2,5d, 5d]; capacidades [8k, 15k, 25k, 40k, 60k].
  - `centro_medico`: [60k, 180k, 500k, 1,3M, 3M]; [5h, 14h, 1,5d, 3d, 5d]; +25%×nível recuperação.
- Novo helper `stadiumCapacity(level)` para uso na bilheteria (substitui o `stadiumIncome` fixo).
- `trainingXpMultiplier` passa a `1 + 0,05 × nível`.

**`src/lib/buildings.functions.ts` — `finishNowWithGems`**
- Acelerar: 1 💎 por cada **10 min** restantes (era 30 min).

**Teto de afinidade** — no `CT Elemental`, `trainCreature` respeita `cap = 5 + 3 × (nível−1)` (níveis 1–5 = 5/8/11/13/15) e não ultrapassa esse valor.

### 4. Mercado (§6)

**`src/lib/market.server.ts`**
- 24 listagens, rotação **por temporada**: passar `seasonNumber` como parte da seed; assinatura `generateMarketListings(trainerId, seasonNumber, count=24)`.
- Distribuição: 60% 0,5–1,5★, 30% 2–2,5★, 8% 3–3,5★, 2% 4★+.
- Preço base pela tabela de estrelas: 15k, 35k, 70k, 130k, 240k, 430k, 780k, 1.4M, 2.5M, 4.5M (com `mod_elemento = 1,0`).
- Venda: 90% do valor de mercado (já implementado, manter).

**`src/lib/market.functions.ts` e páginas** — passar `seasonNumber` (buscar `game_seasons` do treinador). `nextRotationTimestamp` vira estimativa baseada no fim previsto da temporada (ou "próxima temporada" como texto).

### 5. Loja de Gemas (§3.3, §4)

**`src/lib/shop.server.ts`**
- Pacotes de gemas: 100/R$9,90, 550(+10%)/R$44,90, 1.200(+20%)/R$89,90, 2.600(+30%)/R$179,90, 6.000/R$349,90.
- Construtor extra escalonado: 2º=250💎, 3º=600💎, 4º=1.200💎, teto 4.
- Expansão de elenco: 24→30 = 400💎; 30→36 = 900💎.
- Substituir item único `xp_burst` por três variantes: `xp_burst_5` (80💎), `xp_burst_10` (150💎), `xp_burst_15` (220💎), duração "1 temporada" (contador de 14 partidas de liga).
- Novos itens permanentes: `speed_4x` (300💎) e `speed_instant` (800💎), com efeito de flag na conta.

**`src/lib/shop.functions.ts`**
- `buyExtraBuilder` usa a tabela escalonada e valida `builders`.
- `expandRoster` usa os novos custos.
- `useItem` (xp_burst_*): grava `xp_burst_multiplier` e `xp_burst_matches_left = 14` no treinador.
- Nova função `buySpeedUnlock({ mode })` que credita `paid_4x` / `paid_instant` na academia.

### 6. Velocidade de partida (§4)

**Migração + `match.functions.ts` + `src/routes/_authenticated/match.$id.tsx`**
- Adicionar `academies.paid_4x boolean default false` e `academies.paid_instant boolean default false`.
- `payMatchSpeed` deixa de existir como "por partida"; a UI passa a ler flags na academia e a tela só exibe o CTA "Desbloquear" quando ainda não comprou.
- Botões 4x/Instantâneo continuam grátis pra quem já desbloqueou.

### 7. XP Burst com contador por temporada

**Migração** — adicionar em `trainers`:
- `xp_burst_multiplier real default 1.0`
- `xp_burst_matches_left integer default 0`
- Manter `xp_burst_until` (obsoleto, mas sem quebrar dados).

**`xp.server.ts`** — se `xp_burst_matches_left > 0`, aplica `xp_burst_multiplier` e decrementa 1 depois de creditar XP.

## Migração de banco (uma única)

```sql
ALTER TABLE public.academies
  ADD COLUMN IF NOT EXISTS paid_4x boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paid_instant boolean NOT NULL DEFAULT false;

ALTER TABLE public.trainers
  ADD COLUMN IF NOT EXISTS xp_burst_multiplier real NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS xp_burst_matches_left integer NOT NULL DEFAULT 0;
```

## Fora de escopo (respeitando o GDD Fase 2)

- `mod_elemento` no mercado (fica 1,0).
- Ocupação exata do estádio afinada por playtest — usamos a fórmula acima como ponto de partida.
- Recompensa semanal de gemas por login e bônus de campeão em gemas (o doc menciona 30/semana e +50 para campeão) — pode entrar depois; se quiser, incluo o +50💎 no `finishSeasonAndAdvance` do campeão da divisão do jogador nesta mesma passada.

## Verificação

- `bun run build` (typecheck via tsgo já roda).
- Sanidade: rodar `getBuildings`, `getShopState`, `getMarket` via `invoke-server-function` e conferir números.

---

**Perguntas antes de eu implementar:**
1. Confirmo o formato "1 temporada = 14 partidas de liga" para duração do XP Burst? (é a leitura mais fiel do GDD; alternativa seria "até o fim da temporada atual".)
2. Incluir o **bônus de +50💎 para o campeão da liga** já nesta rodada?
