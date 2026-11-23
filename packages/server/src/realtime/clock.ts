/** Relógio injetável: os testes trocam pelo ManualClock e avançam o tempo à mão. */
export interface Clock {
  now(): number;
}

export interface Timer {
  cancel(): void;
}

/** Agendador injetável, pelo mesmo motivo do Clock. */
export interface Scheduler {
  setTimeout(callback: () => void, delayMs: number): Timer;
  setInterval(callback: () => void, intervalMs: number): Timer;
}

export const systemClock: Clock & Scheduler = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => {
    const handle = setTimeout(callback, delayMs);
    return { cancel: () => clearTimeout(handle) };
  },
  setInterval: (callback, intervalMs) => {
    const handle = setInterval(callback, intervalMs);
    return { cancel: () => clearInterval(handle) };
  },
};

/** Conta eventos numa janela deslizante; `hit` devolve true quando passa do limite. */
export class WindowCounter {
  private readonly hits: number[] = [];

  constructor(
    private readonly clock: Clock,
    private readonly windowMs: number,
    private readonly maxHits: number,
  ) {}

  hit(): boolean {
    const now = this.clock.now();
    // Descarta os eventos que já saíram da janela antes de contar o atual.
    while (this.hits.length > 0 && (this.hits[0] ?? 0) <= now - this.windowMs) this.hits.shift();
    this.hits.push(now);
    return this.hits.length > this.maxHits;
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
    // Repõe as fichas proporcionais ao tempo desde a última chamada, sem passar da capacidade.
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.updatedAt) / 1000) * this.perSecond);
    this.updatedAt = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
