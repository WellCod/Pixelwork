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

  it('queda pausa e reconexão retoma com contagem', () => {
    const { games, clock, lastState, table } = setup();
    games.join('a', KEY, LEFT, false);
    games.join('b', KEY, RIGHT, false);
    games.input('a', 5, 0);
    clock.advance(PONG.COUNTDOWN_MS + 500);
    games.disconnected('a');
    expect(clock.pending()).toBe(0);
    expect(lastState('b')?.phase).toBe('paused');
    expect(table()?.phase).toBe('playing');
    games.reconnected('a');
    expect(clock.pending()).toBe(1);
    clock.advance(100);
    expect(lastState('a')).toMatchObject({ phase: 'countdown', ball: { x: 80, y: 45 } });
    // O cliente recomeça a contagem de seq a cada welcome: o input 1 de novo vale.
    games.input('a', 1, 1);
    clock.advance(100);
    expect(lastState('a')).toMatchObject({ ack: 1 });
    expect(lastState('a')?.paddles.left).toBeGreaterThan(45);
  });

  it('reconectar sem partida pausada não cria intervalo', () => {
    const { games, clock } = setup();
    games.join('a', KEY, LEFT, false);
    games.disconnected('a');
    games.reconnected('a');
    expect(clock.pending()).toBe(0);
  });

  it('os dois caem e a mesa fica free sem timer', () => {
    const { games, clock, table } = setup();
    games.join('a', KEY, LEFT, false);
    games.join('b', KEY, RIGHT, false);
    games.disconnected('a');
    games.disconnected('b');
    games.leave('a');
    games.leave('b');
    expect(clock.pending()).toBe(0);
    expect(table()).toMatchObject({ phase: 'free', left: null, right: null });
  });

  it('troca de mapa encerra a partida e libera a mesa', () => {
    const { games, clock, broadcasts, activity } = setup();
    games.join('a', KEY, LEFT, false);
    games.bot('a');
    activity.length = 0;
    games.replaceTables([]);
    expect(clock.pending()).toBe(0);
    expect(games.seatOf('a')).toBeNull();
    expect(games.states()).toEqual([]);
    expect(broadcasts.at(-1)).toEqual({
      t: 'table.state',
      table: { tableKey: KEY, phase: 'free', left: null, right: null, score: { left: 0, right: 0 } },
    });
    expect(activity).toEqual(['a']);
  });

  it('conta a duração de cada quadro', () => {
    const frames: number[] = [];
    const clock = new ManualClock();
    const games = new GameRegistry(map.tables, {
      clock,
      scheduler: clock,
      send: () => undefined,
      broadcast: () => undefined,
      activityChanged: () => undefined,
      observeFrame: (seconds) => frames.push(seconds),
    });
    games.join('a', KEY, LEFT, false);
    games.bot('a');
    // Três quadros de 1000/30 ms somam um tico acima de 100 ms em ponto flutuante.
    clock.advance(101);
    expect(frames).toHaveLength(3);
  });
});
