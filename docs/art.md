# Arte

A arte é uma trilha paralela ao código. O app roda desde a fase 0 com placeholders gerados por
script, e cada asset final substitui o placeholder sem mudança de código, desde que respeite as
regras deste documento.

## 1. Grade e renderização

- Tile de 16x16 px. Renderização em escala inteira (`RENDER_SCALE = 2`), nearest neighbor
  (`pixelArt: true` no Phaser). Nunca escala fracionária.
- Personagem: frame de 16x32 px, âncora no centro da borda inferior. Ocupa um tile de colisão (os
  pés). Um personagem baixinho de 16x16 desenhado na metade de baixo do frame também é válido.

## 2. Paleta

- Uma única paleta fixa, com cerca de 32 cores, em `assets/palette.hex` (uma cor por linha). Ponto
  de partida sugerido: uma paleta do Lospec, como a Endesga 32. A escolha é sua; registre-a aqui.
- Escolhida, provisoriamente: Endesga 32 (lospec.com/palette-list/endesga-32).
- Todo PNG do repositório usa só cores da paleta, cores-chave (seção 3) e transparência total.
  `scripts/check-palette.ts` verifica isso e roda no CI.
- Assets CC0 importados são recoloridos para a paleta antes de entrar no repositório. É isso que
  dá coesão a peças de autores diferentes.

## 3. Troca de paleta (avatares)

Regiões recoloríveis são desenhadas com rampas de cores-chave, fora da paleta, e o cliente troca
cada cor-chave pela cor correspondente da rampa escolhida.

| Região | Rampa-chave (escuro -> claro)              | Rampas finais (IDs em `SKIN_PALETTES` etc.) |
|--------|--------------------------------------------|---------------------------------------------|
| Pele   | `#FF0001` `#FF0002` `#FF0003` `#FF0004`    | `assets/palettes/skin.json`                 |
| Cabelo | `#00FF01` `#00FF02` `#00FF03` `#00FF04`    | `assets/palettes/hair.json`                 |
| Roupa  | `#0001FF` `#0002FF` `#0003FF` `#0004FF`    | `assets/palettes/outfit.json`               |

- Cada arquivo de rampas é `{ "<id>": ["#hex1", "#hex2", "#hex3", "#hex4"] }`, com cores da paleta.
- Partes que não mudam de cor (olhos, contorno, sapato) usam cores normais da paleta.

## 4. Spritesheets de personagem

Camadas, na ordem de composição: `body` -> `outfit` -> `hair` -> `accessory`. Todas as camadas
seguem exatamente o mesmo layout:

```
frame 16x32, 4 colunas x 5 linhas, folha de 64x160

linha 0: andar para baixo     (coluna 0 = parado)
linha 1: andar para esquerda  (coluna 0 = parado)
linha 2: andar para direita   (coluna 0 = parado)
linha 3: andar para cima      (coluna 0 = parado)
linha 4: sentado, uma coluna por direção (baixo, esquerda, direita, cima)
```

- A linha 2 pode ser gerada espelhando a linha 1 (`scripts/mirror-right.ts`), se o desenho permitir.
- Arquivos: `assets/characters/<camada>/<id>.png`.

## 5. Tilesets

- Cada tileset é um PNG em `assets/tilesets/<id>.png` mais um `<id>.tsj` (tileset do Tiled em JSON).
- Restrição: os mapas referenciam tiles pela posição. A largura do PNG (número de colunas) nunca
  muda, e tiles novos só entram no fim. Nunca reordenar nem remover. Todos os tilesets têm 8
  colunas (128 px de largura), fixadas pelos placeholders.
- Propriedades de tile no `.tsj`:
  - `collides` (bool): o móvel bloqueia passagem.
  - `item_id` (string): ID de catálogo de um móvel ou item de decoração.
- Tilesets planejados: `floors`, `walls`, `furniture`, `desk-decor` (variações de mesa, monitores e
  itens dos slots).

## 6. Manifesto e catálogo

