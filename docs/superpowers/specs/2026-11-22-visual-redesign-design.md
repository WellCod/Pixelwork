# Redesenho visual: mundo em pixel art e interface clara

Data: 2026-11-22. Status: aguardando aprovação do dono do projeto.

## Intenção

O Pixelwork é um projeto de portfólio. Quem abre pela primeira vez (um recrutador, por exemplo)
precisa achar bonito e caprichado nos primeiros segundos. Hoje o núcleo de tempo real é sólido,
mas o visual é "de protótipo": arte gerada por script com pouco sombreado, paleta Endesga 32
saturada e uma UI escura genérica que não conversa com o mundo.

A referência do dono do projeto são prints do Gather: escritório claro e aconchegante em pixel art
(piso creme, tapetes lavanda, cinza de escritório, verde-sálvia), móveis detalhados, muitas
plantas, nomes em pílulas escuras com bolinha de status, rótulos de zona em pílula clara, cards
brancos arredondados com sombra suave e botão primário azul. O pedido explícito: **qualidade e
capricho, muitos objetos para colocar e cores que combinem, suaves e bonitas**.

## Objetivos

1. Paleta suave e harmônica no lugar da Endesga 32, usada em toda a arte.
2. Arte original redesenhada com padrão alto: contorno, luz e sombra consistentes em tudo.
3. Muito mais coisa para colocar no mapa: dezenas de móveis, plantas, decoração, pisos e paredes.
4. Móveis grandes (sofá, mesa de reunião, estante, pingue-pongue) como um objeto só no editor.
5. Avatares redesenhados no mesmo padrão, com mais cabelos, roupas e acessórios.
6. Interface clara no estilo da referência: pílulas de nome e de zona, cards brancos, sombras
   suaves, botão azul, uma fonte com personalidade.
7. Mapa de demonstração novo, bem mobiliado, que mostre tudo isso.

## Fora do escopo

- Mudar a grade de 16 px ou o `RENDER_SCALE` (16 px dá conta, como em Stardew Valley).
- Animação de objetos, iluminação dinâmica, ciclo dia e noite.
- Features novas de produto (aceno, calendário etc. que aparecem na referência).
- Tema escuro alternativo para a UI.

## O que tornaria isto um fracasso mesmo funcionando

- Copiar ou decalcar arte, ícones ou identidade do Gather (os prints são referência de estilo).
- Asset de terceiros com licença que o `docs/art.md` proíbe.
- Mapas salvos quebrando ou mudando de sentido (um tile que era mesa virar planta).
- Cores "de jogo" saturadas, ou UI e mundo com estéticas diferentes.
- Muitos objetos sem coesão: estilos de contorno, luz ou proporção diferentes entre peças.

## Restrições

- Invariantes do CLAUDE.md, principalmente: 6 (assets só por ID do catálogo), 7 (tilesets só
  crescem, posições nunca mudam) e 8 (licenças).
- `docs/art.md`: todo PNG só com cores da paleta, cores-chave de troca de paleta e transparência
  total (conferido no CI por `pnpm assets:check`); tilesets com 8 colunas; 100 gids reservados por
  tileset no mapa (firstgid 1, 101, 201, 301...), então cada tileset tem no máximo 100 tiles.
- Contrato do mapa (`docs/architecture.md`, seção 6): tile do mapa de 16x16; móveis são objetos de
  tile ancorados no canto inferior esquerdo; colisão pela propriedade `collides`.
- CSP do Caddy é `default-src 'self'`: fonte externa (Google Fonts) não carrega; fonte vai no
  próprio app.
- Arte desenhada pelo Claude em código é permitida e tem licença `own` (art.md, seção 7).

## Abordagens consideradas (decididas na conversa)

**Origem da arte.** Pesquisadas: CC0 de escritório quase não existe (um pacote pequeno no
OpenGameArt); "LPC revised the office" é CC-BY-SA (proibido); o pacote pago mais próximo da
referência (LimeZu Modern Interiors) não permite redistribuir os arquivos, então não pode ficar no
repositório público. Escolhido pelo dono: **arte original feita pelo Claude**, priorizando
capricho. Descartado comprar um pacote e mantê-lo fora do repo: quem clonasse não teria a arte e a
regra 8 teria de mudar.

**Paleta.** Escolhida a **Resurrect 64** (Lospec, 64 cores, uso livre): tem cremes, lavandas,
sálvias, madeiras claras e rampas de sombra calibradas. Descartada uma paleta própria: risco alto
de cores que não conversam.

**Método de desenho.** Mantido o atual: **grades de caracteres desenhadas à mão** em
`scripts/art/`, um caractere por cor, com controle pixel a pixel; o padrão sobe com um guia de
estilo (abaixo). Descartado desenho procedural por fórmulas: fica "matemático" e sem capricho.

