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
- Escolhida: Resurrect 64 (lospec.com/palette-list/resurrect-64), no lugar da Endesga 32 desde o
  redesenho visual de 2026-11. Tons pastel (cremes, lavandas, sálvias, madeiras claras) para o
  escritório claro e aconchegante. As cores têm nome em `scripts/lib/colors.ts`; a arte usa os
  nomes, nunca o hex.
- Todo PNG do repositório usa só cores da paleta, cores-chave (seção 3) e transparência total.
  `scripts/check-palette.ts` verifica isso e roda no CI.
- Assets CC0 importados são recoloridos para a paleta antes de entrar no repositório. É isso que
  dá coesão a peças de autores diferentes.

## 2a. Guia de estilo

Vale para toda peça nova ou redesenhada; o que destoa disto volta para a prancheta.

- **Luz** de cima e da esquerda. Cada material usa 3 a 4 tons da mesma rampa (contorno, sombra,
  base, luz, e às vezes um brilho pontual). As rampas ficam em `RAMPS` (`scripts/lib/draw.ts`):
  folha, vaso branco, vaso de barro, tecido pêssego, tecido sálvia, grafite, madeira clara,
  madeira escura, metal, branco.
- **Contorno** no tom mais escuro da rampa do próprio material (ferrugem no tecido pêssego, pinho
  na folha, tinta no grafite), nunca preto puro. É contorno interno: não aumenta a peça.
- **Sombra de contato** não é desenhada no sprite: o Phaser desenha uma elipse translúcida sob a
  pegada de cada móvel e avatar (a paleta não tem alfa parcial, e uma sombra opaca ficaria errada
  sobre pisos diferentes).
- **Perspectiva** top-down com a frente do móvel aparecendo (3/4 leve).
- **Fundo calmo, objetos com contraste**: pisos e paredes em cores lisas e claras, sem pontilhado
  nem ruído (testado e descartado: fica granulado); o contraste vai para móveis, plantas e
  pessoas.
- **Tapetes** são 9 tiles de piso (cantos, bordas e miolo); a borda só aparece nos lados de fora,
  então qualquer retângulo fecha.
- Ferramentas: `sprite(rows, legend)` para desenho pixel a pixel com legenda de cores nomeadas;
  `Canvas` (`box`, `blob`, `outline`) para móveis compostos e massas orgânicas com o sombreado
  padrão. `pnpm tsx scripts/art-pilot.ts` monta uma cena de revisão ampliada.

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
  colunas, fixadas pelos placeholders.
- Cada tileset tem 100 gids reservados no mapa (firstgid 1, 101, 201, 301). O Tiled atribui
  firstgid contíguo, e um tileset que cresce invadiria os gids do seguinte; o `compileMap` recusa
  mapa com tilesets sobrepostos (`tileset_overlap`).
- Propriedades de tile no `.tsj`:
  - `collides` (bool): o móvel bloqueia passagem.
  - `item_id` (string): ID de catálogo de um móvel ou item de decoração.
- Tilesets: ver seção 9. Os de móveis grandes têm célula maior (32x16, 32x32, 48x32); o tamanho
  vem do próprio `.tsj` e o catálogo o expõe como `tileWidth`/`tileHeight`.

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
- ~~Sem arte gerada por IA~~. Revisto em 2026-11-18 por decisão do dono do projeto: a arte pode ser
  gerada pelo Claude, desenhada pixel a pixel em código (`scripts/gen-art.ts`), sempre na paleta e
  nos layouts deste documento. Licença `own`. O risco que motivava a regra (consistência entre tiles
  e frames) é tratado desenhando por código: as camadas do personagem compartilham as mesmas
  coordenadas e os frames de caminhada variam só as pernas.

## 8. Fontes CC0 de partida

- Personagem: Simple Character Base [16x16], zaphgames, OpenGameArt (CC0). Corpo base para desenhar
  as camadas por cima. Conferir se cobre as quatro direções antes de travar o layout.
- Interior: Interior spritesheet 16x16 tiles, InThePixel, OpenGameArt (CC0). Base para piso,
  parede e móveis genéricos.
- Placeholders e peças avulsas: packs da Kenney (CC0).
- A conferir: Neko Office Asset Pack, HelloRumin (itch.io). Permite uso comercial e modificação,
  mas a página não esclarece redistribuição. Só entra se a licença completa permitir.

## 9. Conjunto atual (redesenho visual de 2026-11)

