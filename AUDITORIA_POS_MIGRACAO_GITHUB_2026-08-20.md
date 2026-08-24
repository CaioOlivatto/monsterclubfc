# Auditoria pós-migração — Monster Club FC

Data: 20/08/2026
Escopo: código local, `origin/main`, integração Lovable/GitHub, autenticação Supabase, telas críticas, recursos visuais e gates de qualidade.
Regra desta auditoria: nenhuma publicação, alteração de banco, commit, push ou merge.

## 1. Veredito executivo

O projeto visual e funcional **não foi apagado**. A versão local auditada e a versão publicada em `origin/main` apontam para o mesmo commit (`84eebff`). As rotas, componentes, migrações e artes principais continuam no repositório.

O defeito estrutural é outro: a migração de autenticação ficou **parcial**. Algumas leituras principais recebem e validam diretamente o token da sessão Supabase do navegador, mas muitas telas e ações ainda usam o middleware antigo, que depende do transporte de sessão do host. Isso explica o comportamento aparentemente aleatório:

- uma tela carrega, mas a ação do botão retorna `Unauthorized: Invalid token`;
- o Elenco aparece, mas a Escalação, Mercado ou Construções recebem dados vazios;
- a página entra em `Carregando...` ou em `Reorganizando...`;
- o mesmo usuário pode parecer possuir clube, mas uma consulta subsequente não encontra treinador, elenco ou recursos;
- correções isoladas funcionam localmente e falham no Lovable.

Não é seguro continuar corrigindo tela por tela. É necessário substituir o caminho de autenticação em **todas as funções protegidas**, criar testes de jornada e impedir publicação quando esses testes falharem.

## 2. Evidências de preservação

### Git e Lovable

- Branch auditada: `codex/migrate-backend-supabase`.
- Commit local auditado: `84eebff860b240c452081ff2fe3a672afc933902`.
- `origin/main`: `84eebff860b240c452081ff2fe3a672afc933902`.
- Divergência entre o conteúdo auditado e `origin/main`: nenhuma.
- A branch local chamada `main` está antiga, mas isso não representa perda no GitHub. O Lovable acompanha o `origin/main`, que contém o trabalho recente.

### Telas e componentes presentes

Foram encontrados no repositório Dashboard, Onboarding, Elenco, Escalação, Partida, Mercado, Construções, Liga, Copa, Liga Mundial, Copa Mundial, Finanças, Arena, Carreira, Clube Mensal, Ranking, Loja, Mensagens e detalhes/treinos de jogadores.

### Artes presentes

O repositório contém, entre outros:

- fundo do estádio e logotipo do jogo;
- escudos dos seis times iniciais;
- brasões de divisões;
- cards do Dashboard;
- artes de torneios;
- 20 imagens de construções, incluindo CT, Centro Médico e os dez níveis do Estádio.

Conclusão: a identidade criada não desapareceu. Quando uma tela branca ou antiga aparece, a causa é carregamento, autenticação, dados ou versão publicada — não ausência geral dos arquivos.

## 3. Arquitetura encontrada

| Camada | Estado atual | Consequência |
| --- | --- | --- |
| Frontend | React/TanStack Start, hospedado no Lovable | Estrutura visual preservada |
| Repositório | GitHub, `origin/main` conectado ao Lovable | Sincronização existe e não deve ter histórico reescrito |
| Banco/Auth | Supabase `gwqvninbrmrsabuseqbx` | JWT do navegador é a identidade correta |
| Funções protegidas | Dois padrões simultâneos de sessão | Principal origem dos erros |
| Testes de produto | Nenhum teste `test/spec` ou Playwright no repositório | Fluxos quebrados chegam à publicação |
| Build | Compila com sucesso | Só prova tipagem/empacotamento, não prova que o jogo funciona |
| Lint | Falha com 12.198 problemas | Gate de qualidade não está pronto |
| Simulações | Balanceamento, monetização e Arena passam | Regras numéricas isoladas estão preservadas |

## 4. Falha estrutural de autenticação

### Caminho novo, já existente

Há funções `WithSession` que recebem o token do navegador e o validam diretamente no Supabase. Foram encontradas para:

- Dashboard principal;
- recuperação de carreira;
- Elenco;
- Escalação: carregar e salvar;
- Prognóstico;
- próxima partida oficial;
- Partida: carregar;
- Construções: carregar, iniciar e concluir;
- Mercado: versão local ainda não publicada para carregar, comprar e vender.

### Caminho antigo, ainda predominante

Muitas funções continuam usando o middleware implícito do servidor. O arquivo `src/integrations/supabase/auth-middleware.ts` ainda possui os pontos que lançam `Unauthorized: Invalid token`.

Áreas ainda integral ou parcialmente dependentes do caminho antigo:

