// Teclas da raquete: setas, W/S e os botões de toque viram uma direção, e só a mudança vai para o
// servidor. Fora da mesa (ou digitando num campo) nada é tratado: W e S são letras do chat.
import type { PongDir } from '@pixelwork/shared';

const UP = new Set(['ArrowUp', 'w', 'W', 'touch-up']);
const DOWN = new Set(['ArrowDown', 's', 'S', 'touch-down']);

export class PaddleKeys {
  private readonly held = new Set<string>();
  private sent: PongDir = 0;

  constructor(private readonly send: (dir: PongDir) => void) {}

  /** Tecla apertada ou solta. Devolve se ela é da raquete (para o `preventDefault`). */
  press(key: string, down: boolean, active: boolean): boolean {
    if (!active || (!UP.has(key) && !DOWN.has(key))) return false;
    if (down) this.held.add(key);
    else this.held.delete(key);
    const keys = [...this.held];
    const up = keys.some((k) => UP.has(k));
    const dn = keys.some((k) => DOWN.has(k));
    const dir: PongDir = up === dn ? 0 : up ? -1 : 1;
    if (dir !== this.sent) {
      this.sent = dir;
      this.send(dir);
    }
    return true;
  }

  /** Reconexão ou partida nova: o servidor zerou a raquete, então a próxima tecla vale de novo. */
  reset(): void {
    this.held.clear();
    this.sent = 0;
  }
}