**Móveis grandes.** Escolhido: **tilesets com células maiores** (32x32, 48x32 etc.), cada móvel
grande vira um objeto de tile só, como o Tiled já suporta. O cliente e o editor passam a ler o
tamanho da célula de cada tileset. Descartado montar móveis grandes com peças de 16x16: edição
penosa e desenho que quebra quando uma peça sai do lugar.

## Como fica (decidido)

### Paleta e guia de estilo

- `assets/palette.hex` passa a ser a Resurrect 64. As rampas de pele, cabelo e roupa
  (`assets/palettes/*.json`) são refeitas com cores dela.
- Guia de estilo, registrado no `docs/art.md` e seguido em todo asset:
  - Luz vinda de cima e da esquerda. Cada material com 3 a 4 tons da mesma rampa (luz, base,
    sombra, sombra profunda).
  - Contorno escuro colorido (o tom mais escuro da rampa do material ou um azul-acinzentado escuro
    da paleta), nunca preto puro; contorno interno mais claro onde a luz bate.
  - Sombra de contato no chão sob cada móvel, desenhada no próprio sprite com um tom escuro do
    piso (a paleta não tem transparência parcial).
  - Visão top-down com a frente do móvel aparecendo (perspectiva de 3/4 leve), como na referência.
  - Ambiente claro e pastel: pisos e paredes de baixo contraste; o contraste vai para os móveis,
    plantas e pessoas, que precisam se destacar do fundo.
- `scripts/art-preview.ts` gera a folha de revisão de cada lote para conferir coesão lado a lado.

### Tilesets

- Os quatro tilesets atuais são **redesenhados no lugar**: mesmo frame, mesmo sentido (o frame 0 do
  `furniture` continua sendo a mesa). Itens novos entram no fim.
- Novos tilesets, cada um com até 100 tiles e 8 colunas, com o tamanho de célula no próprio `.tsj`
  (`tilewidth`/`tileheight`):
  - `floors` e `walls` crescem com mais variações (alvo: 12 ou mais pisos, como madeira clara,
    taco espinha de peixe, carpete cinza de escritório, carpete lavanda, ladrilho creme,
    xadrez de copa, grama e calçada para a área externa; e 12 ou mais tiles de parede: faces
    claras, rodapé, cantos, janelas e decoração de parede).
  - **Tapetes são tiles de piso**, não objetos: cada tapete é um conjunto de 9 tiles (4 cantos, 4
    bordas e miolo) pintados na camada `floor` em qualquer tamanho. Assim ficam sempre abaixo dos
    avatares sem propriedade nova no contrato (decisão do Claude, depois da revisão).
  - **Quadros, relógio, pôster e janelas são variações de tile de parede** na camada `walls` (que
    já colide e já é desenhada atrás de tudo). Mesmo motivo.
  - **Portas continuam como móvel** no `furniture`, sem `collides`, como hoje: na camada `walls`
    todo tile colide.
  - `furniture` (16x16) cresce com peças pequenas: cadeiras, pufes, plantas de vaso, luminárias,
    lixeira, impressora, bebedouro, máquina de café, quadros de parede, relógio etc.
  - `furniture-2x1` (32x16), `furniture-2x2` (32x32), `furniture-3x2` (48x32): sofás, mesas de
    reunião, estantes, pingue-pongue, balcão de copa, geladeira, aquário, árvores grandes, tapetes.
  - Alvo total: **60 ou mais objetos colocáveis** além de pisos e paredes, e **20 ou mais itens de
    decoração de mesa** (`desk-decor` cresce no fim).
- Colisão: a propriedade `collides` vale para a pegada inteira do objeto (`width`/`height` do
  objeto no mapa, como o `compileMap` já faz). Tapetes e decoração de parede não colidem.
- `assets/manifest.json` ganha os tilesets novos (licença `own`) e os itens novos de decoração;
  `pnpm assets:catalog` gera o catálogo com o tamanho de célula de cada tileset.
- Cada tileset novo recebe o próximo bloco de 100 gids no mapa (firstgid 401, 501...).

### Código que muda para a arte

- Catálogo (`TILESETS`) passa a ter `tileWidth` e `tileHeight` por tileset.
- Cliente (`WorldScene`, `EditorScene`): carrega cada spritesheet com a célula do seu tileset;
  objetos grandes desenhados ancorados no canto inferior esquerdo, com profundidade pela base.
- Editor: paleta de móveis com miniatura e nome, agrupada por categoria (escritório, sala, copa,
  plantas, decoração); colocar um móvel grande grava o objeto com `width`/`height` da célula.
- `compileMap`: aceita os tilesets novos (já valida `source` pelo catálogo); colisão pela pegada,
  como hoje.
- Sombras dos avatares: elipse suave desenhada pelo Phaser sob cada avatar (código, não asset).