- Onboarding e escolha de time;
- Dashboard secundário: amistoso, gemas, Liga, escalação e pré-carregamento do Mercado;
- iniciar, jogar e avançar Liga;
- Copa;
- Liga Mundial e Copa Mundial;
- ações de jogar partida na Escalação;
- Arena, duelos, escudos, reparos e olheiros;
- Carreira e propostas;
- Clube Mensal;
- Finanças;
- Ranking;
- Mensagens;
- Loja;
- detalhe, treino, descanso, cura, moral, aposentadoria e renascimento de jogadores;
- ações de moral do Elenco.

### Por que os reparos anteriores não encerraram o problema

As correções anteriores migraram funções específicas. Isso permitiu, por exemplo, enxergar o Elenco, mas não garantiu que o botão `Jogar`, a simulação, o carregamento da Partida e o prognóstico utilizassem a mesma sessão. Cada jornada atravessa várias funções e basta uma continuar no padrão antigo para quebrar o fluxo.

## 5. Matriz de risco por tela

Legenda: **Crítico** = impede jogar; **Alto** = perda de função/dados percebida; **Médio** = degradação sem bloquear a carreira.

| Tela/fluxo | Visual no repositório | Sessão atual | Risco | Situação |
| --- | --- | --- | --- | --- |
| Login | Sim | Supabase no navegador | Crítico | Login pode funcionar, mas páginas protegidas ainda divergem depois |
| Onboarding | Sim | Mista/antiga | Crítico | Detalhes, escolha e criação podem falhar ou duplicar estado |
| Dashboard | Sim | Mista | Crítico | Cabeçalho carrega pelo caminho novo; consultas auxiliares ainda podem travar o painel |
| Elenco | Sim | Mista | Alto | Lista principal usa sessão direta; ações de moral ainda não |
| Escalação | Sim | Mista | Crítico | Carrega/salva por sessão direta, mas jogar competições ainda usa funções antigas |
| Partida | Sim | Mista | Crítico | Leitura principal direta; fluxo de criação/simulação pode entregar token inválido |
| Mercado | Sim | Correção local pendente | Alto | Versão remota ainda não tem toda a correção local direta |
| Construções | Sim, com 20 artes | Direta nas ações principais | Alto | Precisa validar ausência de registros e consistência dos dados criados |
| Liga | Sim | Antiga | Crítico | Iniciar, carregar e finalizar temporada permanecem vulneráveis |
| Copa | Sim | Antiga | Alto | Carregamento e simulação vulneráveis |
| Mundiais | Sim | Antiga | Alto | Carregamento e simulação vulneráveis |
| Finanças | Sim | Antiga | Alto | Pode exibir vazio ou falhar mesmo com clube válido |
| Arena | Sim | Antiga | Alto | Todas as ações principais vulneráveis |
| Carreira | Sim | Antiga | Alto | Propostas e transferências vulneráveis |
| Clube Mensal | Sim | Antiga | Alto | Ativação e resgates não possuem o contrato novo |
| Ranking | Sim | Antiga/Edge Function | Médio/Alto | Precisa alinhar autenticação da tela e da função publicada |
| Loja | Sim | Antiga | Alto | Compra/ativação não pode depender de sessão instável |
| Mensagens | Sim | Antiga | Médio | Pode falhar ou exibir vazio |
| Jogador/treinos | Sim | Antiga | Alto | Ações econômicas e progressão vulneráveis |

## 6. Dados e segurança

### Já coberto

- Não foi encontrada chave `service_role` no frontend.
- O uso encontrado de `SUPABASE_SERVICE_ROLE_KEY` está em código de servidor/Edge Function.
- As migrações possuem correspondência de 41 criações de tabela e 41 ativações de RLS. Isso é um bom sinal de cobertura estrutural.
- Variáveis `VITE_*` encontradas são destinadas ao navegador e devem conter apenas URL, identificador e chave publicável.

### Precisa de validação antes de produção

- Testar as políticas RLS de cada domínio com dois usuários reais distintos: um usuário não pode ler ou alterar clube, elenco, finanças, partidas ou compras do outro.
- Verificar autorização negativa de todas as funções `WithSession` e das Edge Functions.
- Confirmar que nenhuma função econômica confia em valor, preço, saldo ou propriedade enviados pelo navegador.
- Revisar rate limit de cadastro e e-mail no Supabase para evitar o erro `email rate limit exceeded` sem bloquear usuários legítimos.

Nenhuma política RLS, secret, chave, infraestrutura ou configuração do Supabase foi alterada nesta auditoria.

## 7. Qualidade e desempenho

### Resultados executados

- Build de produção: aprovado.
- `balance:check`: aprovado.
- `monetization:check`: aprovado.
- `arena:check`: aprovado.
- Lint: reprovado com 12.198 problemas, sendo a maioria formatação, mas também com tipos `any` e outros alertas reais.
- Testes automatizados de rotas/jornada: inexistentes.

