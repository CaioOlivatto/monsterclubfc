# Auditoria de economia de partidas e manutenção — 25/08/2026

## Escopo e método

Auditoria somente de leitura. Nenhum valor, regra, banco, código, commit, push ou deploy foi alterado.

Foram confrontados o fechamento de uma partida real no Supabase, as funções do cliente/servidor e simulações reproduzíveis com as regras `BALANCE_VERSION 2.2.0`. A matriz abaixo usa 26 criaturas, 13 jogos em casa, ocupação de 73% (antes do ruído de +/-5%) e os perfis existentes:

| Perfil | CT | Estádio | Centro médico |
|---|---:|---:|---:|
| Básica | 1 | 1 | 1 |
| Média | 3 | 5 | 3 |
| Alta | 5 | 10 | 5 |

## 1. Origem exata dos $66.000

Partida auditada: `304a680b-3160-4b2d-acc5-ccef3c508951`, Furacões do Vento, vitória fora por 9 x 4.

| Item | Nível no banco na hora da partida | Valor configurado | UI | Cobrado |
|---|---:|---:|---:|---:|
| CT original | 1 | $9.000 | $9.000 | $9.000 |
| Estádio original | 1 | $18.000 | — | $18.000 |
| Centro médico original | 1 | $6.000 | — | $6.000 |
| CT duplicado | 1 | $9.000 | — | $9.000 |
| Estádio duplicado | 1 | $18.000 | $19.800 mostrado depois do upgrade | $18.000 |
| Centro médico duplicado | 1 | $6.000 | $6.000 | $6.000 |
| **Total** |  |  | **$34.800** | **$66.000** |

Não existe manutenção oculta nem manutenção de elenco dentro desses $66.000. Os salários foram uma linha separada de $19.449. O banco continha seis linhas de construções: duas cópias de cada construção básica; o estádio duplicado só foi atualizado para nível 2 seis minutos depois da partida.

## 2. UI x backend

- A tela de Construções carrega por `team_id = current_team_id` e usa um `Map` por tipo; portanto exibe uma única construção por tipo.
- O fechamento financeiro em `league.functions.ts` carrega por `trainer_id` e soma **todas** as linhas retornadas por `totalMaintenancePerMatch`.
- A fórmula econômica central é a mesma (`maintenancePerMatch` em `economy.ts`), porém a seleção de registros é diferente. A UI e o backend, na prática, não usam a mesma fonte de dados.
- O resumo financeiro persiste apenas o agregado `maintenance`, sem detalhamento por prédio. Isso não cria a cobrança, mas impede diagnosticá-la na tela.

**Classificação: BUG técnico confirmado.**

## 3. Configuração de manutenção por partida

Valores calculados pelas fórmulas atuais, sem duplicação de linhas.

| Divisão | CT 1/2/3/4/5 | Estádio 1/2/3/4/5/6/7/8/9/10 | Médico 1/2/3/4/5 |
|---|---|---|---|
| Bronze | 9.000 / 10.620 / 12.532 / 14.787 / 17.449 | 18.000 / 19.800 / 21.780 / 23.958 / 26.354 / 30.043 / 34.249 / 39.044 / 44.511 / 50.742 | 6.000 / 7.080 / 8.354 / 9.858 / 11.633 |
| Prata | 30.000 / 35.400 / 41.772 / 49.291 / 58.163 | 59.000 / 64.900 / 71.390 / 78.529 / 86.382 / 98.475 / 112.262 / 127.979 / 145.896 / 166.321 | 20.000 / 23.600 / 27.848 / 32.861 / 38.776 |
| Ouro | 51.000 / 60.180 / 71.012 / 83.795 / 98.878 | 102.000 / 112.200 / 123.420 / 135.762 / 149.338 / 170.246 / 194.080 / 221.251 / 252.226 / 287.538 | 36.000 / 42.480 / 50.126 / 59.149 / 69.796 |
| Diamante | 90.000 / 106.200 / 125.316 / 165.618 / 216.368 | 180.000 / 198.000 / 217.800 / 239.580 / 263.538 / 315.455 / 376.743 / 449.010 / 534.126 / 634.275 | 64.000 / 75.520 / 89.114 / 117.773 / 153.861 |
| Lendária | 160.000 / 188.800 / 222.784 / 320.720 / 446.694 | 310.000 / 341.000 / 375.100 / 412.610 / 453.871 / 558.806 / 684.227 / 833.813 / 1.011.872 / 1.223.446 | 105.000 / 123.900 / 146.202 / 210.472 / 293.143 |

