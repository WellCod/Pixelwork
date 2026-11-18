# Fase 2: identidade e presença

Leia `CLAUDE.md` e `docs/architecture.md` (seções 5, 8, 9 e 11) e `docs/art.md` (seções 4 a 6).

## Objetivo

Status, cargo, avatar e mesas funcionando, com toda alteração visível para todos na hora.

## Escopo

- Rotas REST: `/me/avatar`, `/me/name`, `/spaces/:id/me/status`, `/spaces/:id/me/title`,
  `/spaces/:id/members/:userId/title` (admin), claim, decor e release de mesa. Toda rota grava e
  depois faz broadcast (`player.update`, `desk.updated`). 404 para não membro.
- Validação: emoji de status com exatamente um grafema; limites de tamanho de texto.
- UI: editor de avatar com prévia (camadas e rampas do catálogo), seletor de status com texto e
  emoji, edição de cargo, lista lateral de pessoas com status, emoji e cargo.
- Mapa: emoji ao lado do nome; cargo sob o nome só no raio de proximidade ou sob o mouse.
- Mesas: renderização da variação e do monitor, itens nos slots com deslocamento por `orientation`,
  plaquinha com o nome do dono offline, detecção de "sentado" na cadeira da própria mesa, UI para
  ocupar, decorar e liberar. `welcome` passa a incluir as mesas.

## Fora de escopo

Mídia, chat, multi-coworking.

## Testes obrigatórios

- Integração: cada rota REST grava e o broadcast chega aos outros bots.
- Claim: recusado fora do tile da cadeira; recusado se o usuário já tem mesa; recusado se a mesa
  está ocupada. Release: dono ou admin, mais ninguém.
- Não membro recebe 404 em todas as rotas `/spaces/:id/...` desta fase.
- Emoji: um grafema aceito; dois grafemas e texto comum recusados.

## Pronto quando

Alguém muda avatar, status, cargo ou decoração da mesa e os outros veem a mudança na hora, sem
recarregar.

## Execução

1. Apresente o plano e espere aprovação.
2. Implemente com os testes.
3. Rode `pnpm typecheck`, `pnpm lint` e `pnpm test`.
4. Resuma o que ficou pronto e o que verificar manualmente. Pare.
