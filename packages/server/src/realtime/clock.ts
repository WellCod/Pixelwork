export interface Clock {
  now(): number;
}

export interface Timer {
  cancel(): void;
}

export interface Scheduler {
  setTimeout(fn: () => void, ms: number): Timer;
  setInterval(fn: () => void, ms: number): Timer;
}

export const systemClock: Clock & Scheduler = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => {
    const handle = setTimeout(fn, ms);
    return { cancel: () => clearTimeout(handle) };
  },
  setInterval: (fn, ms) => {
    const handle = setInterval(fn, ms);
    return { cancel: () => clearInterval(handle) };
  },
};

/** Conta eventos numa janela deslizante; `hit` devolve true quando passa do limite. */
export class WindowCounter {
  private readonly hits: number[] = [];

  constructor(
    private readonly clock: Clock,
    private readonly windowMs: number,
    private readonly max: number,
  ) {}

  hit(): boolean {
    const now = this.clock.now();
    while (this.hits.length > 0 && (this.hits[0] ?? 0) <= now - this.windowMs) this.hits.shift();
    this.hits.push(now);
    return this.hits.length > this.max;
  }
}
