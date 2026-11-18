# Fase 1: fatia vertical

Leia `CLAUDE.md` e `docs/architecture.md` (seções 4, 6, 7, 8, 13 e 14) e `docs/art.md` (seções 1, 3 e 4).

## Objetivo

Dois convidados em abas diferentes entram no coworking de demonstração e se veem andando.

## Escopo

- Auth de convidado: `POST /auth/guest`, sessões com hash do token, cookie `sid`, `GET /me`,
  `POST /auth/logout`, checagem de `Origin` e `Content-Type` em rotas que alteram estado.
- Template de mapa pequeno em `maps/templates/` respeitando o contrato da seção 6, usando os
  tilesets de placeholder, com pelo menos uma zona `open` nomeada, uma zona `meeting`, quatro mesas
  e spawn. Seed cria a org Demo e o coworking `DEMO_SPACE_SLUG` com esse template.
- `compileMap` em `shared`, com todos os códigos de `MapError`.
- Simulação pura `step` em `shared`: intervalo mínimo entre passos, colisão. (Tranca de zona entra
  na fase 4; deixe o ponto de extensão, sem implementá-la.)
- Servidor WebSocket: autenticação pelo cookie no upgrade, recusa de `Origin` inválido, resolução de
  `space_members`, `welcome`, `tick` com `ack` por cliente, `player.join` e `player.leave`,
  `session.replaced`, tolerância de reconexão, limites de mensagens inválidas e de taxa. Relógio e
  scheduler injetáveis.
- Cliente: login como convidado, renderização do mapa compilado, rótulos de zona, câmera seguindo o
  jogador, input de setas e WASD, predição, reconciliação e interpolação, nome sob o avatar.
- Composição de avatar por camadas com troca de paleta (`docs/art.md` seção 3), com cache por hash
  do `AvatarSpec`. Convidados recebem um `AvatarSpec` aleatório.

## Fora de escopo

Status, cargo, mesas (fase 2); mídia e chat (fase 3); GitHub OAuth (fase 5).

## Testes obrigatórios

- `compileMap`: uma fixture inválida por código de `MapError` e fixtures válidas.
- `step`: passo dentro do intervalo mínimo é ignorado; passo para parede é recusado.
- Reconciliação no cliente como função pura: snap mais reaplicação dos passos com `seq > ack`.
- Integração com bots e relógio manual: entrada e saída; movimento visível para o outro; passo
  contra parede com posição autoritativa devolvida; `Origin` inválido recusado; segunda conexão
  recebe e provoca `session.replaced`; desconexão sem `player.leave` antes de 10 segundos e com
  ele depois.

## Pontos de atenção

- O `ack` é por cliente, mas a lista `moves` é serializada uma vez por tick.
- Interpolação não pode acumular atraso quando chegam vários passos num mesmo tick.

## Pronto quando

Dois perfis de navegador, como convidados diferentes, se veem andando com movimento suave, sem
atravessar paredes, e o avatar de quem fecha a aba some depois da tolerância.

## Execução

1. Apresente o plano (arquivos, interfaces entre `shared`, `server` e `client`, testes) e espere
   aprovação.
2. Implemente com os testes.
3. Rode `pnpm typecheck`, `pnpm lint` e `pnpm test`.
4. Resuma o que ficou pronto e o que verificar manualmente. Pare.
