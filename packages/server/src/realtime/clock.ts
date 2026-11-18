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

/** Balde de fichas: `capacity` de rajada, repondo `perSecond` fichas por segundo. */
export class TokenBucket {
  private tokens: number;
  private updatedAt: number;

  constructor(
    private readonly clock: Clock,
    private readonly capacity: number,
    private readonly perSecond: number,
  ) {
    this.tokens = capacity;
    this.updatedAt = clock.now();
  }

  take(): boolean {
    const now = this.clock.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.updatedAt) / 1000) * this.perSecond);
    this.updatedAt = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