Construções que geram manutenção: somente CT, estádio e centro médico. Outros tipos retornam zero.

## 4. Receitas e prêmios configurados por partida

| Divisão | TV + patrocínio + merchandising | Prêmio W/D/L | Teto vitória fora |
|---|---:|---:|---:|
| Bronze | $21.000 | $15.000 / $6.000 / $2.000 | $28.000 |
| Prata | $50.000 | $28.000 / $11.000 / $4.000 | $55.000 |
| Ouro | $103.000 | $50.000 / $20.000 / $7.000 | $100.000 |
| Diamante | $209.000 | $90.000 / $36.000 / $13.000 | $180.000 |
| Lendária | $398.000 | $160.000 / $64.000 / $24.000 | $300.000 |

O bônus fora foi projetado para fechar vitória fora em +$8.000, mas é limitado pelo teto. Logo essa garantia deixa de existir quando `despesas - receita fixa - prêmio + $8.000` excede o teto.

## 5. Matriz casa x fora

Em cada célula: `receita W/D/L -> líquido W/D/L`. Salários e manutenção são constantes por perfil e aparecem nas colunas próprias.

| Divisão | Estrutura | Salários | Manutenção | Casa: receita -> líquido | Fora: receita -> líquido |
|---|---|---:|---:|---|---|
| Bronze | Básica | 12.012 | 33.000 | 94.400/85.400/81.400 -> 49.388/40.388/36.388 | 53.012/27.000/23.000 -> 8.000/-18.012/-22.012 |
| Bronze | Média | 12.012 | 47.240 | 111.190/102.190/98.190 -> 51.938/42.938/38.938 | 64.000/27.000/23.000 -> 4.748/-32.252/-36.252 |
| Bronze | Alta | 12.012 | 79.824 | 134.550/125.550/121.550 -> 42.714/33.714/29.714 | 64.000/27.000/23.000 -> -27.836/-64.836/-68.836 |
| Prata | Básica | 34.996 | 109.000 | 171.440/154.440/147.440 -> 27.444/10.444/3.444 | 133.000/61.000/54.000 -> -10.996/-82.996/-89.996 |
| Prata | Média | 34.996 | 156.002 | 294.547/277.547/270.547 -> 103.549/86.549/79.549 | 133.000/61.000/54.000 -> -57.998/-129.998/-136.998 |
| Prata | Alta | 34.996 | 263.260 | 361.824/344.824/337.824 -> 63.568/46.568/39.568 | 133.000/61.000/54.000 -> -165.256/-237.256/-244.256 |
| Ouro | Básica | 34.996 | 189.000 | 293.160/263.160/250.160 -> 69.164/39.164/26.164 | 231.996/123.000/110.000 -> 8.000/-100.996/-113.996 |
| Ouro | Média | 34.996 | 270.476 | 694.368/664.368/651.368 -> 388.896/358.896/345.896 | 253.000/123.000/110.000 -> -52.472/-182.472/-195.472 |
| Ouro | Alta | 34.996 | 456.212 | 862.560/832.560/819.560 -> 371.352/341.352/328.352 | 253.000/123.000/110.000 -> -238.208/-368.208/-381.208 |
| Diamante | Básica | 164.450 | 334.000 | 509.240/455.240/432.240 -> 10.790/-43.210/-66.210 | 479.000/245.000/222.000 -> -19.450/-253.450/-276.450 |
| Diamante | Média | 164.450 | 477.968 | 1.246.394/1.192.394/1.169.394 -> 603.976/549.976/526.976 | 479.000/245.000/222.000 -> -163.418/-397.418/-420.418 |
| Diamante | Alta | 164.450 | 1.004.504 | 1.895.510/1.841.510/1.818.510 -> 726.556/672.556/649.556 | 479.000/245.000/222.000 -> -689.954/-923.954/-946.954 |
| Lendária | Básica | 325.078 | 575.000 | 850.000/754.000/714.000 -> -50.078/-146.078/-186.078 | 858.000/462.000/422.000 -> -42.078/-438.078/-478.078 |
| Lendária | Média | 325.078 | 822.857 | 1.873.825/1.777.825/1.737.825 -> 725.890/629.890/589.890 | 858.000/462.000/422.000 -> -289.935/-685.935/-725.935 |
| Lendária | Alta | 325.078 | 1.963.283 | 3.514.500/3.418.500/3.378.500 -> 1.226.139/1.130.139/1.090.139 | 858.000/462.000/422.000 -> -1.430.361/-1.826.361/-1.866.361 |

