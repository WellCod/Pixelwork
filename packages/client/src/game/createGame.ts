import { RENDER_SCALE } from '@pixelwork/shared';
import * as Phaser from 'phaser';
import { WorldScene, type WorldSceneOptions } from './WorldScene.ts';

/** Jogo do Phaser com escala inteira, preenchendo o elemento e acompanhando o redimensionamento. */
export function mountGame<S extends Phaser.Scene>(parent: HTMLElement, scene: S): { game: Phaser.Game; scene: S } {
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
    scene: [scene],
  });
  const onResize = () => {
    const { width, height } = size();
    game.scale.resize(width, height);
  };
  window.addEventListener('resize', onResize);
  game.events.once(Phaser.Core.Events.DESTROY, () => window.removeEventListener('resize', onResize));
  return { game, scene };
}

export function createGame(parent: HTMLElement, options: WorldSceneOptions): { game: Phaser.Game; scene: WorldScene } {
  return mountGame(parent, new WorldScene(options));
}
