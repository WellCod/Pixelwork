# Redesenho visual: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** trocar a arte do mundo e a interface por um visual claro, suave e caprichado (referência:
escritório pastel em pixel art), com muito mais objetos colocáveis, sem quebrar mapas salvos.

**Architecture:** a arte continua desenhada à mão em grades de caracteres em `scripts/art/`, agora
com legenda por sprite apontando para cores nomeadas da Resurrect 64. Tilesets passam a ter tamanho
de célula próprio (16, 32 ou 48 px), lido do `.tsj` pelo catálogo e usado pelo cliente e pelo
editor. A mesa atribuível ganha pegada de 2 tiles pelo tamanho do objeto no mapa. A UI vira tema
claro trocando os tokens do `styles.css`, e os rótulos do Phaser viram pílulas.

**Tech Stack:** TypeScript, pngjs (geração de arte), Phaser 4, React, Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-22-visual-redesign-design.md`

## Global Constraints

- Paleta: Resurrect 64, exatamente estas 64 cores, nesta ordem, em `assets/palette.hex`:
  `2e222f 3e3546 625565 966c6c ab947a 694f62 7f708a 9babb2 c7dcd0 ffffff 6e2727 b33831 ea4f36
  f57d4a ae2334 e83b3b fb6b1d f79617 f9c22b 7a3045 9e4539 cd683d e6904e fbb954 4c3e24 676633
  a2a947 d5e04b fbff86 165a4c 239063 1ebc73 91db69 cddf6c 313638 374e4a 547e64 92a984 b2ba90
  0b5e65 0b8a8f 0eaf9b 30e1b9 8ff8e2 323353 484a77 4d65b4 4d9be6 8fd3ff 45293f 6b3e75 905ea9
  a884f3 eaaded 753c54 a24b6f cf657f ed8099 831c5d c32454 f04f78 f68181 fca790 fdcbb0`.
- Todo PNG: só cores da paleta, cores-chave (`KEY_RAMPS`) e transparência total (`pnpm assets:check`).
- Tilesets: 8 colunas; no máximo 100 tiles; tiles existentes mantêm posição e sentido; novos no fim.
- Grade do mapa: 16x16; `RENDER_SCALE = 2`; zoom só inteiro.
- Gids no mapa: blocos de 100 por tileset na ordem do catálogo (1, 101, 201, 301, 401...).
- Guia de estilo (spec): luz de cima-esquerda; 3 a 4 tons por material; contorno no tom mais escuro
  da rampa, nunca `#000`; sombra de contato desenhada no sprite; 3/4 leve; fundo claro de baixo
  contraste, contraste nos móveis e pessoas.
- Tapetes = conjunto de 9 tiles de piso; quadros/relógio/janelas = tiles de parede; portas = móvel
  sem `collides`.
- Mesa: pegada pelo `width`/`height` do objeto (16x16, 32x16, 16x32); cadeira na frente do tile de
  âncora.
- Licenças: tudo `own`, exceto a fonte Inter (SIL OFL 1.1), registrada nos créditos.
- Nova dependência (fonte) só com aprovação do dono do projeto (CLAUDE.md).

## Review Focus

- Mapa salvo antigo (mesas 16x16, tilesets e gids atuais) continua compilando e com o mesmo sentido
  de cada tile → teste de fixture na Task 2 e na Task 5.
- Móvel grande colocado na borda do mapa → colisão recortada, sem erro nem tile fora → teste na
  Task 2.
- Mesa larga girada no editor encostada em parede → erro `chair_blocked` no painel, sem exceção →
  teste na Task 5.
- Nome longo ou com emoji na pílula → pílula cresce com o texto, nada cortado; nítido em zoom 1, 2
  e 3 → verificação manual na Task 11 (passo dedicado).
- Tapete pintado em 1x1 e 2x2 (sem miolo) → cantos se fecham sem buraco → teste na Task 6.

---

### Task 1: Paleta Resurrect 64 e legenda por sprite

**Files:**
- Modify: `assets/palette.hex`, `assets/palettes/skin.json`, `hair.json`, `outfit.json`
- Create: `scripts/lib/colors.ts`
- Modify: `scripts/lib/pixels.ts`, `scripts/check-palette.test.ts`
- Test: `scripts/lib/colors.test.ts`