## 6. Salários típicos (26 criaturas)

Faixas vêm do alvo do XI por divisão; as colunas usam todo o elenco a esse OVR para mostrar os degraus da fórmula.

| Divisão | OVR inicial / médio / forte | Folha por partida inicial / média / forte | Folha anual inicial / média / forte |
|---|---|---:|---:|
| Bronze | 36 / 42 / 48 | 12.012 / 12.012 / 12.012 | 312.312 / 312.312 / 312.312 |
| Prata | 47 / 53 / 59 | 12.012 / 34.996 / 34.996 | 312.312 / 909.896 / 909.896 |
| Ouro | 58 / 64 / 70 | 34.996 / 34.996 / 110.006 | 909.896 / 909.896 / 2.860.156 |
| Diamante | 67 / 74 / 80 | 38.844 / 164.450 / 200.772 | 1.009.944 / 4.275.700 / 5.220.072 |
| Lendária | 76 / 83 / 90 | 259.610 / 325.078 / 1.420.042 | 6.749.860 / 8.452.028 / 36.921.092 |

Há degraus grandes em OVR 50, 70 e 90; Diamante/Lendária ainda aplicam pressão de elite. É uma regra intencional, mas a transição merece recalibração porque o meio do alvo Diamante já salta muito.

## 7. Estádio e retorno

Capacidade/custo por nível: 8k/$0, 12k/$200k, 18k/$600k, 25k/$1,6M, 35k/$3,8M, 45k/$7,5M, 55k/$12M, 65k/$20M, 75k/$32M e 90k/$50M. O custo é para atingir o nível-alvo.

Com 13 jogos em casa e 73% de ocupação, o melhor nível operacional de estádio por divisão é: Bronze 2, Prata 3, Ouro 5, Diamante 6 e Lendária 8. Após isso, a manutenção anual adicional supera o ganho anual de bilheteria na mesma divisão. Exemplos críticos: Bronze nível 10 rende $1.281.150/ano em bilheteria e custa $1.319.292/ano em manutenção; Prata nível 10 rende $3.689.712 e custa $4.324.346.

Há retorno rápido apenas nos primeiros níveis compatíveis com a demanda. Bronze L1->L2 recupera $200k em aproximadamente 18 partidas em casa; Bronze L3 em diante não recupera o investimento dentro da Bronze porque a demanda já está limitada a 10 mil pessoas. Isso é **desbalanceamento de progressão**, não erro de cálculo.

## 8. Temporada operacional (26 jogos)

Caixa inicial: $400.000. Campanhas: fraca 5V/6E/15D; média 9V/8E/9D; forte 15V/6E/5D. Inclui receitas de liga, bilheteria e bônus fora; não inclui transferências, Copa, Mundial, upgrades ou taxas anuais de elite.

