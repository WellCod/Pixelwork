import { RACE_CONES, RACE_LANES, RACE_LENGTH, type Arcade, type RaceDriver, type RaceState, type ServerMsg, type Tile } from '@pixelwork/shared';
import type { Clock, Scheduler, Timer } from './clock.ts';

interface Driver extends RaceDriver {
  cabinet: Arcade;
  lastSteer: number;
  nextCone: number;
  hitUntil: number;
}

interface Match extends Omit<RaceState, 'drivers' | 'countdown'> {
  drivers: Driver[];
  startsAt: number;
  lastTick: number;
  timer: Timer | null;
}

const FRAME_MS = 50;

export class RaceRegistry {
  private readonly matches = new Map<string, Match>();
  private readonly occupied = new Set<string>();

  constructor(
    private readonly clock: Clock,
    private readonly scheduler: Scheduler,
    private readonly send: (id: string, message: ServerMsg) => void,
    private readonly changeActivity: (id: string) => void,
  ) {}

  has(id: string): boolean { return this.matches.has(id); }

  join(id: string, cabinet: Arcade | undefined, position: Tile): string | null {
    if (!cabinet?.spots.some(({ x, y }) => x === position.x && y === position.y)) return 'race_not_at_arcade';
    if (this.has(id) || this.occupied.has(cabinet.key)) return 'race_busy';

    const waiting = [...this.matches.values()].find((match) =>
      match.phase === 'waiting' && match.drivers[0]?.cabinet.pair === cabinet.pair);
    const match: Match = waiting ?? {
      phase: 'waiting', startsAt: 0, lastTick: 0, drivers: [], winner: null,
      opponentLeft: false, solo: false, timer: null,
    };
    match.drivers.push({
      id, cabinet, lane: 1, distance: 0, speed: 0, hit: false,
      lastSteer: -Infinity, nextCone: 0, hitUntil: 0,
    });
    this.matches.set(id, match);
    this.occupied.add(cabinet.key);
    this.changeActivity(id);
    if (waiting) this.start(match);
    else this.publish(match);
    return null;
  }

  solo(id: string): void {
    const match = this.matches.get(id);
    if (match?.phase === 'waiting') this.start(match);
  }

  restart(id: string): void {
    const match = this.matches.get(id);
    if (match?.phase !== 'finished') return;
    if (match.drivers.length === 2 || match.solo) {
      this.start(match);
      return;
    }
    match.phase = 'waiting';
    match.opponentLeft = false;
    match.winner = null;
    this.publish(match);
  }

  steer(id: string, dir: -1 | 1): void {
    const match = this.matches.get(id);
    if (match?.phase !== 'running' && match?.phase !== 'countdown') return;
    const driver = match.drivers.find((entry) => entry.id === id);
    const now = this.clock.now();
    if (!driver || now - driver.lastSteer < 130) return;
    driver.lane = RACE_LANES[Math.max(0, Math.min(2, driver.lane + dir))] ?? driver.lane;
    driver.lastSteer = now;
  }

  reconnect(id: string): void {
    const match = this.matches.get(id);
    if (match) this.publish(match);
  }

  leave(id: string): void {
    const match = this.matches.get(id);
    const driver = match?.drivers.find((entry) => entry.id === id);
    if (!match || !driver) return;
    this.matches.delete(id);
    this.occupied.delete(driver.cabinet.key);
    match.drivers = match.drivers.filter((entry) => entry !== driver);
    this.send(id, { t: 'race.state', race: null });
    this.changeActivity(id);
    if (!match.drivers.length) this.stopTimer(match);
    else {
      if (match.phase !== 'finished') {
        match.phase = 'finished';
        match.winner = match.drivers[0]?.id ?? null;
      }
      match.opponentLeft = true;
      this.stopTimer(match);
      this.publish(match);
    }
  }

  close(): void {
    for (const match of new Set(this.matches.values())) this.stopTimer(match);
    const ids = [...this.matches.keys()];
    this.matches.clear();
    this.occupied.clear();
    for (const id of ids) {
      this.send(id, { t: 'race.state', race: null });
      this.changeActivity(id);
    }
  }

  private start(match: Match): void {
    this.stopTimer(match);
    match.drivers.sort((a, b) => a.cabinet.x - b.cabinet.x || a.cabinet.y - b.cabinet.y);
    match.drivers.forEach((driver, index) => {
      Object.assign(driver, {
        lane: match.drivers.length === 1 ? 1 : index * 2, distance: 0, speed: 0,
        hit: false, nextCone: 0, hitUntil: 0, lastSteer: -Infinity,
      });
    });
    match.phase = 'countdown';
    match.solo = match.drivers.length === 1;
    match.startsAt = this.clock.now() + 3_000;
    match.lastTick = match.startsAt;
    match.winner = null;
    match.opponentLeft = false;
    match.timer = this.scheduler.setInterval(() => this.tick(match), FRAME_MS);
    this.publish(match);
  }

  private stopTimer(match: Match): void {
    match.timer?.cancel();
    match.timer = null;
  }

  private tick(match: Match): void {
    const now = this.clock.now();
    if (now >= match.startsAt) {
      match.phase = 'running';
      const seconds = Math.max(0, Math.min(200, now - match.lastTick)) / 1_000;
      match.lastTick = now;
      for (const driver of match.drivers) {
        driver.speed = Math.min(110, driver.speed + 56 * seconds);
        const next = driver.distance + driver.speed * seconds;
        for (let cone = RACE_CONES[driver.nextCone]; cone && cone.distance <= next; cone = RACE_CONES[driver.nextCone]) {
          driver.nextCone++;
          if (cone.lane === driver.lane) {
            driver.speed = 28;
            driver.hitUntil = now + 700;
          }
        }
        driver.hit = now < driver.hitUntil;
        driver.distance = next;
      }
      const order = [...match.drivers].sort((a, b) => b.distance - a.distance);
      const first = order[0];
      if (first && first.distance >= RACE_LENGTH) {
        match.phase = 'finished';
        match.winner = first.distance === order[1]?.distance ? null : first.id;
        this.stopTimer(match);
      }
    }
    this.publish(match);
  }

  private publish(match: Match): void {
    const race: RaceState = {
      phase: match.phase,
      countdown: match.phase === 'countdown' ? Math.max(1, Math.ceil((match.startsAt - this.clock.now()) / 1_000)) : 0,
      drivers: match.drivers.map(({ id, lane, distance, speed, hit }) => ({ id, lane, distance, speed, hit })),
      winner: match.winner, opponentLeft: match.opponentLeft, solo: match.solo,
    };
    for (const { id } of match.drivers) this.send(id, { t: 'race.state', race });
  }
}