**Interfaces:**
- Produces: `PALETTE: Readonly<Record<ColorName, string>>` (nomes em inglês, por exemplo
  `ink`, `plum`, `cream`, `peach`, `lavender`, `sage`, `slate`, um por cor), `type ColorName`;
  `sprite(rows: readonly string[], legend: Record<string, ColorName | KeyName>, label: string): Pixels`
  (largura conferida pela primeira linha; `.` é transparente); `KeyName = 'skin1'..'skin4' |
  'hair1'..'hair4' | 'outfit1'..'outfit4'`.
- Rampas: 6 de pele, 8 de cabelo, 8 de roupa, mesmos IDs de hoje (`SKIN_PALETTES` etc. não mudam),
  cada uma com 4 cores da paleta, do escuro ao claro.

- [ ] **Step 1: Testes que falham** em `scripts/lib/colors.test.ts`: `PALETTE` tem 64 nomes, valores
  únicos e iguais ao conjunto de `assets/palette.hex`; `sprite(['ab','ba'], {a:'cream', b:'ink'}, 't')`
  devolve a matriz com os hex certos; `sprite` lança erro para caractere fora da legenda e para linha
  de largura diferente; todo valor das rampas de `assets/palettes/*.json` está em `PALETTE`.
- [ ] **Step 2:** `pnpm exec vitest run scripts/lib` → FAIL (módulo não existe).
- [ ] **Step 3:** criar `colors.ts` e `sprite` em `pixels.ts` (a matriz passa a guardar hex, não
  letra; `toPng` converte hex). Trocar `palette.hex` e as rampas. O `grid` antigo e `COLORS` ficam até
  a Task 6, quando o último uso some.
- [ ] **Step 4:** `pnpm exec vitest run scripts` → PASS.
- [ ] **Step 5:** commit `feat(art): paleta Resurrect 64 e legenda por sprite`.

### Task 2: Tamanho de célula por tileset (gerador, catálogo e compileMap)

**Files:**
- Modify: `scripts/gen-art.ts`, `scripts/lib/catalog.ts`, `scripts/gen-catalog.test.ts`,
  `packages/shared/src/catalog.generated.ts` (gerado), `packages/shared/src/testing.ts`,
  `packages/shared/src/map.test.ts`
- Test: `scripts/gen-catalog.test.ts`, `packages/shared/src/map.test.ts`

**Interfaces:**
- Produces: `TileArt` ganha `cell?: [w: number, h: number]` implícito pelo tileset; em `gen-art.ts`,
  `tileset(id: string, tiles: TileArt[], cell: { w: number; h: number } = { w: 16, h: 16 })`.
- Catálogo: `TILESETS[id]` ganha `tileWidth: number` e `tileHeight: number`; o schema do `.tsj`
  aceita `tilewidth`/`tileheight` em {16, 32, 48}.
- `testing.ts`: `FIRSTGID` passa a ser derivado de `TILESET_IDS` (bloco de 100 na ordem do
  catálogo); `buildTestMap` aceita `furniture[].tileset?: TilesetId` e `w`/`h` em tiles.

- [ ] **Step 1: Testes que falham:** catálogo gerado de um `.tsj` com `tilewidth: 32` traz
  `tileWidth: 32`; `compileMap` de um mapa com móvel 32x32 colidível bloqueia os 4 tiles; o mesmo
  móvel com âncora na última coluna bloqueia só os tiles dentro do mapa e compila; fixture do
  template atual (`maps/templates/small-office.json` copiado hoje para
  `packages/shared/src/fixtures/small-office-v1.json`) compila com as mesmas mesas, zonas e
  `walkable` de antes (comparar com o resultado gravado no próprio teste).
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** implementar; regenerar catálogo (`pnpm assets:catalog`).
- [ ] **Step 4:** `pnpm test` → PASS; `pnpm typecheck`.
- [ ] **Step 5:** commit `feat(art): tamanho de célula por tileset`.

### Task 3: Folha piloto para aprovação visual (PARADA OBRIGATÓRIA)