| Tileset | Célula | firstgid | Conteúdo |
|---------|--------|---------:|----------|
| `floors` | 16x16 | 1 | 12 pisos (madeira clara e escura, taco, ladrilhos creme e sálvia, xadrez de copa, carpetes cinza, lavanda e azul, cimento, calçada, grama) e 3 tapetes de 16 tiles |
| `walls` | 16x16 | 101 | 15 tiles: topo, faces clara, sálvia, creme e lilás, janelas, quadro, pôster, relógio, lousa, prateleira, mural, planta pendurada, TV |
| `furniture` | 16x16 | 201 | 33 móveis pequenos (cadeiras em 4 direções, pufes, 9 plantas, luminária, impressora, extintor etc.) |
| `desk-decor` | 16x16 | 301 | mesas de 1 tile e metades da mesa larga em 3 variantes, 3 monitores e 23 itens de decoração |
| `furniture-2x1` | 32x16 | 401 | sofás em 3 cores, mesa de centro, aquário, banco, aparador |
| `furniture-2x2` | 32x32 | 501 | mesa redonda, estante alta, geladeira, árvore, máquina de lanches, fliperama, vaso grande, lousa de pé |
| `furniture-3x2` | 48x32 | 601 | mesa de reunião, bancada de copa, pingue-pongue, sofá em L, recepção, pebolim |

- Tapete: 16 tiles por tapete, um para cada combinação de bordas (máscara N=1, S=2, O=4, L=8),
  pintados pela ferramenta Tapete do editor (`paintRug`). Qualquer retângulo, até 1x1, fecha a borda.
- Mesa larga: desenhada inteira (32x16 e 16x32) e cortada em metades no `desk-decor`
  (`<variante>-wide-l`/`-r`, `<variante>-tall-t`/`-b`); o cliente remonta.
- Divisória (`divider`, `divider-wide-l`/`-r`, `divider-side`): painel baixo sage atrás da mesa
  sem parede, onde o item "Na parede" fica pendurado. A de lado é desenhada para a mesa virada à
  esquerda e espelhada para a direita.
- Personagem: 1 corpo, 6 cabelos (curto, comprido, espetado, cacheado, coque, black power), 6 roupas
  (camiseta, moletom, camisa, vestido, jaqueta, suéter), 5 acessórios (óculos, boné, fone, gorro,
  laço). Rampas: 6 de pele, 8 de cabelo, 8 de roupa.

## 10. Arte gerada

`scripts/gen-art.ts` desenha toda a arte a partir de `scripts/art/`, em dois estilos de código que
produzem o mesmo padrão visual (seção 2a):

- `sprite(rows, legend)` e `Canvas` (`scripts/lib/draw.ts`): pisos e paredes (`surfaces.ts`), móveis
  (`furniture-small.ts`, `furniture-large.ts`) e mesa e decoração (`desk-decor.ts`).
- Grades com as letras legadas, mapeadas para a cor Resurrect mais próxima: só o personagem
  (`character.ts`), cujas camadas são derivadas da mesma silhueta para encaixarem pixel a pixel.

Regras do gerador:

- Tilesets só crescem: as posições dos tiles existentes não mudam; itens novos entram no fim. O
  gerador confere que cada tile tem o tamanho da célula do tileset.
- Camadas do personagem desenham nas mesmas coordenadas do corpo; a direita é o espelho da esquerda.
- Um asset desenhado à mão pode substituir o gerado a qualquer momento, no mesmo arquivo e layout.

Ferramentas de revisão (não geram assets):

- `pnpm tsx scripts/art-pilot.ts [saida.png]`: cena de escritório ampliada com as peças principais.
- `pnpm tsx scripts/art-sheet.ts <tileset.png> <saida.png> [escala] [fundo]`: tileset ampliado.
- `pnpm tsx scripts/art-avatars.ts [saida.png]`: todos os cabelos, roupas e acessórios de frente.
- `pnpm tsx scripts/render-map.ts [mapa.json] [saida.png] [escala]`: um mapa salvo inteiro em PNG
  (é de onde sai `docs/prints/coworking.png`).

## 11. Ferramentas gratuitas

- Desenho: LibreSprite ou Piskel. O Aseprite é a referência do mercado; é pago, com código-fonte
  disponível para compilar (conferir os termos atuais antes).
- Mapas: Tiled.
- Paletas: Lospec.
