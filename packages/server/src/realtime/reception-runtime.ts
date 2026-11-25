import { randomUUID } from 'node:crypto';
import { nextProximity, zoneAt, type CompiledMap, type ServerMsg } from '@pixelwork/shared';
import type { Scheduler, Timer } from './clock.ts';
import { spaceRoom, type MediaService } from './media.ts';

type Presence = Extract<ServerMsg, { t: 'reception.state' }>['reception'];
type Session = Extract<ServerMsg, { t: 'reception.session' }>;

export interface ReceptionVisitor {
  id: string;
  x: number;
  y: number;
  room: string;
  current: () => boolean;
  send: (message: Session) => void;
}

export interface ReceptionVoiceRequest {
  id: string;
  spaceId: string;
  identity: string;
  visitorId: string;
  token: string;
  tool: (input: unknown) => unknown;
  ended: () => void;
}

export interface ReceptionVoice {
  readonly mode?: 'local' | undefined;
  ready(): boolean;
  start(request: ReceptionVoiceRequest, signal: AbortSignal): Promise<void>;
  stop(id: string): Promise<void>;
}

/** Limite global compartilhado por todos os runtimes do gateway. */
export class ReceptionCapacity {
  private readonly active = new Set<string>();
  constructor(private readonly max: number) {}
  acquire(id: string): boolean {
    if (this.active.size >= this.max) return false;
    this.active.add(id);
    return true;
  }
  release(id: string): void { this.active.delete(id); }
}

interface Lease {
  id: string;
  identity: string;
  visitor: ReceptionVisitor;
  abort: AbortController;
  timer: Timer;
  phase: 'starting' | 'active' | 'stopping';
}

export interface ReceptionRuntimeDeps {
  voice: ReceptionVoice;
  capacity: ReceptionCapacity;
  scheduler: Scheduler;
  media: MediaService;
  log: { error: (details: unknown, message: string) => void };
  durationMs: number;
}

export class ReceptionRuntime {
  private lease: Lease | undefined;
  constructor(
    private readonly spaceId: string,
    private map: CompiledMap,
    private enabled: boolean,
    private readonly deps: ReceptionRuntimeDeps,
    private readonly publish: (state: Presence) => void,
    private readonly readTool: (input: unknown) => unknown,
  ) {}

  presence(): Presence {
    const point = this.map.reception;
    if (!this.enabled || !point) return null;
    return { ...point, ...(this.deps.voice.mode ? { voice: this.deps.voice.mode } : {}),
      status: this.lease ? 'busy' : this.deps.voice.ready() ? 'available' : 'unavailable' };
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stop('unavailable');
    this.publish(this.presence());
  }

  replaceMap(map: CompiledMap): void {
    this.stop('left');
    this.map = map;
    this.publish(this.presence());
  }

  start(visitor: ReceptionVisitor): void {
    if (this.lease) {
      if (this.lease.visitor.id !== visitor.id) visitor.send({ t: 'reception.session', state: 'ended', reason: 'busy' });
      return;
    }
    if (!this.enabled || !this.deps.voice.ready() || !this.map.reception) {
      visitor.send({ t: 'reception.session', state: 'ended', reason: 'unavailable' });
      return;
    }
    if (!this.eligible(visitor, false)) {
      visitor.send({ t: 'reception.session', state: 'ended', reason: 'left' });
      return;
    }
    const id = randomUUID();
    if (!this.deps.capacity.acquire(id)) {
      visitor.send({ t: 'reception.session', state: 'ended', reason: 'busy' });
      return;
    }
    const lease: Lease = {
      id, identity: `recepcao-${id}`, visitor, abort: new AbortController(), phase: 'starting',
      timer: this.deps.scheduler.setTimeout(() => this.stop('timeout'), this.deps.durationMs),
    };
    this.lease = lease;
    visitor.send({ t: 'reception.session', state: 'starting' });
    this.publish(this.presence());
    void this.open(lease);
  }

  check(visitor: ReceptionVisitor): void {
    const lease = this.lease;
    if (!lease || lease.visitor.id !== visitor.id || lease.phase === 'stopping') return;
    if (!lease.visitor.current() || !this.eligible(visitor, true)) this.stop('left');
  }

  stopFor(visitorId: string, reason: 'finished' | 'left'): void {
    if (this.lease?.visitor.id === visitorId) this.stop(reason);
  }

  stop(reason: 'finished' | 'left' | 'timeout' | 'unavailable'): void {
    const lease = this.lease;
    if (!lease || lease.phase === 'stopping') return;
    lease.phase = 'stopping';
    lease.timer.cancel();
    lease.abort.abort();
    if (lease.visitor.current()) lease.visitor.send({ t: 'reception.session', state: 'ended', reason });
    void this.release(lease);
  }

  private eligible(visitor: ReceptionVisitor, active: boolean): boolean {
    const point = this.map.reception;
    if (!point || !visitor.current() || visitor.room !== spaceRoom(this.spaceId)) return false;
    if (zoneAt(this.map, visitor.x, visitor.y).type !== 'open') return false;
    const npc = { ...point, id: 'recepcao' };
    return nextProximity(this.map, visitor, [npc], new Set(active ? [npc.id] : [])).has(npc.id);
  }

  private async open(lease: Lease): Promise<void> {
    try {
      const token = await this.deps.media.token(lease.identity, spaceRoom(this.spaceId), ['microphone']);
      if (lease.abort.signal.aborted) return;
      await this.deps.voice.start({
        id: lease.id, spaceId: this.spaceId, identity: lease.identity, visitorId: lease.visitor.id, token,
        ended: () => { if (this.lease === lease) this.stop('finished'); },
        tool: (input) => lease.phase === 'active' && lease.visitor.current() && !lease.abort.signal.aborted
          ? this.readTool(input) : { error: 'invalid_lease' },
      }, lease.abort.signal);
      if (this.lease !== lease || lease.phase !== 'starting') return;
      if (!lease.visitor.current()) {
        this.stop('left');
        return;
      }
      lease.phase = 'active';
      lease.visitor.send({ t: 'reception.session', state: 'active', identity: lease.identity });
    } catch {
      if (this.lease === lease && !lease.abort.signal.aborted) this.stop('unavailable');
    }
  }

  private async release(lease: Lease): Promise<void> {
    let workerStopped = false;
    try {
      await this.deps.voice.stop(lease.id);
      workerStopped = true;
    } catch {
      this.deps.log.error({ spaceId: this.spaceId }, 'falha ao parar processo da recepção');
    }
    try {
      await this.deps.media.removeParticipant(spaceRoom(this.spaceId), lease.identity);
    } catch (error) {
      const failure = error as { status?: unknown; code?: unknown } | null | undefined;
      if (failure?.status !== 404 && failure?.code !== 'not_found') {
        this.deps.log.error({ spaceId: this.spaceId }, 'falha ao encerrar trilha da recepção');
        return;
      }
    }
    // Mantém a vaga ocupada se o worker puder reutilizar o token ainda válido.
    if (!workerStopped) return;
    this.deps.capacity.release(lease.id);
    if (this.lease === lease) this.lease = undefined;
    this.publish(this.presence());
  }
}