`assets/manifest.json` é a única fonte de verdade dos assets:

```json
{
  "tilesets": [
    { "id": "furniture", "license": "own", "author": "Seu Nome", "source": null }
  ],
  "characters": {
    "body":      [{ "id": "base", "license": "CC0", "author": "zaphgames", "source": "https://opengameart.org/content/simple-character-base-16x16" }],
    "hair":      [{ "id": "short", "license": "own", "author": "Seu Nome", "source": null }],
    "outfit":    [],
    "accessory": []
  },
  "deskDecor": {
    "variants": [], "decorItems": [], "wallItems": [], "floorItems": []
  }
}
```

- `scripts/gen-catalog.ts` lê o manifesto e gera `packages/shared/src/catalog.generated.ts` com os
  enums (`BODY_IDS`, `HAIR_IDS`, `DESK_VARIANTS`, `DECOR_ITEMS` etc.) e a lista de créditos.
- Um asset fora do manifesto não existe para o app. Um asset no manifesto sem licença registrada
  quebra o script.
- A página de créditos do app e o `CREDITS.txt` do export saem da mesma lista.

## 7. Licenças

| Categoria | Entra? | Obrigação                                      |
|-----------|--------|------------------------------------------------|
| `own`     | sim    | nenhuma                                        |
| `CC0`     | sim    | nenhuma (registrar a origem por rastreabilidade) |
| `CC-BY`   | sim    | crédito, gerado automaticamente                |
| CC-BY-SA, GPL, qualquer NC, sem permissão de redistribuição | não | — |

- Tudo que está no repositório pode ser redistribuído, então o export inclui todos os tilesets.
- Prefira `own` e `CC0`. `CC-BY` só se não houver alternativa.
- Desenhar inspirado em referências é ok. Copiar ou decalcar sprites de terceiros, não.
- Sem arte gerada por IA: manter consistência entre tiles e frames de animação é o ponto fraco.

## 8. Fontes CC0 de partida

- Personagem: Simple Character Base [16x16], zaphgames, OpenGameArt (CC0). Corpo base para desenhar
  as camadas por cima. Conferir se cobre as quatro direções antes de travar o layout.
- Interior: Interior spritesheet 16x16 tiles, InThePixel, OpenGameArt (CC0). Base para piso,
  parede e móveis genéricos.
- Placeholders e peças avulsas: packs da Kenney (CC0).
- A conferir: Neko Office Asset Pack, HelloRumin (itch.io). Permite uso comercial e modificação,
  mas a página não esclarece redistribuição. Só entra se a licença completa permitir.

## 9. Conjunto mínimo para a demo

- Pisos: 2 a 3 variações (madeira, carpete, piso de cozinha).
- Paredes: um estilo, com cantos e topo.
- Móveis (cerca de 20): 3 variações de mesa, cadeira de escritório, monitor simples, monitor duplo,
  notebook, sofá, poltrona, mesa de reunião, cadeiras de reunião, tapete, porta, estante, bebedouro,
  máquina de café, 3 plantas.
- Itens de mesa (cerca de 10): caneca, luminária, planta pequena, livros, pôster, quadro, relógio,
  pet, lixeira, vaso grande.
- Personagem: 1 corpo base, 5 a 6 cabelos, 5 a 6 roupas, 3 a 4 acessórios (óculos, boné, fone).
- Rampas: 6 de pele, 8 de cabelo, 8 de roupa.

## 10. Placeholders

`scripts/gen-placeholders.ts` gera PNGs no layout e nas dimensões corretas, com formas e cores da
paleta (retângulo marrom para mesa, verde para planta, personagem em silhueta com as rampas-chave).
O manifesto aponta para eles até a arte final existir, com `license: "own"`.

## 11. Ferramentas gratuitas

- Desenho: LibreSprite ou Piskel. O Aseprite é a referência do mercado; é pago, com código-fonte
  disponível para compilar (conferir os termos atuais antes).
- Mapas: Tiled.
- Paletas: Lospec.
