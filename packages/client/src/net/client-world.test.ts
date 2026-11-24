import { compileMap, type CompiledMap, type ServerMsg, type TableState } from '@pixelwork/shared';
import { buildTestMap } from '@pixelwork/shared/testing';
import { describe, expect, it } from 'vitest';
import { ClientWorld } from './client-world.ts';

const map = ((): CompiledMap => {
  const result = compileMap(buildTestMap());
  if (!result.ok) throw new Error('mapa de teste inválido');
  return result.map;
})();

const table = (overrides: Partial<TableState>): TableState => ({
  tableKey: 'ping-pong@4,3',
  phase: 'waiting',
  left: null,
  right: null,
  score: { left: 0, right: 0 },
  ...overrides,
});

function welcome(game: { tableKey: string; side: 'left' | 'right' } | null): ServerMsg {
  return { t: 'welcome', selfId: 'me', mapVersion: 1, players: [], zones: [], desks: [], tables: [table({ left: 'me' })], game };
}

describe('ClientWorld: mesas de jogo', () => {
  it('seat vem do welcome e some quando a mesa libera', () => {
    const world = new ClientWorld(map);
    world.handle(welcome({ tableKey: 'ping-pong@4,3', side: 'left' }));
    expect(world.seat).toEqual({ tableKey: 'ping-pong@4,3', side: 'left' });
    expect(world.tables.get('ping-pong@4,3')?.left).toBe('me');
    world.handle({ t: 'table.state', table: table({ phase: 'free' }) });
    expect(world.seat).toBeNull();
  });

  it('table.state com o próprio id define o lado', () => {
    const world = new ClientWorld(map);
    world.handle(welcome(null));
    world.handle({ t: 'table.state', table: table({ phase: 'playing', left: 'x', right: 'me' }) });
    expect(world.seat).toEqual({ tableKey: 'ping-pong@4,3', side: 'right' });
  });

  it('game.state confirma os inputs até o ack', () => {
    const world = new ClientWorld(map);
    world.handle(welcome({ tableKey: 'ping-pong@4,3', side: 'left' }));
    expect(world.gameInput(1)).toEqual({ t: 'game.input', seq: 1, dir: 1 });
    expect(world.gameInput(0)).toEqual({ t: 'game.input', seq: 2, dir: 0 });
    world.handle({
      t: 'game.state',
      tableKey: 'ping-pong@4,3',
      ack: 1,
      phase: 'playing',
      serveAt: 0,
      ball: { x: 80, y: 45, vx: 0, vy: 0 },
      paddles: { left: 50, right: 45 },
      score: { left: 0, right: 0 },
      serverTs: 0,
    });
    expect(world.gamePending.map((input) => input.seq)).toEqual([2]);
    expect(world.gameAckedDir).toBe(1);
    expect(world.lastGame?.paddles?.left).toBe(50);
  });

  it('game.state não muda a versão que a UI observa', () => {
    const world = new ClientWorld(map);
    world.handle(welcome({ tableKey: 'ping-pong@4,3', side: 'left' }));
    const before = world.version;
    world.handle({
      t: 'game.state',
      tableKey: 'ping-pong@4,3',
      ack: 0,
      phase: 'playing',
      serveAt: 0,
      ball: { x: 80, y: 45, vx: 0, vy: 0 },
      paddles: { left: 45, right: 45 },
      score: { left: 0, right: 0 },
      serverTs: 0,
    });
    expect(world.version).toBe(before);
  });
});
