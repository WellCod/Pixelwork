# Fase 6: mapas, upload e export

Leia `CLAUDE.md`, `docs/architecture.md` (seções 6 e 12) e `docs/art.md` (seções 5 a 7).

## Objetivo

Um mapa feito no Tiled sobe, aparece para quem está online e volta a abrir no Tiled depois do
export.

## Escopo

- `POST /map/validate`: erros e mesas órfãs.
- `PUT /map` com `baseVersion` e 409; na mesma transação, mapa, versão e remoção de atribuições
  órfãs.
- Troca ao vivo: recompilar, realocar por BFS quem ficou em tile não caminhável (mesma zona, senão
  spawn), limpar trancas de zonas removidas, encerrar salas de mídia de zonas removidas, emitir
  `map.updated`; cliente recarrega o mapa sem recarregar a página.
- `GET /map/export`: zip com `map.json`, `.tsj` e `.png` dos tilesets referenciados e `CREDITS.txt`.
- Página de créditos no app, gerada do catálogo.
- UI de admin: upload com a lista de erros legível e o aviso de mesas órfãs antes de confirmar.

## Testes obrigatórios

- 409 com `baseVersion` antiga.
- Mesas órfãs removidas na mesma transação; falha no meio não deixa estado parcial.
- Realocação: jogador em tile que virou parede vai para o tile caminhável mais próximo na mesma
  zona; sem tile disponível na zona, vai para o spawn.
- Zona removida com sala trancada: tranca limpa e ocupantes devolvidos à sala `space:`.
- Export: o zip contém exatamente os tilesets referenciados e os créditos corretos; o `map.json`
  exportado passa no `compileMap`.

## Pronto quando

Um mapa editado no Tiled sobe pela UI, quem está online passa a ver o mapa novo sem recarregar a
página, e o zip exportado abre no Tiled com os tilesets.

## Execução

1. Apresente o plano e espere aprovação.
2. Implemente com os testes.
3. Rode `pnpm typecheck`, `pnpm lint` e `pnpm test`.
4. Resuma o que ficou pronto e o que verificar manualmente. Pare.