**Files:**
- Modify: `docs/art.md` (seção 2 paleta, seção nova "Guia de estilo"), `scripts/art/tiles.ts`,
  `scripts/art/character.ts`, `scripts/art-preview.ts`
- Create: `scripts/art/furniture-large.ts`

**Interfaces:**
- Consumes: `sprite`, `PALETTE` (Task 1); `tileset(id, tiles, cell)` (Task 2).
- Produces: tileset novo `furniture-2x1` (célula 32x16) registrado no manifesto e no catálogo.

Peças do piloto, todas no novo padrão: piso de madeira clara (frame 0 de `floors`), ladrilho creme
e carpete cinza (novos, no fim), tapete lavanda em 9 tiles (novos), face e topo de parede (frames 0
e 1 de `walls`) e uma janela (nova), cadeira de escritório (frame 1 de `furniture`), planta (frame 2),
sofá 2x1 (frame 0 de `furniture-2x1`), e um personagem completo (corpo base, cabelo `short`, roupa
`basic`). As demais peças antigas continuam como estão até as Tasks 6 a 10.

- [ ] **Step 1:** escrever o guia de estilo no `docs/art.md` (os 5 pontos dos Global Constraints, com
  a rampa de cada material: madeira, creme, cinza, lavanda, verde de planta, tecido do sofá).
- [ ] **Step 2:** desenhar as peças; `pnpm assets:art`, `pnpm assets:catalog`, `pnpm assets:check` → OK.
- [ ] **Step 3:** `art-preview.ts` passa a montar também uma "cena piloto": um recorte de 12x8 tiles
  com piso, tapete, parede com janela, sofá, cadeira, planta e o personagem em pé, ampliado 4x.
  Gerar em `docs/superpowers/pilot/pilot.png` e o print do jogo rodando.
- [ ] **Step 4:** `pnpm test` → PASS (mapas existentes continuam compilando).
- [ ] **Step 5:** commit `feat(art): folha piloto do novo padrão visual`.
- [ ] **Step 6: PARAR.** Mostrar `pilot.png` e o print ao dono do projeto e esperar aprovação do
  padrão (cores, contorno, sombra, proporção). Ajustar e repetir até aprovar. Só então seguir.

### Task 4: Cliente e editor leem o tamanho de célula

**Files:**
- Modify: `packages/client/src/game/WorldScene.ts`, `packages/client/src/game/tiled.ts`,
  `packages/client/src/editor/EditorScene.ts`, `packages/client/src/editor/editor-controller.ts`,
  `packages/shared/src/editor/operations.ts`
- Test: `packages/shared/src/editor/editor.test.ts`

**Interfaces:**
- Consumes: `TILESETS[id].tileWidth/tileHeight` (Task 2).
- Produces: `placeFurniture(doc, gid, tx, ty)` grava `width`/`height` do objeto pela célula do
  tileset do gid; `FURNITURE_OPTIONS` vira `{ tileset: TilesetId; frame: number; item: string }[]`
  com todos os tilesets de móveis (`furniture`, `furniture-2x1` e os da Task 8).

- [ ] **Step 1: Testes que falham:** `placeFurniture` com o sofá 2x1 grava objeto 32x16 ancorado no
  canto inferior esquerdo do tile clicado; `objectAt` acha o sofá clicando em qualquer um dos dois
  tiles; desfazer devolve o documento idêntico.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** implementar; spritesheets do Phaser carregadas com `frameWidth/frameHeight` do
  tileset; profundidade pela base do objeto, como hoje.
- [ ] **Step 4:** testes → PASS; abrir o app e conferir o sofá no mapa e no editor (print).
- [ ] **Step 5:** commit `feat: cliente e editor com móveis de várias células`.

### Task 5: Mesa de 2 tiles (contrato do mapa)

**Files:**
- Modify: `packages/shared/src/map.ts`, `packages/shared/src/map.test.ts`,
  `packages/shared/src/editor/operations.ts`, `packages/shared/src/editor/editor.test.ts`,
  `packages/shared/src/testing.ts`, `packages/client/src/game/presence.ts`,
  `packages/client/src/game/WorldScene.ts`, `packages/client/src/ui/MapModal.tsx`,
  `docs/architecture.md` (seção 6)