### Mesa de trabalho de 2 tiles (decidido pelo dono do projeto)

- A mesa atribuível passa a ocupar 2 tiles: 32x16 virada para cima ou para baixo, 16x32 virada
  para a esquerda ou a direita. Cabe monitor, teclado e mais itens lado a lado, como na referência.
- A pegada vem do tamanho do próprio objeto no Tiled (`width` e `height` do objeto na camada
  `desks`): 16x16 continua sendo a mesa de 1 tile, então mapas salvos antigos seguem válidos sem
  conversão e sem propriedade nova. O `compileMap` bloqueia todos os tiles da pegada.
- A cadeira fica na frente do tile de âncora (o da esquerda, ou o de cima nas mesas laterais).
  Decisão do Claude: mantém a cadeira no grid sem meio-tile. A mesa é desenhada para o assento
  parecer natural nessa posição.
- Mudança de contrato do mapa: seção 6 do `docs/architecture.md` (pegada pelo tamanho do objeto,
  posição da cadeira, novo erro se a pegada não for 1x1, 2x1 ou 1x2 ou se sair do mapa). O editor
  coloca mesas de 2 tiles por padrão.
- Decoração: os lugares de itens são redesenhados para a mesa larga (sobre a mesa à esquerda e à
  direita do monitor, parede atrás, chão ao lado); a mesa de 1 tile usa as posições de hoje.
- Variantes de mesa (`basic`, `dark` e novas) e monitores ganham versão de 2 tiles no
  `desk-decor`, no fim do tileset.

### Avatares

- Corpo base redesenhado no novo padrão (16x32, mesmo layout de folha, mesmas coordenadas entre
  camadas).
- Alvo: 6 ou mais cabelos, 6 ou mais roupas, 5 ou mais acessórios (óculos, boné, fone, chapéu,
  laço...). Rampas refeitas: 6 de pele, 8 de cabelo, 8 de roupa.

### Interface

- Tema claro no estilo da referência, só com variáveis CSS (o `styles.css` já está tokenizado):
  fundo creme fora do mapa, cards brancos com cantos de 12 a 16 px e sombra suave, texto
  grafite, botão primário azul, botões secundários brancos com borda clara.
- No mapa (Phaser): nome do jogador em **pílula escura arredondada** com bolinha de status
  colorida e texto claro; rótulo de zona em **pílula clara** translúcida; balão de chat branco
  arredondado com rabicho.
- Fonte: Inter (licença SIL OFL 1.1), servida pelo próprio app e registrada nos créditos. Os
  rótulos do Phaser usam a mesma fonte, renderizada em resolução alta para ficar nítida.
- Ícones da UI no mesmo traço dos atuais (`ui/icons.tsx`).
- Sidebar, header, modais, painel de cards e overlay de rede ajustados ao tema claro; nada de
  layout novo além do necessário para o visual.

### Mapa de demonstração

- `scripts/gen-demo-template.ts` gera um escritório novo e bem mobiliado com o que existir de
  arte: área de mesas por equipe, sala de reunião, lounge com sofás e tapete, copa, área de jogos
  e um pedaço externo com árvores.
- As chaves de zona e de mesa podem mudar: o reset diário da demo limpa as atribuições.

### Documentação

- `docs/art.md`: paleta nova, guia de estilo, tamanhos de célula, lista de tilesets e gids.
- `docs/architecture.md`: catálogo com tamanho de célula e mudanças no editor.
- README e `docs/prints/`: prints novos.

## Decisões tomadas depois da revisão

- Tapetes como tiles de piso e decoração de parede como tiles de parede: evitam uma propriedade
  nova de camada no contrato (o problema era tapete grande ficar por cima de quem pisa nele).
- Portas como móvel sem colisão, como hoje.
- Mesa de 2 tiles com pegada pelo tamanho do objeto (dono do projeto); cadeira na frente do tile de
  âncora (Claude).
- A categoria dos móveis no editor (escritório, sala, copa, plantas) fica numa tabela do cliente
  por `item_id`, não no `.tsj`: é só organização da paleta do editor, não contrato.

## O que fica para quem implementar

- O desenho de cada peça, a lista exata de itens e os nomes em português de cada um.
- A ordem de produção: recomendo paleta e guia de estilo primeiro, depois uma folha piloto com
  poucas peças para aprovação do visual, e só então o volume.
- Detalhes de CSS e dos componentes do tema claro.

## Validação

- `pnpm assets:check` (paleta), `pnpm assets:catalog` sem diff no CI, testes do catálogo e do
  `compileMap` com o mapa novo e com um mapa salvo antigo (mapas antigos continuam válidos).
- Folha de revisão (`art-preview`) e prints no navegador a cada lote, comparados lado a lado com
  a referência em qualidade e coesão.
- Typecheck, lint, testes e E2E verdes.
