
# Bestiário Mitológico — plano de implementação

Esta é uma mudança grande e cruzada (schema + gerador + motor + evolução + UI). Vou dividir em blocos para você aprovar antes de eu tocar em tudo.

## 1. Schema do banco (migração)

Adicionar em `creatures`:
- `species text` — nome da espécie (Fênix, Golem, Kraken…)
- `epithet text` — epíteto sorteado ("Escarlate", "de Basalto"…)
- `power_key text` — id do poder único da espécie
- `age integer default 18` — idade atual
- `career_season integer default 1` — 1..5
- `retired boolean default false`
- **6 novos atributos de linha:** `attr_defender`, `attr_passar`, `attr_atacar`, `attr_tecnica`, `attr_forca`, `attr_pique` (int)
- **3 novos atributos de goleiro:** `attr_maos`, `attr_concentracao`, `attr_elasticidade` (int)
- `is_goalkeeper boolean` (derivado da espécie no catálogo)

Os campos legados (`attack`, `defense`, `goalkeeper`, `physical`, `strength`) ficam por compatibilidade curta e depois removo, ou já removo agora — **preciso da sua confirmação** (ver §Perguntas).

## 2. Catálogo (novo arquivo `src/lib/bestiary.ts`)

- Lista das 60 espécies com origem, elemento, posição, atributos-base e `power_key`.
- Lista dos 100 epítetos por elemento + epítetos de elite ("o Lendário", "o Imortal", "o Invicto", "o Ancião").
- Função `rollCreature(species, rng)` → aplica variação ±12, gera epíteto, calcula Overall com pesos da §1.4.
- Função `computeOverall(attrs, position)` e `overallToStars(overall)` (tabela §1.3).
- Poderes: por ora só `power_key` + descrição textual; o efeito mecânico entra em uma segunda passada no motor (a maioria é passiva de aura/moral).

## 3. Gerador dos times iniciais

`src/lib/starter-teams.ts` reescrito para sortear 22 espécies do bestiário respeitando o perfil elemental do time (dominante 70% / apoio 20% / outros 10%) e a composição 3 GOL + 7 DEF + 7 MEI + 5 ATA. Sem mais Pyronix/Aquaron.

## 4. Mercado

`src/lib/market.server.ts` reescrito para gerar as 24 listagens da temporada a partir do bestiário, mantendo a distribuição de raridade por meia-estrela (§5 do balanceamento). Espécies com Overall base alto (Ymir, Golem, Quetzalcóatl, Argos) ficam mais raras.

## 5. Motor de partida

`src/lib/match-engine.server.ts` e `src/lib/player-side.server.ts` migram para o novo bloco de atributos:
- Ataque efetivo do lado = média ponderada de `atacar/tecnica/pique` dos ATA + `passar/tecnica` dos MEI.
- Defesa efetiva = `defender/forca` dos DEF + `defender` dos MEI.
- Goleiro usa `maos/concentracao/elasticidade`.
- Ciclo elemental e clima ficam iguais.
- Poderes: nesta primeira leva **só os passivos simples** (Pele de Brasa, Regeneração, Muralha, Voo Livre, Morto-vivo, Cem Olhos, Guardião do Tesouro). Os outros ficam registrados mas inertes até a próxima etapa — te aviso caso a caso.

## 6. Evolução e XP

- Nova curva em `src/lib/xp.server.ts`: `custo(n) = round(800 × 1.25^(n−1))`.
- `spendHalfStar` passa a oferecer os 6 atributos novos (ou 3, se goleiro) em vez dos 5 antigos.

## 7. Idade, aposentadoria e renascimento

- Ao final de cada temporada (`finishSeasonAndAdvance`): `age += 3`, `career_season += 1`.
- Aos 33: cria um alerta em `messages` e libera dois botões na ficha da criatura:
  - **Aposentar/vender** → credita `market_value × 0.75`, marca `retired = true`, remove do elenco.
  - **Renascer** → aplica a tabela §10.2 (estrelas alvo), recalcula XP acumulado para bater esse degrau, reseta `age=18`, `career_season=1`. Mantém espécie/elemento/poder/afinidades/nome.
- Valor de mercado decai a partir dos 27 anos (fator linear até 0.5 aos 33).
- Ao atingir 5★, ganha epíteto de elite (persistido em `epithet`).

## 8. UI

- **Ficha da criatura (`/creatures.$id`):** novo bloco de atributos (6 ou 3), badge de espécie/origem, poder com descrição, idade + carreira + aviso "última temporada", botões Aposentar/Renascer quando aplicável.
- **Roster, Escalação, Mercado:** exibir `species + epíteto`, elemento, estrelas (via `overallToStars`) e idade. Reordenar filtros para usar os novos atributos.
- **Onboarding:** o preview do time inicial mostra as espécies em vez de nomes gerados.

## 9. Migração de dados existentes (seu save atual)

Duas opções — **preciso da sua escolha**:

- **A. Wipe:** apaga criaturas atuais e força re-onboarding. Simples, mas perde progresso.
- **B. Conversão:** mapeia cada criatura antiga para uma espécie do bestiário pelo elemento + posição, converte atributos antigos nos novos (Ataque→Atacar, Defesa→Defender, Musculação→Força, Físico→Pique, com Passar/Técnica derivados), preserva XP/estrelas. Mais trabalhoso e um pouco impreciso, mas mantém seu save.

## Perguntas antes de eu escrever código

1. **Save atual:** wipe (A) ou conversão (B)?
2. **Poderes:** posso liberar só os passivos simples nesta rodada e deixar os ativos ("Investida", "Rasante", "Trovão", "Renovação"…) para uma segunda passada — ok?
3. **Colunas antigas** de atributos em `creatures` (`attack`, `defense`, `goalkeeper`, `physical`, `strength`): removo já na mesma migração, ou mantenho por compatibilidade uma versão?