**Interfaces:**
- Produces: `CompiledDesk` ganha `w: number; h: number` (em tiles); `MapError` ganha
  `{ code: 'desk_size'; deskKey: string }` (pegada diferente de 1x1, 2x1 virada para cima/baixo ou
  1x2 virada para esquerda/direita); cadeira = tile de âncora + `DIR_DELTA[orientation]` aplicado a
  partir da borda da pegada (para baixo: `(x, y+1)`; para cima: `(x, y-1)`; para a esquerda:
  `(x-1, y)`; para a direita: `(x+w, y)`), onde âncora é o tile de cima à esquerda da pegada;
  `addDesk` cria 32x16 para cima/baixo e 16x32 para os lados; `rotateDesk` troca `width`/`height`;
  `SLOT_OFFSET_WIDE` em `presence.ts` para mesas de 2 tiles.
- `buildTestMap` aceita `desks[].size?: 1 | 2` (padrão 1).

- [ ] **Step 1: Testes que falham:** mesa 32x16 virada para baixo bloqueia `(x,y)` e `(x+1,y)` e a
  cadeira é `(x, y+1)`; 16x32 virada para a direita bloqueia `(x,y)` e `(x,y+1)` e a cadeira é
  `(x+1, y)`; 32x32 → `desk_size`; 32x16 virada para a esquerda → `desk_size`; mesa 16x16 antiga
  igual a hoje (fixture da Task 2); `addDesk` + `rotateDesk` encostada na parede produz
  `chair_blocked` em `compileMap`, sem exceção.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** implementar; mensagem de `desk_size` no `describeMapError` ("A mesa X precisa
  ocupar 1 tile, ou 2 tiles alinhados com a frente."); registrar a mudança na seção 6 do
  `docs/architecture.md`.
- [ ] **Step 4:** `pnpm test`, `pnpm typecheck` → PASS.
- [ ] **Step 5:** commit `feat(map): mesa de trabalho de 2 tiles`.

### Task 6: Pisos, paredes e tapetes

**Files:**
- Modify: `scripts/art/tiles.ts` (pisos e paredes), `packages/client/src/editor/editor-controller.ts`
  (`FLOOR_OPTIONS` com nomes), `scripts/lib/pixels.ts` (remover `grid`/`COLORS`)
- Create: `packages/shared/src/editor/rug.ts`, `rug.test.ts`

**Interfaces:**
- Produces: `paintRug(doc, rug: RugId, x0, y0, x1, y1): EditorCommand | null` (pinta cantos, bordas e
  miolo na camada `floor`); `RUGS: Record<RugId, { corner: number; edge: number; center: number }>`
  com o frame inicial de cada tapete (ordem dos 9 tiles: NO, N, NE, O, centro, L, SO, S, SE).

- [ ] **Step 1: Teste que falha (`rug.test.ts`):** `paintRug` 3x3 usa os 9 frames na ordem; 2x2 usa
  só os 4 cantos; 1x1 usa o centro; 1xN usa as bordas norte/sul e cantos sem miolo vazio.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** implementar `paintRug` e ferramenta "Tapete" no editor (arrastar retângulo); redesenhar
  os pisos 0-2 no lugar e acrescentar no fim, até o total de 12 ou mais pisos (madeira clara,
  taco espinha de peixe, carpete cinza, carpete lavanda, ladrilho creme, xadrez de copa, grama,
  calçada) e 3 ou mais tapetes de 9 tiles (lavanda, sálvia, creme); paredes 0-1 no lugar e 12 ou mais
  novas (faces claras, rodapé, cantos, janela, quadro, pôster, relógio, lousa).
- [ ] **Step 4:** testes, `pnpm assets:check` → PASS; print do editor com tapete pintado.
- [ ] **Step 5:** commit `feat(art): pisos, paredes e tapetes`.

### Task 7: Móveis pequenos (16x16)

**Files:**
- Modify: `scripts/art/tiles.ts` (`FURNITURE`), `assets/manifest.json`

- [ ] **Step 1:** redesenhar no lugar os frames 0-11 de `furniture` (mesma ordem e `item_id`) e
  acrescentar no fim até 30 ou mais peças: cadeiras (escritório em 4 direções, cadeira de copa),
  pufes em 3 cores, 6 ou mais plantas de vaso, luminária de pé, lixeira, impressora, bebedouro,
  máquina de café, cabideiro, extintor, caixa de papelão, porta (redesenhada, sem `collides`).
- [ ] **Step 2:** `pnpm assets:art`, `assets:catalog`, `assets:check`, `pnpm test` → PASS (a fixture da
  Task 2 continua com o mesmo `walkable`: `collides` de cada frame antigo não muda).
- [ ] **Step 3:** folha de revisão e print; commit `feat(art): móveis pequenos`.

### Task 8: Móveis grandes

**Files:**
- Modify: `scripts/art/furniture-large.ts`, `scripts/gen-art.ts`, `assets/manifest.json`

**Interfaces:**
- Produces: tilesets `furniture-2x2` (32x32) e `furniture-3x2` (48x32), registrados no manifesto e
  no catálogo, entrando em `FURNITURE_OPTIONS`.

- [ ] **Step 1:** desenhar 20 ou mais peças entre os três tilesets grandes: sofás (2 cores, 2x1 e
  3x2 em L), mesa de reunião 3x2 e redonda 2x2, estante 2x2, balcão de copa 3x2, geladeira 2x2
  (desenhada estreita dentro da célula), pingue-pongue 3x2, aquário 2x1, árvore grande 2x2, mesa de
  centro 2x1, poltronas duplas, lousa de pé 2x1, máquina de vendas 2x2.
- [ ] **Step 2:** gerar, conferir e testar como na Task 7.
- [ ] **Step 3:** print no editor e no mapa; commit `feat(art): móveis grandes`.

### Task 9: Mesa larga e decoração de mesa

**Files:**
- Modify: `scripts/art/tiles.ts` (`DESK_DECOR`), `assets/manifest.json`,
  `packages/client/src/ui/labels.ts`, `packages/client/src/ui/DecorEditor.tsx`,
  `packages/client/src/game/WorldScene.ts` (`renderDesk` para mesas de 2 tiles)

- [ ] **Step 1:** redesenhar no lugar os frames 0-11 do `desk-decor`; acrescentar variantes de mesa
  32x16 (madeira clara, madeira escura, branca), monitores largos (simples, duplo, notebook) e itens
  até 20 ou mais (caneca, luminária, livros, planta, porta-lápis, fone, teclado mecânico, mouse,
  cacto, foto, garrafa, post-its, relógio de mesa, caixinha de som, pôster, relógio de parede,
  lixeira, vaso grande). Mesas laterais (16x32) usam versões giradas desenhadas à parte.
- [ ] **Step 2:** `renderDesk` usa `SLOT_OFFSET_WIDE` (Task 5) e as variantes largas quando
  `desk.w * desk.h === 2`; `DecorEditor` mostra a mesa composta ao vivo; rótulos em `labels.ts`.
- [ ] **Step 3:** gerar, testar e print de uma mesa larga decorada; commit `feat(art): mesa larga e decoração`.

### Task 10: Avatares

**Files:**
- Modify: `scripts/art/character.ts`, `assets/manifest.json`, `assets/palettes/*.json`,
  `packages/client/src/ui/labels.ts`

- [ ] **Step 1:** redesenhar corpo base, cabelos, roupas e acessórios no novo padrão, mantendo o
  layout da folha (art.md, seção 4) e os IDs atuais; acrescentar até 6 ou mais cabelos (curto,
  comprido, espetado, cacheado, coque, black power), 6 ou mais roupas (camiseta, moletom, camisa,
  vestido, jaqueta, suéter) e 5 ou mais acessórios (óculos, boné, fone, gorro, laço).
- [ ] **Step 2:** `pnpm assets:art`, `assets:catalog`, `assets:check`, `pnpm test` → PASS.
- [ ] **Step 3:** folha com todas as combinações em uma direção; commit `feat(art): avatares`.

### Task 11: Interface clara e pílulas no mapa

**Files:**
- Modify: `packages/client/src/styles.css` (tokens e componentes), `packages/client/src/game/WorldScene.ts`,
  `packages/client/index.html`, `assets/manifest.json` (créditos da fonte),
  `packages/client/src/ui/CreditsPage.tsx` se a fonte não aparecer pelos créditos gerados
- Create: `packages/client/src/game/labels.ts` (desenho das pílulas)

**Interfaces:**
- Produces: `namePill(scene, text: string, status: Status): Phaser.GameObjects.Container`,
  `zonePill(scene, text: string)`, `chatBubble(scene, text: string)`; fundo das pílulas desenhado
  com `Graphics.fillRoundedRect`, texto com `resolution` alta para ficar nítido em todo zoom.

- [ ] **Step 1:** pedir ao dono do projeto a aprovação da dependência da fonte Inter
  (`@fontsource-variable/inter`, versão estável fixada) antes de instalar. Sem aprovação, usar a
  pilha `system-ui` e seguir.
- [ ] **Step 2:** tokens claros no `:root` (fundo creme fora do mapa, cards brancos com sombra suave e
  cantos de 14 px, texto grafite, primário azul `#4d65b4`/`#4d9be6` da paleta, bordas claras); revisar
  header, sidebar, modais, painel de cards, overlay de rede e replay no tema novo.
- [ ] **Step 3:** pílulas no Phaser substituindo os textos atuais de nome, zona e chat; bolinha de
  status com as cores de `available/focus/away`.
- [ ] **Step 4:** verificação manual de nome longo ("Maria Eduarda Albuquerque 🎧") e curto em zoom 1,
  2 e 3: pílula acompanha o texto, nada cortado, texto nítido (prints).
- [ ] **Step 5:** `pnpm typecheck`, `pnpm lint`, `pnpm test` → PASS; commit `feat(ui): tema claro e pílulas`.

### Task 12: Paleta de móveis do editor por categoria

**Files:**
- Modify: `packages/client/src/editor/EditorPanel.tsx`, `packages/client/src/editor/editor-controller.ts`
- Create: `packages/client/src/editor/categories.ts`

**Interfaces:**
- Produces: `CATEGORIES: { id: string; label: string; items: string[] }[]` por `item_id`
  (Escritório, Sala, Copa, Plantas, Decoração, Portas); item sem categoria cai em "Outros".

- [ ] **Step 1:** teste (`categories.test.ts` no client): todo `item_id` de `FURNITURE_OPTIONS` está em
  alguma categoria ou em "Outros"; nenhum aparece duas vezes.
- [ ] **Step 2:** grade de miniaturas por categoria no painel (reaproveitar o recorte por CSS do
  `DecorEditor`), com nome em português ao passar o mouse.
- [ ] **Step 3:** testes → PASS; print do painel; commit `feat(editor): móveis por categoria`.

### Task 13: Mapa de demonstração novo

**Files:**
- Modify: `scripts/gen-demo-template.ts`, `maps/templates/small-office.json` (gerado)

- [ ] **Step 1:** gerar escritório de cerca de 40x28 tiles com área de mesas por equipe (mesas de 2
  tiles), sala de reunião, lounge com sofás e tapete, copa, área de jogos e área externa com
  árvores; usar a maior variedade possível de peças.
- [ ] **Step 2:** `pnpm maps:demo`; `pnpm test` (o template compila; testes de seed e reset).
- [ ] **Step 3:** `pnpm db:seed` e prints do mapa no navegador; commit `feat: mapa de demonstração novo`.

### Task 14: Documentação e verificação final

**Files:**
- Modify: `docs/art.md` (seções 5, 9 e 10: tilesets, células, gids, contagens), `README.md`,
  `docs/prints/*.png`, `docs/architecture.md` (catálogo com células, editor), `CLAUDE.md` se algum
  comando mudou

- [ ] **Step 1:** atualizar os documentos e tirar prints novos (coworking, mesa decorada, reunião,
  editor, avatar).
- [ ] **Step 2:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm assets:check`, catálogo sem diff,
  `docker build --target web` → tudo OK.
- [ ] **Step 3:** commit `docs: redesenho visual`; abrir PR para revisão.
