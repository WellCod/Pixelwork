import { RENDER_SCALE } from '@pixelwork/shared';
import * as Phaser from 'phaser';
import { WorldScene, type WorldSceneOptions } from './WorldScene.ts';

export function createGame(parent: HTMLElement, options: WorldSceneOptions): Phaser.Game {
  const size = () => ({
    width: Math.max(1, Math.floor(parent.clientWidth / RENDER_SCALE)),
    height: Math.max(1, Math.floor(parent.clientHeight / RENDER_SCALE)),
  });
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    ...size(),
    zoom: RENDER_SCALE,
    pixelArt: true,
    backgroundColor: '#181425',
    scene: [new WorldScene(options)],
  });
  const onResize = () => {
    const { width, height } = size();
    game.scale.resize(width, height);
  };
  window.addEventListener('resize', onResize);
  game.events.once(Phaser.Core.Events.DESTROY, () => window.removeEventListener('resize', onResize));
  return game;
}
