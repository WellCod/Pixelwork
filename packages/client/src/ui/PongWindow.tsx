import { PONG, type ClientMsg, type PongSide } from '@pixelwork/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClientWorld } from '../net/client-world.ts';
import { PaddleKeys } from '../net/pong-keys.ts';
import { extrapolateBall, predictPaddle } from '../net/pong-predict.ts';
import { Modal } from './Modal.tsx';
import { useWorld } from './useWorld.ts';

// Cores da paleta (docs/art.md): campo verde, linhas brancas, raquete própria azul.
const FIELD = '#239063';
const LINE = '#ffffff';
const MINE = '#4d65b4';
const THEIRS = '#2e222f';
const BALL = '#ffffff';
const SHADE = 'rgba(46, 34, 47, 0.55)';

/** Foco num campo de texto: as teclas são de quem digita. */
function isTextField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

const other = (side: PongSide): PongSide => (side === 'left' ? 'right' : 'left');

/**
 * Janela da partida de pingpong, aberta enquanto o próprio jogador está numa mesa. O campo é
 * desenhado num canvas de 160x90 a cada quadro, a partir do último estado do servidor: a raquete
 * própria é prevista e a bola extrapolada (`pong-predict.ts`).
 */
export function PongWindow({ world, send }: { world: ClientWorld; send: (msg: ClientMsg) => void }) {
  useWorld(world);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [askedRematch, setAskedRematch] = useState(false);
  const seat = world.seat;
  const table = seat ? world.tables.get(seat.tableKey) : undefined;

  const keys = useMemo(() => new PaddleKeys((dir) => send(world.gameInput(dir))), [world, send]);

  // Teclado: setas e W/S mexem a raquete, só sentado à mesa e fora de campos de texto (o
  // componente fica montado o tempo todo, e W/S são letras do chat).
  useEffect(() => {
    const handle = (e: KeyboardEvent, down: boolean) => {
      if (keys.press(e.key, down, world.seat !== null && !isTextField(e.target)) && down) e.preventDefault();
    };
    const onDown = (e: KeyboardEvent) => handle(e, true);
    const onUp = (e: KeyboardEvent) => handle(e, false);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [world, keys]);

  // Avisos da partida: fim e vitória por desistência.
  useEffect(
    () =>
      world.subscribe((event) => {
        // Reconexão: o servidor zerou a raquete; a próxima tecla precisa ser enviada de novo.
        if (event.type === 'reset') keys.reset();
        // Partida nova (revanche ou alguém chegou): o aviso da anterior sai e a raquete recomeça.
        if (event.type === 'table' && event.table.tableKey === world.seat?.tableKey && event.table.phase === 'playing') {
          setNotice(null);
          setAskedRematch(false);
          keys.reset();
        }
        if (event.type !== 'gameEvents' || !world.seat) return;
        const end = event.events.find((e) => e.type === 'end');
        if (!end) return;
        const won = end.winner === world.seat.side;
        const t = world.tables.get(world.seat.tableKey);
        const quit = t?.phase !== 'ended';
        setNotice(quit ? 'O adversário saiu: vitória por desistência.' : won ? 'Você venceu!' : 'Você perdeu.');
        setAskedRematch(false);
      }),
    [world, keys],
  );

  // Desenho por quadro.
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const ctx = canvas.current?.getContext('2d');
      const side = world.seat?.side;
      if (!ctx || !side) return;
      const g = world.lastGame;
      const now = Date.now();
      ctx.fillStyle = FIELD;
      ctx.fillRect(0, 0, PONG.W, PONG.H);
      ctx.fillStyle = LINE;
      for (let y = 2; y < PONG.H; y += 6) ctx.fillRect(PONG.W / 2 - 0.5, y, 1, 3);
      ctx.fillRect(0, 0, PONG.W, 1);
      ctx.fillRect(0, PONG.H - 1, PONG.W, 1);

      const mine = g ? predictPaddle(g.paddles[side], world.gameAckedDir, world.gamePending, g.receivedAt, now) : PONG.H / 2;
      const theirs = g ? g.paddles[other(side)] : PONG.H / 2;
      const paddle = (s: PongSide, y: number, color: string) => {
        ctx.fillStyle = color;
        const x = s === 'left' ? PONG.LEFT_X : PONG.RIGHT_X;
        ctx.fillRect(x, Math.round(y - PONG.PADDLE_H / 2), PONG.PADDLE_W, PONG.PADDLE_H);
      };
      paddle(side, mine, MINE);
      paddle(other(side), theirs, THEIRS);

      if (!g) return;
      const ball = g.phase === 'playing' ? extrapolateBall(g.ball, g.receivedAt, now) : g.ball;
      ctx.fillStyle = BALL;
      ctx.fillRect(Math.round(ball.x - PONG.BALL / 2), Math.round(ball.y - PONG.BALL / 2), PONG.BALL, PONG.BALL);

      const banner = (text: string) => {
        ctx.fillStyle = SHADE;
        ctx.fillRect(0, PONG.H / 2 - 9, PONG.W, 18);
        ctx.fillStyle = LINE;
        ctx.font = '600 10px "Inter Variable", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, PONG.W / 2, PONG.H / 2 + 0.5);
      };
      if (g.phase === 'countdown') {
        const left = g.serveAt - g.serverTs - (now - g.receivedAt);
        banner(String(Math.max(1, Math.ceil(left / 1000))));
      } else if (g.phase === 'paused') {
        banner('Esperando o adversário voltar');
      }
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [world]);

  if (!seat || !table) return null;
  const nameOf = (id: string | null) =>
    id === 'bot' ? 'Bot' : id === world.selfId ? 'Você' : id ? (world.players.get(id)?.name ?? 'Alguém') : '…';
  const opponent = seat.side === 'left' ? table.right : table.left;

  let status = null;
  if (table.phase === 'waiting') {
    status = (
      <div className="pong-status">
        <span>{notice ?? 'Esperando alguém do outro lado da mesa.'}</span>
        <button type="button" className="primary" onClick={() => send({ t: 'game.bot' })}>
          Jogar contra o bot
        </button>
      </div>
    );
  } else if (table.phase === 'ended') {
    status = (
      <div className="pong-status">
        <span>{notice ?? 'Fim de jogo.'}</span>
        <button
          type="button"
          className="primary"
          disabled={askedRematch}
          onClick={() => {
            setAskedRematch(true);
            setNotice(null);
            send({ t: 'game.rematch' });
          }}
        >
          {askedRematch && opponent !== 'bot' ? 'Esperando o outro aceitar' : 'Revanche'}
        </button>
      </div>
    );
  }

  const touch = (key: string) => ({
    onPointerDown: () => keys.press(key, true, true),
    onPointerUp: () => keys.press(key, false, true),
    onPointerLeave: () => keys.press(key, false, true),
    onPointerCancel: () => keys.press(key, false, true),
  });

  return (
    <Modal title="Pingpong" onClose={() => send({ t: 'game.leave' })}>
      <div className="pong-score" aria-live="polite">
        <span>{nameOf(table.left)}</span>
        <strong>
          {table.score.left} × {table.score.right}
        </strong>
        <span>{nameOf(table.right)}</span>
      </div>
      <canvas ref={canvas} className="pong-field" width={PONG.W} height={PONG.H} aria-label="Campo da partida" />
      {status}
      <div className="pong-controls">
        <span className="hint">Setas ou W/S movem a sua raquete (azul).</span>
        <button type="button" aria-label="Raquete para cima" {...touch('touch-up')}>
          ▲
        </button>
        <button type="button" aria-label="Raquete para baixo" {...touch('touch-down')}>
          ▼
        </button>
        <button type="button" onClick={() => send({ t: 'game.leave' })}>
          Sair da mesa
        </button>
      </div>
    </Modal>
  );
}
