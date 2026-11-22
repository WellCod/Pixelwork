import { RENDER_SCALE } from '@pixelwork/shared';
import * as Phaser from 'phaser';
import { WorldScene, type WorldSceneOptions } from './WorldScene.ts';

/** Jogo do Phaser com escala inteira, preenchendo o elemento e acompanhando o tamanho dele. */
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
    // Fora do mapa: o mesmo creme do palco da UI clara.
    backgroundColor: '#ebe3d9',
    scene: [scene],
  });
  // O container muda de tamanho sem a janela mudar (aviso no topo, sidebar): observa ele.
  const observer = new ResizeObserver(() => {
    const { width, height } = size();
    if (width !== game.scale.width || height !== game.scale.height) game.scale.resize(width, height);
  });
  observer.observe(parent);
  game.events.once(Phaser.Core.Events.DESTROY, () => observer.disconnect());
  return { game, scene };
}

export function createGame(parent: HTMLElement, options: WorldSceneOptions): { game: Phaser.Game; scene: WorldScene } {
  return mountGame(parent, new WorldScene(options));
}
