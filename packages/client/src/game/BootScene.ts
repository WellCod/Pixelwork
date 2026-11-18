import { TILE_PX, tilesetImageUrl, type TilesetId } from '@pixelwork/shared';
import * as Phaser from 'phaser';

const FLOORS: TilesetId = 'floors';

// Fase 0: só prova que o pipeline de assets chega ao canvas. O mapa entra na fase 1.
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    this.load.spritesheet(FLOORS, tilesetImageUrl(FLOORS), {
      frameWidth: TILE_PX,
      frameHeight: TILE_PX,
    });
  }

  create(): void {
    const { width, height } = this.scale;
    const cols = 6;
    const rows = 4;
    const left = Math.floor((width - cols * TILE_PX) / 2);
    const top = Math.floor((height - rows * TILE_PX) / 2);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        this.add.image(left + x * TILE_PX, top + y * TILE_PX, FLOORS, (x + y) % 3).setOrigin(0);
      }
    }
  }
}