| Divisão | Estrutura | Resultado operacional fraca / média / forte |
|---|---|---:|
| Bronze | Básica | +592.188 / +668.188 / +762.188 |
| Bronze | Média | +463.622 / +563.026 / +692.132 |
| Bronze | Alta | -63.286 / +52.714 / +206.714 |
| Prata | Básica | -7.584 / +183.108 / +434.146 |
| Prata | Média | +400.063 / +620.063 / +915.063 |
| Prata | Alta | -1.514.044 / -1.294.044 / -999.044 |
| Ouro | Básica | +116.776 / +405.468 / +773.506 |
| Ouro | Média | +3.323.412 / +3.721.412 / +4.253.412 |
| Ouro | Alta | +680.772 / +1.078.772 / +1.610.772 |
| Diamante | Básica | +278.320 / +730.970 / +1.294.945 |
| Diamante | Média | +6.379.504 / +7.093.504 / +8.049.504 |
| Diamante | Alta | +1.128.076 / +1.842.076 / +2.798.076 |
| Lendária | Básica | +487.928 / +1.186.934 / +2.035.443 |
| Lendária | Média | +7.849.085 / +9.043.805 / +10.635.885 |
| Lendária | Alta | -443.936 / +780.064 / +2.416.064 |

O simulador de carreira existente passou (200 treinadores x 10 temporadas): falência 0% nos perfis conservador/equilibrado/agressivo. Contudo ele simula CT1, médico1 e um estádio por vez; não captura duplicações e não valida os perfis altos acima.

## 9. Promoção, falência e continuidade

- Com estrutura básica, as simulações existentes não indicam insolvência inevitável após promoção. A progressão Bronze->Prata->Ouro é viável no cenário simplificado.
- Com estrutura alta mantida antes da promoção, Prata tem perda operacional mesmo em campanha forte (-$999.044), e Lendária alta em campanha fraca perde -$443.936. Portanto, a progressão de infraestrutura não é economicamente segura em todas as trajetórias.
- Casa é rentável em grande parte dos casos; derrota fora é risco financeiro esperado. Vitória fora deveria compensar esse risco, mas falha depois que o teto do subsídio limita a fórmula.

## 10. Top 10 achados

| # | Achado | Classificação |
|---:|---|---|
| 1 | Backend cobrou seis linhas de edifícios e UI mostrou três | **BUG** |
| 2 | UI busca por time; fechamento busca por treinador | **BUG** |
| 3 | Bônus fora tem comentário de garantia +$8k, mas o teto a quebra | **DESBALANCEAMENTO / especificação contraditória** |
| 4 | Estrutura média já estoura o teto de vitória fora em todas as divisões | **DESBALANCEAMENTO** |
| 5 | Estrutura alta gera perdas sazonais em Bronze, Prata e Lendária fraca | **DESBALANCEAMENTO** |
| 6 | Estádios acima da demanda não se pagam na divisão atual | **DESBALANCEAMENTO** |
| 7 | Lendária básica com OVR médio perde até em vitória em casa | **DESBALANCEAMENTO** |
| 8 | Saltos de folha em 50/70/90 e pressão de elite são muito abruptos | **DESBALANCEAMENTO** |
| 9 | Resumo financeiro não discrimina cada construção | **BUG de observabilidade** |
| 10 | Testes atuais validam cenário básico, não duplicidade nem perfis de infraestrutura | **LACUNA DE TESTE** |

## Conclusão e recomendações (não implementadas)

**Status: ECONOMIA PRECISA DE RECALIBRAÇÃO.**

Prioridade de correção futura:

1. Unificar o escopo de leitura de construções e eliminar/impedir duplicidade por treinador/time.
2. Registrar o detalhamento de manutenção no resumo financeiro e criar teste de regressão UI x fechamento.
3. Decidir se a promessa do bônus fora é margem garantida ou teto fixo; hoje ambos coexistem de modo incompatível.
4. Recalibrar progressão de estádio/infraestrutura e degraus de salário com simulações para os três perfis.
5. Expandir os testes para matrizes por estrutura e transição de divisão antes de mudar valores.

Notas: Bronze 6/10; Prata 4/10; Ouro 6/10; Diamante 5/10; Lendária 3/10; economia geral 4/10.
