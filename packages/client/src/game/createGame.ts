import { RENDER_SCALE, TILE_PX } from '@pixelwork/shared';
import * as Phaser from 'phaser';
import { BootScene } from './BootScene.ts';

const VIEW_TILES_X = 20;
const VIEW_TILES_Y = 12;

export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: VIEW_TILES_X * TILE_PX,
    height: VIEW_TILES_Y * TILE_PX,
    zoom: RENDER_SCALE,
    pixelArt: true,
    backgroundColor: '#262b44',
    scene: [BootScene],
  });
}
