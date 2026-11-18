import { MIN_STEP_INTERVAL_MS } from './constants.ts';
import { isWalkable, type CompiledMap } from './map.ts';
import { DIR_DELTA, type Dir } from './protocol.ts';

export interface SimPlayer {
  x: number;
  y: number;
  dir: Dir;
  /** Momento do último passo aceito; -Infinity antes do primeiro. */
  lastStepAt: number;
}

export interface WorldState {
  players: ReadonlyMap<string, SimPlayer>;
}

export interface Input {
  playerId: string;
  seq: number;
  dir: Dir;
}

export type WorldEvent =
  | { type: 'moved'; id: string; x: number; y: number; dir: Dir }
  /** Passo recusado: o jogador só vira; a posição autoritativa volta ao cliente. */
  | { type: 'blocked'; id: string; x: number; y: number; dir: Dir };

export interface StepRules {
  /** Ponto de extensão para a tranca de zona (fase 4). */
  canEnter?: (playerId: string, x: number, y: number, map: CompiledMap) => boolean;
}

export function step(
  state: WorldState,
  inputs: readonly Input[],
  now: number,
  map: CompiledMap,
  rules: StepRules = {},
): { state: WorldState; events: WorldEvent[] } {
  const events: WorldEvent[] = [];
  let players: Map<string, SimPlayer> | null = null;

  for (const input of inputs) {
    const current = (players ?? state.players).get(input.playerId);
    if (!current || now - current.lastStepAt < MIN_STEP_INTERVAL_MS) continue;

    const [dx, dy] = DIR_DELTA[input.dir];
    const x = current.x + dx;
    const y = current.y + dy;
    const allowed = isWalkable(map, x, y) && (rules.canEnter?.(input.playerId, x, y, map) ?? true);
    const next: SimPlayer = allowed
      ? { x, y, dir: input.dir, lastStepAt: now }
      : { ...current, dir: input.dir, lastStepAt: now };

    players ??= new Map(state.players);
    players.set(input.playerId, next);
    events.push({ type: allowed ? 'moved' : 'blocked', id: input.playerId, x: next.x, y: next.y, dir: next.dir });
  }

  return { state: players ? { players } : state, events };
}
