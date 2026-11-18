import { STEP_MS } from '@pixelwork/shared';

interface Target {
  x: number;
  y: number;
}

/**
 * Interpolação de tile a tile. Com vários passos na fila a velocidade sobe na mesma
 * proporção, então o avatar nunca fica mais de um passo atrás do último alvo.
 */
export class Mover {
  x: number;
  y: number;
  private queue: Target[] = [];

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  get moving(): boolean {
    return this.queue.length > 0;
  }

  /** Alvo a mais de um tile do último conhecido é teleporte: vai direto. */
  push(x: number, y: number): void {
    const last = this.queue.at(-1) ?? { x: this.x, y: this.y };
    if (Math.abs(x - last.x) + Math.abs(y - last.y) > 1) this.snap(x, y);
    else if (x !== last.x || y !== last.y) this.queue.push({ x, y });
  }

  snap(x: number, y: number): void {
    this.queue = [];
    this.x = x;
    this.y = y;
  }

  update(dtMs: number): void {
    let budget = dtMs;
    while (budget > 0) {
      const target = this.queue[0];
      if (!target) return;
      const speed = this.queue.length / STEP_MS;
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
