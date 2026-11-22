import { STEP_MS } from '@pixelwork/shared';

interface Target {
  x: number;
  y: number;
}

/**
 * O tick (100 ms) e o passo (160 ms) não batem: os passos dos outros chegam a 100 ou 200 ms de
 * distância. A animação de andar segura este tempo depois de a fila esvaziar, para não piscar
 * o quadro parado entre dois passos.
 */
const WALK_HOLD_MS = 120;

/**
 * Interpolação de tile a tile. Até dois passos na fila andam na velocidade normal (o segundo é
 * só o jitter do tick); acima disso a velocidade sobe para o avatar não ficar para trás.
 */
export class Mover {
  x: number;
  y: number;
  private queue: Target[] = [];
  private idleMs = Infinity;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  get moving(): boolean {
    return this.queue.length > 0 || this.idleMs < WALK_HOLD_MS;
  }

  /**
   * Correção da predição do próprio avatar: até um tile de distância desliza, mais que isso
   * teleporta. Antes era sempre um salto seco.
   */
  correct(x: number, y: number): void {
    this.queue = [];
    if (Math.abs(x - this.x) + Math.abs(y - this.y) <= 1.5) {
      if (x !== this.x || y !== this.y) this.queue.push({ x, y });
    } else {
      this.snap(x, y);
    }
  }

  /** Alvo a mais de um tile do último conhecido é teleporte: vai direto. */
  push(x: number, y: number): void {
    const last = this.queue.at(-1) ?? { x: this.x, y: this.y };
    if (Math.abs(x - last.x) + Math.abs(y - last.y) > 1) this.snap(x, y);
    else if (x !== last.x || y !== last.y) this.queue.push({ x, y });
  }

  snap(x: number, y: number): void {
    this.queue = [];
    this.idleMs = Infinity;
    this.x = x;
    this.y = y;
  }

  update(dtMs: number): void {
    if (this.queue.length === 0) {
      this.idleMs += dtMs;
      return;
    }
    this.idleMs = 0;
    let budget = dtMs;
    while (budget > 0) {
      const target = this.queue[0];
      if (!target) return;
      const speed = Math.max(1, this.queue.length - 1) / STEP_MS;
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const distance = Math.abs(dx) + Math.abs(dy);
      const reach = speed * budget;
      if (reach >= distance) {
        this.x = target.x;
        this.y = target.y;
        this.queue.shift();
        budget -= distance / speed;
      } else {
        this.x += Math.sign(dx) * reach;
        this.y += Math.sign(dy) * reach;
        return;
      }
    }
  }
}
