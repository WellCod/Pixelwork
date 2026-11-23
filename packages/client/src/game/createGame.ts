import * as Phaser from 'phaser';
import { dpr } from './scale.ts';
import { WorldScene, type WorldSceneOptions } from './WorldScene.ts';

/** Jogo do Phaser em resolução de tela, preenchendo o elemento e acompanhando o tamanho dele. */
export function mountGame<S extends Phaser.Scene>(parent: HTMLElement, scene: S): { game: Phaser.Game; scene: S } {
  // Tamanho do canvas em pixels físicos; o `zoom: 1 / dpr()` abaixo devolve ele ao tamanho CSS do elemento.
  const canvasSize = () => ({
    width: Math.max(1, Math.floor(parent.clientWidth * dpr())),
    height: Math.max(1, Math.floor(parent.clientHeight * dpr())),
  });
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    ...canvasSize(),
    zoom: 1 / dpr(),
    pixelArt: true,
    // Fora do mapa: o mesmo creme do palco da UI clara.
    backgroundColor: '#ebe3d9',
    scene: [scene],
  });
  // O container muda de tamanho sem a janela mudar (aviso no topo, sidebar): observa ele.
  const observer = new ResizeObserver(() => {
    const { width, height } = canvasSize();
    if (width !== game.scale.width || height !== game.scale.height) game.scale.resize(width, height);
  });
  observer.observe(parent);
  game.events.once(Phaser.Core.Events.DESTROY, () => observer.disconnect());
  return { game, scene };
}

/** Monta o jogo do coworking com a cena do mundo. */
export function createGame(parent: HTMLElement, options: WorldSceneOptions): { game: Phaser.Game; scene: WorldScene } {
  return mountGame(parent, new WorldScene(options));
}
