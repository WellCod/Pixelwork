import { PONG, compileMap, frameOf, newPong, type CompiledMap, type PongState, type ServerMsg } from '@pixelwork/shared';
import { buildTestMap } from '@pixelwork/shared/testing';
import { describe, expect, it } from 'vitest';
import { ManualClock } from '../test/manual-clock.ts';
import { GameRegistry } from './games.ts';

const map: CompiledMap = (() => {
  const result = compileMap(
    buildTestMap({
      width: 12,
      height: 9,
      furniture: [{ tileset: 'furniture-3x2', tile: frameOf('furniture-3x2', 'ping-pong'), x: 4, y: 4, w: 3, h: 2 }],
    }),
  );
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.map;
})();
const KEY = 'ping-pong@4,3';
const LEFT = { x: 3, y: 4 };
const RIGHT = { x: 7, y: 4 };

/** Partida a um quadro do fim: a bola sai pelo lado de quem perde. */
const nearEnd = (winner: 'left' | 'right') => (now: number): PongState => ({
  ...newPong(now),
  phase: 'playing',
  serveAt: now,
  score: winner === 'left' ? { left: PONG.WIN - 1, right: 0 } : { left: 0, right: PONG.WIN - 1 },
  ball: winner === 'left' ? { x: 158, y: 45, vx: 200, vy: 0 } : { x: 2, y: 45, vx: -200, vy: 0 },
});

function setup(starts: ((now: number) => PongState)[] = []) {
  const clock = new ManualClock();
  const sent: { to: string; msg: ServerMsg }[] = [];
  const broadcasts: ServerMsg[] = [];
  const activity: string[] = [];
  const games = new GameRegistry(map.tables, {
    clock,
    scheduler: clock,
    send: (to, msg) => sent.push({ to, msg }),
    broadcast: (msg) => broadcasts.push(msg),
    activityChanged: (id) => activity.push(id),
  }, { start: (now) => (starts.shift() ?? newPong)(now) });
  const lastState = (to: string) =>
    sent.filter((s) => s.to === to && s.msg.t === 'game.state').map((s) => s.msg as ServerMsg & { t: 'game.state' }).at(-1);
  const table = () => games.states()[0];
  return { clock, sent, broadcasts, activity, games, lastState, table };
}

describe('GameRegistry', () => {
  it('entrar fora do lado é recusado', () => {
    const { games } = setup();
    expect(games.join('a', KEY, { x: 1, y: 1 }, false)).toBe('table_not_at_side');
    expect(games.join('a', 'ping-pong@9,9', LEFT, false)).toBe('table_not_found');
    expect(games.seatOf('a')).toBeNull();
  });

  it('lado ocupado é recusado', () => {
    const { games } = setup();
    expect(games.join('a', KEY, LEFT, false)).toBeNull();
    expect(games.join('b', KEY, { x: 3, y: 3 }, false)).toBe('table_side_taken');
  });

  it('em chamada é recusado', () => {
    expect(setup().games.join('a', KEY, LEFT, true)).toBe('table_busy');
  });

  it('um jogador fica esperando; game.bot começa a partida', () => {
    const { games, table, clock, lastState } = setup();
    games.join('a', KEY, LEFT, false);
    expect(table()).toMatchObject({ phase: 'waiting', left: 'a', right: null });
    expect(games.seatOf('a')).toEqual({ tableKey: KEY, side: 'left' });
    games.bot('a');
    expect(table()).toMatchObject({ phase: 'playing', left: 'a', right: 'bot' });
    clock.advance(100);
    expect(lastState('a')).toMatchObject({ tableKey: KEY, phase: 'countdown' });
    expect(games.activeMatches()).toBe(1);
  });

  it('dois jogadores começam 1x1 e cada input mexe a própria raquete', () => {
    const { games, clock, lastState, table } = setup();
    games.join('a', KEY, LEFT, false);
    games.join('b', KEY, RIGHT, false);
    expect(table()).toMatchObject({ phase: 'playing', left: 'a', right: 'b' });
    games.input('a', 1, 1);
    clock.advance(1000);
    const state = lastState('b');
    expect(state?.paddles.left).toBe(81);
    expect(state?.paddles.right).toBe(45);
    expect(lastState('a')?.ack).toBe(1);
  });

  it('segundo humano substitui o bot e zera o placar', () => {
    const { games, table, clock } = setup();
    games.join('a', KEY, LEFT, false);
    games.bot('a');
    clock.advance(PONG.COUNTDOWN_MS + 5000);
    games.join('b', KEY, RIGHT, false);
    expect(table()).toMatchObject({ phase: 'playing', left: 'a', right: 'b', score: { left: 0, right: 0 } });
  });

  it('join de novo sai da mesa anterior', () => {
    const { games, table } = setup();
    games.join('a', KEY, LEFT, false);
    expect(games.join('a', KEY, RIGHT, false)).toBeNull();
    expect(table()).toMatchObject({ left: null, right: 'a' });
  });

  it('input de quem não joga é ignorado', () => {
    const { games, clock, lastState } = setup();
    games.join('a', KEY, LEFT, false);
    games.bot('a');
    games.input('x', 1, 1);
    clock.advance(500);
    expect(lastState('a')?.paddles.left).toBe(45);
    expect(lastState('x')).toBeUndefined();
  });

  it('sair em 1x1 dá vitória ao outro e volta a waiting', () => {
    const { games, table, sent } = setup();
    games.join('a', KEY, LEFT, false);
    games.join('b', KEY, RIGHT, false);
    games.leave('a');
    expect(table()).toMatchObject({ phase: 'waiting', left: null, right: 'b' });
    expect(sent).toContainEqual({ to: 'b', msg: { t: 'game.events', tableKey: KEY, events: [{ type: 'end', winner: 'right' }] } });
    expect(games.activeMatches()).toBe(0);
  });

  it('revanche: solo recomeça na hora; 1x1 só quando os dois pedem', () => {
    const { games, table, clock } = setup([nearEnd('left'), newPong, nearEnd('right')]);
    games.join('a', KEY, LEFT, false);
    games.join('b', KEY, RIGHT, false);
    clock.advance(100);
    expect(table()).toMatchObject({ phase: 'ended', score: { left: PONG.WIN } });
    games.rematch('a');
    expect(table()?.phase).toBe('ended');
    games.rematch('b');
    expect(table()).toMatchObject({ phase: 'playing', score: { left: 0, right: 0 } });

    games.leave('b');
    games.bot('a');
    clock.advance(100);
    expect(table()).toMatchObject({ phase: 'ended', right: 'bot', score: { right: PONG.WIN } });
    games.rematch('a');
    expect(table()).toMatchObject({ phase: 'playing', right: 'bot', score: { left: 0, right: 0 } });
  });

  it('sem partida não sobra intervalo', () => {
    const { games, clock } = setup();
    games.join('a', KEY, LEFT, false);
    games.join('b', KEY, RIGHT, false);
    expect(clock.pending()).toBe(1);
    games.leave('a');
    games.leave('b');
    expect(clock.pending()).toBe(0);
    expect(games.states()[0]).toMatchObject({ phase: 'free', left: null, right: null });
  });

  it('avisa mudança de atividade ao entrar e sair', () => {
    const { games, activity } = setup();
    games.join('a', KEY, LEFT, false);
    games.leave('a');
    expect(activity).toEqual(['a', 'a']);
  });
});
