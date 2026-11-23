import type { Clock, Scheduler, Timer } from '../realtime/clock.ts';

interface Scheduled {
  /** Ordem de criação, para desempatar timers que vencem no mesmo instante. */
  id: number;
  at: number;
  callback: () => void;
  /** Período do intervalo; null para timeout de disparo único. */
  repeatEveryMs: number | null;
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

  setTimeout(callback: () => void, delayMs: number): Timer {
    return this.add(callback, delayMs, null);
  }

  setInterval(callback: () => void, intervalMs: number): Timer {
    return this.add(callback, intervalMs, intervalMs);
  }

  /** Avança o tempo disparando, em ordem, tudo que vence no caminho. */
  advance(ms: number): void {
    const target = this.current + ms;
    // Um por vez, sempre o mais cedo: um callback pode agendar outro que vence antes do alvo.
    for (;;) {
      const due = this.timers
        .filter((timer) => timer.at <= target)
        .sort((first, second) => first.at - second.at || first.id - second.id)[0];
      if (!due) break;
      this.current = due.at;
      if (due.repeatEveryMs === null) this.timers = this.timers.filter((timer) => timer !== due);
      else due.at += due.repeatEveryMs;
      due.callback();
    }
    this.current = target;
  }

  /** Timers e intervalos ainda agendados. */
  pending(): number {
    return this.timers.length;
  }

  /** Atraso mínimo de 1 ms, como no Node: timer de 0 não dispara no mesmo instante. */
  private add(callback: () => void, delayMs: number, repeatEveryMs: number | null): Timer {
    const timer: Scheduled = { id: this.nextId++, at: this.current + Math.max(1, delayMs), callback, repeatEveryMs };
    this.timers.push(timer);
    return {
      cancel: () => {
        this.timers = this.timers.filter((scheduled) => scheduled !== timer);
      },
    };
  }
}
