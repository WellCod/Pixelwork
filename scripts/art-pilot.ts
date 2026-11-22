// Cena piloto do redesenho visual: um recorte de escritório montado com os tilesets gerados,
// ampliado, para aprovar o padrão antes de produzir o volume. Simula as sombras translúcidas que
// o Phaser desenha sob móveis e avatares. `pnpm tsx scripts/art-pilot.ts [saida.png]`.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';
import { KEY_RAMPS } from './lib/palette.ts';

const root = join(import.meta.dirname, '..');
const out = process.argv[2] ?? join(root, 'docs/superpowers/pilot/pilot.png');
const T = 16;
const SCALE = 4;
const W = 12;
const H = 8;

const sheet = (id: string) => PNG.sync.read(readFileSync(join(root, 'assets/tilesets', `${id}.png`)));
const tsj = (id: string) => JSON.parse(readFileSync(join(root, 'assets/tilesets', `${id}.tsj`), 'utf8')) as { tilewidth: number; tileheight: number; columns: number };
const ramps = (kind: string) =>
  JSON.parse(readFileSync(join(root, 'assets/palettes', `${kind}.json`), 'utf8')) as Record<string, string[]>;

const canvas = new PNG({ width: W * T, height: H * T });

function put(x: number, y: number, rgb: number[], alpha = 1): void {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
  const i = (y * canvas.width + x) * 4;
  for (let c = 0; c < 3; c++) canvas.data[i + c] = Math.round((canvas.data[i + c] ?? 0) * (1 - alpha) + (rgb[c] ?? 0) * alpha);
  canvas.data[i + 3] = 255;
}

/** Copia o frame `frame` do tileset para (dx, dy), trocando cores-chave se houver `swap`. */
function frame(id: string, index: number, dx: number, dy: number, swap?: Map<string, number[]>): void {
  const src = sheet(id);
  const meta = tsj(id);
  const sx = (index % meta.columns) * meta.tilewidth;
  const sy = Math.floor(index / meta.columns) * meta.tileheight;
  for (let y = 0; y < meta.tileheight; y++) {
    for (let x = 0; x < meta.tilewidth; x++) {
      const i = ((sy + y) * src.width + sx + x) * 4;
      if ((src.data[i + 3] ?? 0) === 0) continue;
      const rgb = [src.data[i] ?? 0, src.data[i + 1] ?? 0, src.data[i + 2] ?? 0];
      const key = `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
      put(dx + x, dy + y, swap?.get(key) ?? rgb);
    }
  }
}

/** Sombra de contato: elipse translúcida na cor mais escura da paleta, sob a pegada. */
function shadow(cx: number, cy: number, rx: number, ry: number): void {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) put(x, y, [0x2e, 0x22, 0x2f], 0.18);
    }
  }
}

// Piso: creme à esquerda com tapete lavanda, madeira no meio, carpete cinza à direita.
for (let y = 2; y < H; y++) {
  for (let x = 0; x < W; x++) frame('floors', x < 6 ? 3 : x < 9 ? 0 : 4, x * T, y * T);
}
const RUG = 5; // primeiro dos 9 tiles do tapete lavanda
for (let y = 4; y <= 6; y++) {
  for (let x = 1; x <= 4; x++) {
    const col = x === 1 ? 0 : x === 4 ? 2 : 1;
    const row = y === 4 ? 0 : y === 6 ? 2 : 1;
    frame('floors', RUG + row * 3 + col, x * T, y * T);
  }
}
// Parede: topo e face, com duas janelas.
for (let x = 0; x < W; x++) {
  frame('walls', 0, x * T, 0);
  frame('walls', x === 3 || x === 8 ? 2 : 1, x * T, T);
}

// Móveis e personagem, desenhados de cima para baixo (profundidade pela base).
interface Item {
  base: number;
  draw: () => void;
}
const items: Item[] = [];
const furniture = (id: string, index: number, tx: number, ty: number, w = 1) => {
  const meta = tsj(id);
  const bottom = (ty + 1) * T;
  items.push({
    base: bottom,
    draw: () => {
      shadow(tx * T + (w * T) / 2, bottom - 2, (w * T) / 2 - 1, 3);
      frame(id, index, tx * T, bottom - meta.tileheight);
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
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const pick = (kind: 'skin' | 'hair' | 'outfit', id: string) =>
  KEY_RAMPS[kind].forEach((key, i) => swap.set(key, hex(ramps(kind)[id]?.[i] ?? '#ff00ff')));
pick('skin', 'light');
pick('hair', 'brown');
pick('outfit', 'blue');
const person = (tx: number, ty: number) => {
  const bottom = (ty + 1) * T;
  items.push({
    base: bottom,
    draw: () => {
      shadow(tx * T + T / 2, bottom - 2, 5, 2);
      for (const layer of ['body/base', 'outfit/basic', 'hair/short']) {
        const src = PNG.sync.read(readFileSync(join(root, 'assets/characters', `${layer}.png`)));
        for (let y = 0; y < 32; y++) {
          for (let x = 0; x < 16; x++) {
            const i = (y * src.width + x) * 4;
            if ((src.data[i + 3] ?? 0) === 0) continue;
            const rgb = [src.data[i] ?? 0, src.data[i + 1] ?? 0, src.data[i + 2] ?? 0];
            const key = `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
            put(tx * T + x, bottom - 32 + y, swap.get(key) ?? rgb);
          }
        }
      }
    },
  });
};
person(4, 5);
person(8, 6);

for (const item of items.sort((a, b) => a.base - b.base)) item.draw();

// Amplia sem suavizar.
const big = new PNG({ width: canvas.width * SCALE, height: canvas.height * SCALE });
for (let y = 0; y < big.height; y++) {
  for (let x = 0; x < big.width; x++) {
    const s = (Math.floor(y / SCALE) * canvas.width + Math.floor(x / SCALE)) * 4;
    big.data.set(canvas.data.subarray(s, s + 4), (y * big.width + x) * 4);
  }
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, PNG.sync.write(big));
console.log(`cena piloto em ${out}`);
