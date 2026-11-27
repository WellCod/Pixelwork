import { randomUUID } from 'node:crypto';
import { nextProximity, zoneAt, type CompiledMap, type ServerMsg } from '@pixelwork/shared';
import type { Clock, Scheduler, Timer } from './clock.ts';
import { spaceRoom, type MediaService } from './media.ts';
import { answerReceptionText, type readReceptionTool } from './reception-tools.ts';

type Presence = Extract<ServerMsg, { t: 'reception.state' }>['reception'];
type Session = Extract<ServerMsg, { t: 'reception.session' }>;
type EndReason = Extract<Session, { state: 'ended' }>['reason'];
type Destination = Extract<ServerMsg, { t: 'reception.destination' }>;

export interface ReceptionVisitor {
  id: string;
  x: number;
  y: number;
  room: string;
  current: () => boolean;
  send: (message: Session | Destination | Extract<ServerMsg, { t: 'reception.answer' }>) => void;
}

export interface ReceptionVoiceRequest {
  id: string;
  spaceId: string;
  identity: string;
  visitorId: string;
  token: string;
  tool: (input: unknown) => unknown;
  ended: (failed?: boolean) => void;
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
  requestedAt: number;
}

export interface ReceptionRuntimeDeps {
  voice: ReceptionVoice;
  capacity: ReceptionCapacity;
  scheduler: Scheduler;
  clock: Clock;
  media: MediaService;
  log: { error: (details: unknown, message: string) => void };
  durationMs: number;
  reserve: (spaceId: string, milliseconds: number) => Promise<boolean>;
  observe: (outcome: 'started' | 'ready' | EndReason, seconds?: number) => void;
}

export class ReceptionRuntime {
  private lease: Lease | undefined;
  constructor(
    private readonly spaceId: string,
    private map: CompiledMap,
    private enabled: boolean,
    private readonly deps: ReceptionRuntimeDeps,
    private readonly publish: (state: Presence) => void,
    private readonly readTool: (input: unknown, visitor: ReceptionVisitor) => ReturnType<typeof readReceptionTool>,
  ) {}

  presence(): Presence {
    const point = this.map.reception;
    if (!this.enabled || !point) return null;
    return { x: point.x, y: point.y, ...(this.deps.voice.mode ? { voice: this.deps.voice.mode } : {}),
      status: this.lease ? 'busy' : this.deps.voice.ready() ? 'available' : 'unavailable' };
  }

  listenerFor(visitorId: string): string | undefined {
    const lease = this.lease;
    return lease?.visitor.id === visitorId && lease.phase !== 'stopping' ? lease.identity : undefined;
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

  ask(visitor: ReceptionVisitor, text: string): void {
    if (!this.enabled || !this.eligible(visitor, false)) return;
    visitor.send({ t: 'reception.destination', destination: null });
    visitor.send({ t: 'reception.answer', text: answerReceptionText(text, (input) => this.readTool(input, visitor)) });
  }

  start(visitor: ReceptionVisitor): void {
    if (this.lease) {
      if (this.lease.visitor.id !== visitor.id) this.reject(visitor, 'busy');
      return;
    }
    if (!this.enabled || !this.deps.voice.ready() || !this.map.reception) {
      this.reject(visitor, 'unavailable');
      return;
    }
    if (!this.eligible(visitor, false)) {
      this.reject(visitor, 'left');
      return;
    }
    const id = randomUUID();
    if (!this.deps.capacity.acquire(id)) {
      this.reject(visitor, 'busy');
      return;
    }
    const lease: Lease = {
      id, identity: `recepcao-${id}`, visitor, abort: new AbortController(), phase: 'starting',
      requestedAt: this.deps.clock.now(),
      timer: this.deps.scheduler.setTimeout(() => this.stop('timeout'), this.deps.durationMs),
    };
    this.lease = lease;
    this.deps.observe('started');
    visitor.send({ t: 'reception.session', state: 'starting' });
    this.publish(this.presence());
    void this.open(lease);
  }

  private reject(visitor: ReceptionVisitor, reason: EndReason): void {
    this.deps.observe(reason);
    visitor.send({ t: 'reception.session', state: 'ended', reason });
  }

  check(visitor: ReceptionVisitor): void {
    const lease = this.lease;
    if (!lease || lease.visitor.id !== visitor.id || lease.phase === 'stopping') return;
    if (!lease.visitor.current() || !this.eligible(visitor, true)) this.stop('left');
  }

  stopFor(visitorId: string, reason: 'finished' | 'left'): void {
    if (this.lease?.visitor.id === visitorId) this.stop(reason);
  }

  stop(reason: EndReason): void {
    const lease = this.lease;
    if (!lease || lease.phase === 'stopping') return;
    lease.phase = 'stopping';
    lease.timer.cancel();
    lease.abort.abort();
    this.deps.observe(reason);
    if (lease.visitor.current()) lease.visitor.send({ t: 'reception.session', state: 'ended', reason });
    this.publish(this.presence());
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
      const reserved = await this.deps.reserve(this.spaceId, this.deps.durationMs);
      if (lease.abort.signal.aborted) return;
      if (!reserved) {
        this.stop('quota');
        return;
      }
      const token = await this.deps.media.token(lease.identity, spaceRoom(this.spaceId), ['microphone']);
      lease.abort.signal.throwIfAborted();
      await this.deps.voice.start({
        id: lease.id, spaceId: this.spaceId, identity: lease.identity, visitorId: lease.visitor.id, token,
        ended: (failed) => { if (this.lease === lease) this.stop(failed ? 'unavailable' : 'finished'); },
        tool: (input) => lease.phase === 'active' && lease.visitor.current() && !lease.abort.signal.aborted
          ? this.readTool(input, lease.visitor) : { error: 'invalid_lease' },
      }, lease.abort.signal);
      if (this.lease !== lease || lease.phase !== 'starting') return;
      if (!lease.visitor.current()) {
        this.stop('left');
        return;
      }
      lease.phase = 'active';
      this.deps.observe('ready', (this.deps.clock.now() - lease.requestedAt) / 1000);
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