### Interpretação correta

O build aprovado não garante login, sessão, RLS, dados, botões ou navegação. Os três checks aprovados garantem somente regras numéricas isoladas. Hoje não existe um teste que faça:

`cadastrar → entrar → escolher time → confirmar 26 jogadores → abrir painel → escalar → jogar → concluir partida → atualizar classificação e finanças`.

Sem esse teste, o mesmo defeito pode retornar a cada publicação.

### Desempenho

Os carregamentos lentos são agravados por:

- recuperação/sincronização de sessão na entrada de páginas protegidas;
- tentativas repetidas após falhas de token;
- telas que fazem várias consultas independentes e misturam contratos de autenticação;
- carregamentos em cascata no Dashboard e na Escalação;
- ausência de orçamento de desempenho automatizado.

Antes de otimizar consultas pontuais, é necessário estabilizar a sessão; hoje parte do “tempo de carregamento” é espera por uma operação que nunca concluirá corretamente.

## 8. Plano de recuperação definitivo

### Fase 0 — congelar publicação

- Não publicar novas versões até o fluxo mínimo passar integralmente.
- Preservar os três arquivos locais já alterados e não sobrescrever o trabalho do usuário.
- Não apagar o projeto Lovable nem reescrever histórico Git.

### Fase 1 — um único contrato de autenticação

- Criar uma única camada cliente para obter a sessão Supabase válida.
- Criar uma única camada servidor para validar essa sessão e fornecer `userId`/cliente autorizado.
- Migrar **todas** as funções protegidas; nenhuma rota pode continuar dependendo implicitamente do cookie/proxy do Lovable.
- Remover o caminho antigo somente depois que a busca automática não encontrar consumidores.
- Tratar sessão expirada de forma única: renovar uma vez; se falhar, voltar ao login com mensagem clara.

Critério de aceite: busca no código não encontra telas de produção usando o middleware antigo.

### Fase 2 — consistência transacional do início da carreira

- Escolha do time deve criar/confirmar treinador, academia, time, 26 jogadores, escalação-base, construções iniciais, temporada e recursos em operação atômica/idempotente.
- Uma nova tentativa não pode duplicar nem deixar o clube parcial.
- Ao abrir qualquer tela, dados essenciais ausentes devem ser reparados por uma única rotina explícita e observável, não por reparos diferentes espalhados.

Critério de aceite: interromper e repetir o onboarding em diferentes momentos sempre termina em um único clube completo.

### Fase 3 — testes de jornada

Criar testes automatizados para:

1. cadastro e login;
2. onboarding completo;
3. Elenco com 26 jogadores;
4. Escalação preenchida e troca por posição;
5. prognóstico;
6. jogar partida e abrir narração/resultado;
7. atualização de Liga, caixa, energia, moral e XP;
8. Mercado: listar, comprar e vender;
9. Construções: listar CT/Estádio/Centro Médico e iniciar obra;
10. Finanças, Ranking, Arena, Carreira, Clube, Loja e Mensagens;
11. logout/login e atualização completa do navegador;
12. isolamento entre dois usuários.

Critério de aceite: fluxo completo passa localmente e na URL publicada.

### Fase 4 — velocidade

- Medir tempo até conteúdo útil por tela.
- Consolidar consultas iniciais em payloads únicos por domínio.
- Pré-carregar somente a próxima tela provável.
- Definir metas: Dashboard e Elenco com conteúdo útil em até 1 segundo em conexão normal; ações comuns com resposta visual imediata; nenhum loading infinito.

### Fase 5 — gate de publicação

Uma versão só poderá ir ao Lovable quando:

- build passar;
- lint crítico passar;
- testes de jornada passarem;
- migrações estiverem aplicadas e compatíveis;
- teste de produção confirmar login, elenco, partida, mercado e construções;
- não houver `Invalid token`, dados vazios indevidos ou loading infinito nos logs.

## 9. Prioridades imediatas

1. **P0:** contrato único de autenticação em todas as funções.
2. **P0:** onboarding transacional/idempotente e carreira completa.
3. **P0:** jornada Escalação → Jogar → Partida → Resultado.
4. **P1:** Mercado, Construções, Liga e Finanças.
5. **P1:** suíte automatizada e gate de publicação.
6. **P2:** Arena, Clube, Ranking, Carreira, Loja, Mensagens e ações individuais.
7. **P2:** orçamento de desempenho e otimização de consultas.

## 10. Conclusão

O projeto não deve ser cancelado nem apagado. O trabalho visual está preservado e as regras de balanceamento auditadas continuam passando. O que falta é tratar a migração como uma mudança arquitetural completa, não como uma sequência de correções locais.

A próxima implementação segura é a Fase 1 inteira, seguida imediatamente pelos testes mínimos da Fase 3. Só depois disso deve haver novo commit/push para o Lovable.
