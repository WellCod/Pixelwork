import { zoneAt, type CompiledMap } from './map.ts';
import type { Dir } from './protocol.ts';
import { step, type SimPlayer, type WorldState } from './sim.ts';

/**
 * Gravação do que a simulação de um coworking recebeu: entradas e saídas, cada passo entregue ao
 * `step` (aplicado ou recusado) e cada mudança de tranca, com o tempo do relógio injetado.
 * Começa com o retrato de quem já estava no mapa. Como `step` é puro e o relógio é injetado,
 * reproduzir a gravação chega exatamente às mesmas posições.
 */
export type ReplayEvent =
  | { t: number; type: 'join'; id: string; x: number; y: number; dir: Dir }
  | { t: number; type: 'leave'; id: string }
  | { t: number; type: 'step'; id: string; dir: Dir }
  | { t: number; type: 'lock'; zoneKey: string; locked: boolean; allowed: string[] };

export interface Recording {
  mapVersion: number;
  startedAt: number;
  events: ReplayEvent[];
}

export interface ReplayFrame {
  t: number;
  players: Map<string, { x: number; y: number; dir: Dir }>;
}

/**
 * Reproduz a gravação sobre o mapa. Chama `onFrame` depois de cada evento (para o visualizador)
 * e devolve o estado final. A regra de tranca é a mesma do servidor: sala trancada só para quem
 * está na lista de permitidos ou já está dentro dela.
 */
export function replay(
  map: CompiledMap,
  recording: Recording,
  onFrame?: (frame: ReplayFrame) => void,
): WorldState {
  let world: WorldState = { players: new Map() };
  const locks = new Map<string, { locked: boolean; allowed: Set<string> }>();
  const rules = {
    canEnter: (id: string, x: number, y: number) => {
      const zone = zoneAt(map, x, y);
      const lock = locks.get(zone.key);
      if (!lock?.locked) return true;
      const p = world.players.get(id);
      return lock.allowed.has(id) || (p !== undefined && zoneAt(map, p.x, p.y).key === zone.key);
    },
  };

  for (const event of recording.events) {
    switch (event.type) {
      case 'join': {
        const players = new Map(world.players);
        const sim: SimPlayer = { x: event.x, y: event.y, dir: event.dir, lastStepAt: -Infinity };
        players.set(event.id, sim);
        world = { players };
        break;
      }
      case 'leave': {
        const players = new Map(world.players);
        players.delete(event.id);
        world = { players };
        break;
      }
      case 'step':
        world = step(world, [{ playerId: event.id, seq: 0, dir: event.dir }], event.t, map, rules).state;
        break;
      case 'lock':
        locks.set(event.zoneKey, { locked: event.locked, allowed: new Set(event.allowed) });
        break;
    }
    if (onFrame) {
      const players = new Map<string, { x: number; y: number; dir: Dir }>();
      for (const [id, p] of world.players) players.set(id, { x: p.x, y: p.y, dir: p.dir });
      onFrame({ t: event.t, players });
    }
  }
  return world;
}

/** Gravador com teto de eventos: cheio, recomeça a partir de um retrato do estado atual. */
export class Recorder {
  private recording: Recording;

  constructor(
    private readonly maxEvents: number,
    mapVersion: number,
    now: number,
  ) {
    this.recording = { mapVersion, startedAt: now, events: [] };
  }

  get current(): Recording {
    return this.recording;
  }

  /**
   * Recomeça (mapa novo ou gravação cheia) com quem está no mapa e as trancas ativas, para a
   * gravação nova se reproduzir sozinha.
   */
  restart(
    mapVersion: number,
    now: number,
    players: ReadonlyMap<string, SimPlayer>,
    locks: ReadonlyMap<string, { locked: boolean; allowed: ReadonlySet<string> }>,
  ): void {
    const events: ReplayEvent[] = [];
    for (const [id, p] of players) events.push({ t: now, type: 'join', id, x: p.x, y: p.y, dir: p.dir });
    for (const [zoneKey, lock] of locks) {
      if (lock.locked) events.push({ t: now, type: 'lock', zoneKey, locked: true, allowed: [...lock.allowed] });
    }
    this.recording = { mapVersion, startedAt: now, events };
  }

  /** Devolve false quando a gravação encheu e precisa de `restart`. */
  push(event: ReplayEvent): boolean {
    this.recording.events.push(event);
    return this.recording.events.length < this.maxEvents;
  }
}
