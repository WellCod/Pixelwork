# Fase 7: editor no app

Leia `CLAUDE.md` e `docs/architecture.md` (seções 6 e 12).

## Objetivo

Admin cria e edita o escritório dentro do app, sem o Tiled.

## Escopo

- Modo de edição no Phaser, só para admin do coworking, partindo do mapa atual ou de um template.
- Ferramentas: pincel e borracha de `floor` e `walls`; posicionar, mover e remover móveis do
  catálogo; desenhar, renomear e mudar o tipo de zonas; posicionar mesas com `orientation`; mover o
  spawn.
- `zone_key` e `desk_key` gerados automaticamente e mantidos estáveis entre edições.
- Undo e redo por pilha de comandos.
- Salvar: chama `validate`, mostra erros e mesas órfãs, depois `PUT` com `baseVersion`; em 409,
  avisa e oferece recarregar o mapa atual.
- O editor produz o mesmo JSON do Tiled; nenhum formato intermediário persistido.

## Testes obrigatórios

- Pilha de comandos: aplicar, desfazer e refazer devolvem exatamente o estado anterior.
- Sequências de comandos geradas aleatoriamente a partir de um mapa válido produzem um mapa que
  passa no `compileMap` ou cujos erros são os esperados (zona sobreposta, cadeira bloqueada etc.).
- Chaves estáveis: mover uma mesa não muda o `desk_key`.

## Pronto quando

Um admin desenha um escritório do zero no app, salva, e as pessoas online o veem atualizado.

## Execução

1. Apresente o plano e espere aprovação. Esta é a fase mais longa; proponha subdividi-la se fizer
   sentido.
2. Implemente com os testes.
3. Rode `pnpm typecheck`, `pnpm lint` e `pnpm test`.
4. Resuma o que ficou pronto e o que verificar manualmente. Pare.
