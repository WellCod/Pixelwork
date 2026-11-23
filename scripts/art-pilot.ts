// Cena piloto do redesenho visual: um recorte de escritório montado com os tilesets gerados,
// ampliado, para aprovar o padrão antes de produzir o volume. Simula as sombras translúcidas que
// o Phaser desenha sob móveis e avatares. `pnpm tsx scripts/art-pilot.ts [saida.png]`.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';
import { RUGS, rugMask } from '@pixelwork/shared/editor';
import { KEY_RAMPS } from './lib/palette.ts';

const root = join(import.meta.dirname, '..');
const outputPath = process.argv[2] ?? join(root, 'docs/superpowers/pilot/pilot.png');
const TILE = 16;
const SCALE = 4;
// Tamanho da cena em tiles.
const SCENE_WIDTH = 12;
const SCENE_HEIGHT = 8;

const readSheet = (id: string) => PNG.sync.read(readFileSync(join(root, 'assets/tilesets', `${id}.png`)));
const readTsj = (id: string) =>
  JSON.parse(readFileSync(join(root, 'assets/tilesets', `${id}.tsj`), 'utf8')) as {
    tilewidth: number;
    tileheight: number;
    columns: number;
  };
const readRamps = (kind: string) =>
  JSON.parse(readFileSync(join(root, 'assets/palettes', `${kind}.json`), 'utf8')) as Record<string, string[]>;

const canvas = new PNG({ width: SCENE_WIDTH * TILE, height: SCENE_HEIGHT * TILE });

/** Pinta um pixel misturando com o que já está lá pelo `alpha` (1 cobre, abaixo disso é sombra). */
function put(x: number, y: number, rgb: number[], alpha = 1): void {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
  const offset = (y * canvas.width + x) * 4;
  for (let channel = 0; channel < 3; channel++) {
    canvas.data[offset + channel] = Math.round(
      (canvas.data[offset + channel] ?? 0) * (1 - alpha) + (rgb[channel] ?? 0) * alpha,
    );
  }
  canvas.data[offset + 3] = 255;
}

