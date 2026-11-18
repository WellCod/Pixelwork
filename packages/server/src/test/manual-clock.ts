import type { Clock, Scheduler, Timer } from '../realtime/clock.ts';

interface Scheduled {
  id: number;
  at: number;
  fn: () => void;
  every: number | null;
}

/** Relógio e agendador controlados pelo teste: o tempo só anda com `advance`. */
export class ManualClock implements Clock, Scheduler {
  private current: number;
  private nextId = 1;
  private timers: Scheduled[] = [];

  constructor(start = 1_000_000) {
    this.current = start;
  }

  now(): number {
    return this.current;
  }

  setTimeout(fn: () => void, ms: number): Timer {
    return this.add(fn, ms, null);
  }

  setInterval(fn: () => void, ms: number): Timer {
    return this.add(fn, ms, ms);
  }

  /** Avança o tempo disparando, em ordem, tudo que vence no caminho. */
  advance(ms: number): void {
    const target = this.current + ms;
    for (;;) {
      const due = this.timers
        .filter((t) => t.at <= target)
        .sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      this.current = due.at;
      if (due.every === null) this.timers = this.timers.filter((t) => t !== due);
      else due.at += due.every;
      due.fn();
    }
    this.current = target;
  }

  private add(fn: () => void, ms: number, every: number | null): Timer {
    const timer: Scheduled = { id: this.nextId++, at: this.current + Math.max(1, ms), fn, every };
    this.timers.push(timer);
    return {
      cancel: () => {
        this.timers = this.timers.filter((t) => t !== timer);
      },
    };
  }
}
