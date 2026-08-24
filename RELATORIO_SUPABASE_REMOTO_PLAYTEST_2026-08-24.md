# Validação remota do Supabase e playtest fechado

Data: 24/08/2026

## Escopo

- Projeto: Monster Club Manager
- Supabase: `gwqvninbrmrsabuseqbx`
- Ambiente testado: aplicação local conectada ao Supabase remoto
- Pagamentos reais: não executados
- Publicação, commit, push e merge: não executados nesta fase

## Resultado executivo

**Situação: NO-GO temporário.**

A jornada principal, a persistência e os módulos centrais funcionaram no Supabase remoto. Entretanto, o início de uma obra ainda precisa receber a migração atômica criada após o teste real. Até essa migração ser aplicada e retestada, a recomendação é não iniciar o playtest fechado com 20–50 jogadores.

## Testes automatizados aprovados

- `monetization:readiness`
- `economy:sim`
- `gameplay:sim`
- `balance:sim`
- `career:sim`
- `calibration:final`
- `quality:check`
- build de produção

## Jornada real validada

1. Cadastro e autenticação de uma conta técnica.
2. Criação atômica da carreira com Titãs de Pedra.
3. Criação de clube, 26 jogadores, escalação, temporada, recursos e construções.
4. Abertura de Painel, Elenco, Escalação, Liga, Mercado, Finanças, Construções, Clube, Loja e Carreira.
5. Disputa de uma partida oficial.
6. Persistência da sessão após recarregar a aplicação.

## Evidências da partida

- Partida: Titãs de Pedra 2 × 3 Neblina FC.
- Rodada posterior: 2.
- XP do treinador: 10/350.
- Caixa antes: $ 400.000.
- Caixa depois: $ 424.256.
- Resultado financeiro líquido: +$ 24.256.

Composição conferida:

- Premiação: +$ 2.000.
- Direitos de TV: +$ 8.000.
- Patrocínio: +$ 9.000.
- Merchandising: +$ 4.000.
- Bilheteria: +$ 42.840.
- Salários: -$ 8.584.
- Manutenção: -$ 33.000.

O elenco permaneceu com 26 jogadores, e energia e moral foram persistidas.

## Operações econômicas verificadas

### Loja

- Compra de uma poção individual por $ 8.000 concluída.
- Caixa: $ 424.256 → $ 416.256.
- Estoque: 3 → 4.
- Lançamento financeiro presente.
- Corrigida localmente a atualização tardia da interface após a compra.

### Construções

- Início da evolução do CT para o nível 2 por $ 120.000.
- Caixa: $ 416.256 → $ 296.256.
- Construtor ocupado: 0/1 disponível.
- Obra persistida após recarregar.
- Defeito encontrado: o lançamento de -$ 120.000 não apareceu no extrato e a operação antiga usava atualizações separadas.

## Correção preparada

Foi criada a migração `20260824160000_atomic_building_start.sql`, que transforma o início de obra em uma única transação de banco:

- valida usuário e clube;
- bloqueia concorrência de construtor e construção;
- verifica saldo e nível máximo;
- desconta o caixa;
- inicia a obra;
- registra o lançamento financeiro;
- usa chave de idempotência para impedir cobrança duplicada.

O frontend de Construções foi alterado para usar essa RPC. A migração ainda precisa ser aplicada no Supabase remoto e retestada.

## Observações de produto

- Jogadores receberam zero XP na derrota porque essa é a regra atual do balanceamento; não foi tratado como falha técnica nesta fase.
- O botão de velocidade 2× redireciona à Loja quando bloqueado, conforme o desenho atual.
- Nenhuma compra com dinheiro real foi testada.

## Critério para liberar o playtest

Após aplicar `20260824160000_atomic_building_start.sql`, executar uma nova obra e confirmar simultaneamente:

1. débito único no caixa;
2. obra iniciada uma única vez;
3. construtor ocupado;
4. transação financeira registrada;
5. repetição da mesma solicitação não gera nova cobrança.

Se os cinco itens passarem, a recomendação muda para **GO para playtest fechado de 20–50 jogadores**, mantendo pagamentos reais desativados durante a primeira rodada de observação.