/** Copia o frame `index` do tileset para (dx, dy), trocando cores-chave se houver `swap`. */
function frame(id: string, index: number, dx: number, dy: number, swap?: Map<string, number[]>): void {
  const sheet = readSheet(id);
  const meta = readTsj(id);
  const sourceX = (index % meta.columns) * meta.tilewidth;
  const sourceY = Math.floor(index / meta.columns) * meta.tileheight;
  for (let y = 0; y < meta.tileheight; y++) {
    for (let x = 0; x < meta.tilewidth; x++) {
      const sourceOffset = ((sourceY + y) * sheet.width + sourceX + x) * 4;
      if ((sheet.data[sourceOffset + 3] ?? 0) === 0) continue;
      const rgb = [sheet.data[sourceOffset] ?? 0, sheet.data[sourceOffset + 1] ?? 0, sheet.data[sourceOffset + 2] ?? 0];
      const hexKey = `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
      put(dx + x, dy + y, swap?.get(hexKey) ?? rgb);
    }
  }
}

/** Sombra de contato: elipse translúcida na cor mais escura da paleta, sob a pegada. */
function shadow(centerX: number, centerY: number, radiusX: number, radiusY: number): void {
  for (let y = Math.floor(centerY - radiusY); y <= centerY + radiusY; y++) {
    for (let x = Math.floor(centerX - radiusX); x <= centerX + radiusX; x++) {
      // Testa o centro do pixel (+0,5) contra a equação da elipse.
      if (((x + 0.5 - centerX) / radiusX) ** 2 + ((y + 0.5 - centerY) / radiusY) ** 2 <= 1) {
        put(x, y, [0x2e, 0x22, 0x2f], 0.18);
      }
    }
  }
}

// Piso: creme à esquerda com tapete lavanda, madeira no meio, carpete cinza à direita.
for (let y = 2; y < SCENE_HEIGHT; y++) {
  for (let x = 0; x < SCENE_WIDTH; x++) frame('floors', x < 6 ? 3 : x < 9 ? 0 : 4, x * TILE, y * TILE);
}
// Tapete lavanda 4x3: cada tile escolhe o frame pela máscara das bordas de fora, como no editor.
const RUG_LEFT = 1;
const RUG_TOP = 4;
const RUG_WIDTH = 4;
const RUG_HEIGHT = 3;
for (let y = RUG_TOP; y < RUG_TOP + RUG_HEIGHT; y++) {
  for (let x = RUG_LEFT; x < RUG_LEFT + RUG_WIDTH; x++) {
    const edges = rugMask(x - RUG_LEFT, y - RUG_TOP, RUG_WIDTH, RUG_HEIGHT);
    frame('floors', RUGS.lavender.first + edges, x * TILE, y * TILE);
  }
}
// Parede: topo e face, com duas janelas.
for (let x = 0; x < SCENE_WIDTH; x++) {
  frame('walls', 0, x * TILE, 0);
  frame('walls', x === 3 || x === 8 ? 2 : 1, x * TILE, TILE);
}

// Móveis e personagem, desenhados de cima para baixo (profundidade pela base).
interface Item {
  base: number;
  draw: () => void;
}
const items: Item[] = [];
/** Móvel com âncora no tile de baixo à esquerda (tileX, tileY), ocupando `widthTiles` de largura. */
const furniture = (id: string, index: number, tileX: number, tileY: number, widthTiles = 1) => {
  const meta = readTsj(id);
  const bottom = (tileY + 1) * TILE;
  items.push({
    base: bottom,
    draw: () => {
      shadow(tileX * TILE + (widthTiles * TILE) / 2, bottom - 2, (widthTiles * TILE) / 2 - 1, 3);
      frame(id, index, tileX * TILE, bottom - meta.tileheight);
    },
  });
};
furniture('furniture', 2, 0, 2); // planta
furniture('furniture', 2, 5, 2);
furniture('furniture', 2, 11, 2);
furniture('furniture-2x1', 0, 2, 4, 2); // sofá pêssego sobre o tapete
furniture('furniture-2x1', 1, 6, 3, 2); // sofá sálvia
furniture('furniture', 1, 9, 4); // cadeiras
furniture('furniture', 1, 10, 4);

// Personagem de frente: corpo, roupa e cabelo com rampas trocadas.
const swap = new Map<string, number[]>();
const hexToRgb = (hex: string) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
const pickRamp = (kind: 'skin' | 'hair' | 'outfit', rampId: string) =>
  KEY_RAMPS[kind].forEach((keyColor, toneIndex) =>
    swap.set(keyColor, hexToRgb(readRamps(kind)[rampId]?.[toneIndex] ?? '#ff00ff')),
  );
pickRamp('skin', 'light');
pickRamp('hair', 'brown');
pickRamp('outfit', 'blue');
/** Personagem parado de frente (primeiro quadro 16x32 de cada camada) com os pés no tile (tileX, tileY). */
const person = (tileX: number, tileY: number) => {
  const bottom = (tileY + 1) * TILE;
  items.push({
    base: bottom,
    draw: () => {
      shadow(tileX * TILE + TILE / 2, bottom - 2, 5, 2);
      for (const layer of ['body/base', 'outfit/basic', 'hair/short']) {
        const layerImage = PNG.sync.read(readFileSync(join(root, 'assets/characters', `${layer}.png`)));
        for (let y = 0; y < 32; y++) {
          for (let x = 0; x < 16; x++) {
            const sourceOffset = (y * layerImage.width + x) * 4;
            if ((layerImage.data[sourceOffset + 3] ?? 0) === 0) continue;
            const rgb = [
              layerImage.data[sourceOffset] ?? 0,
              layerImage.data[sourceOffset + 1] ?? 0,
              layerImage.data[sourceOffset + 2] ?? 0,
            ];
            const hexKey = `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
            put(tileX * TILE + x, bottom - 32 + y, swap.get(hexKey) ?? rgb);
          }
        }
      }
    },
  });
};
person(4, 5);
person(8, 6);

for (const item of items.sort((itemA, itemB) => itemA.base - itemB.base)) item.draw();

// Amplia sem suavizar.
const scaled = new PNG({ width: canvas.width * SCALE, height: canvas.height * SCALE });
for (let y = 0; y < scaled.height; y++) {
  for (let x = 0; x < scaled.width; x++) {
    const sourceOffset = (Math.floor(y / SCALE) * canvas.width + Math.floor(x / SCALE)) * 4;
    scaled.data.set(canvas.data.subarray(sourceOffset, sourceOffset + 4), (y * scaled.width + x) * 4);
  }
}
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, PNG.sync.write(scaled));
console.log(`cena piloto em ${outputPath}`);
