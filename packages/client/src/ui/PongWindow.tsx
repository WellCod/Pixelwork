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

const oppositeSide = (side: PongSide): PongSide => (side === 'left' ? 'right' : 'left');

/**
 * Janela da partida de pingpong, aberta enquanto o próprio jogador está numa mesa. O campo é
 * desenhado num canvas de 160x90 a cada quadro, a partir do último estado do servidor: a raquete
 * própria é prevista e a bola extrapolada (`pong-predict.ts`).
 */
export function PongWindow({ world, send }: { world: ClientWorld; send: (message: ClientMsg) => void }) {
  useWorld(world);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [askedRematch, setAskedRematch] = useState(false);
  const seat = world.seat;
  const table = seat ? world.tables.get(seat.tableKey) : undefined;

  // Estado das teclas da raquete; só manda `game.input` quando a direção muda.
  const paddleKeys = useMemo(() => new PaddleKeys((direction) => send(world.gameInput(direction))), [world, send]);

  // Teclado: setas e W/S mexem a raquete, só sentado à mesa e fora de campos de texto (o
  // componente fica montado o tempo todo, e W/S são letras do chat).
  useEffect(() => {
    const handleKey = (event: KeyboardEvent, down: boolean) => {
      if (paddleKeys.press(event.key, down, world.seat !== null && !isTextField(event.target)) && down) {
        event.preventDefault();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => handleKey(event, true);
    const onKeyUp = (event: KeyboardEvent) => handleKey(event, false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [world, paddleKeys]);

  // Avisos da partida: fim e vitória por desistência.
  useEffect(
    () =>
      world.subscribe((event) => {
        // Reconexão: o servidor zerou a raquete; a próxima tecla precisa ser enviada de novo.
        if (event.type === 'reset') paddleKeys.reset();
        // Partida nova (revanche ou alguém chegou): o aviso da anterior sai e a raquete recomeça.
        if (event.type === 'table' && event.table.tableKey === world.seat?.tableKey && event.table.phase === 'playing') {
          setNotice(null);
          setAskedRematch(false);
          paddleKeys.reset();
        }
        if (event.type !== 'gameEvents' || !world.seat) return;
        const endEvent = event.events.find((gameEvent) => gameEvent.type === 'end');
        if (!endEvent) return;
        const won = endEvent.winner === world.seat.side;
        const currentTable = world.tables.get(world.seat.tableKey);
        // Fim sem a mesa em `ended` quer dizer que o adversário saiu no meio da partida.
        const opponentQuit = currentTable?.phase !== 'ended';
        setNotice(opponentQuit ? 'O adversário saiu: vitória por desistência.' : won ? 'Você venceu!' : 'Você perdeu.');
        setAskedRematch(false);
      }),
    [world, paddleKeys],
  );

  // Desenho por quadro: um laço de requestAnimationFrame lê o mundo direto, sem passar pelo React.
  useEffect(() => {
    let animationFrameId = 0;
    const draw = () => {
      animationFrameId = requestAnimationFrame(draw);
      const context2d = canvas.current?.getContext('2d');
      const side = world.seat?.side;
      if (!context2d || !side) return;
      const lastGame = world.lastGame;
      const now = Date.now();
      // Campo, linha central tracejada e as bordas de cima e de baixo.
      context2d.fillStyle = FIELD;
      context2d.fillRect(0, 0, PONG.FIELD_WIDTH, PONG.FIELD_HEIGHT);
      context2d.fillStyle = LINE;
      for (let y = 2; y < PONG.FIELD_HEIGHT; y += 6) context2d.fillRect(PONG.FIELD_WIDTH / 2 - 0.5, y, 1, 3);
      context2d.fillRect(0, 0, PONG.FIELD_WIDTH, 1);
      context2d.fillRect(0, PONG.FIELD_HEIGHT - 1, PONG.FIELD_WIDTH, 1);

      // A própria raquete é prevista a partir das teclas ainda não confirmadas; a do outro vem do servidor.
      const myPaddleY = lastGame
        ? predictPaddle(lastGame.paddles[side], world.gameAckedDir, world.gamePending, lastGame.receivedAt, now)
        : PONG.FIELD_HEIGHT / 2;
      const theirPaddleY = lastGame ? lastGame.paddles[oppositeSide(side)] : PONG.FIELD_HEIGHT / 2;
      const drawPaddle = (paddleSide: PongSide, y: number, color: string) => {
        context2d.fillStyle = color;
        const x = paddleSide === 'left' ? PONG.LEFT_X : PONG.RIGHT_X;
        context2d.fillRect(x, Math.round(y - PONG.PADDLE_H / 2), PONG.PADDLE_W, PONG.PADDLE_H);
      };
      drawPaddle(side, myPaddleY, MINE);
      drawPaddle(oppositeSide(side), theirPaddleY, THEIRS);

      if (!lastGame) return;
      // Bola extrapolada desde o último estado só com a partida rolando; fora disso fica parada.
      const ball = lastGame.phase === 'playing' ? extrapolateBall(lastGame.ball, lastGame.receivedAt, now) : lastGame.ball;
      context2d.fillStyle = BALL;
      context2d.fillRect(Math.round(ball.x - PONG.BALL_SIZE / 2), Math.round(ball.y - PONG.BALL_SIZE / 2), PONG.BALL_SIZE, PONG.BALL_SIZE);

      const drawBanner = (text: string) => {
        context2d.fillStyle = SHADE;
        context2d.fillRect(0, PONG.FIELD_HEIGHT / 2 - 9, PONG.FIELD_WIDTH, 18);
        context2d.fillStyle = LINE;
        context2d.font = '600 10px "Inter Variable", system-ui, sans-serif';
        context2d.textAlign = 'center';
        context2d.textBaseline = 'middle';
        context2d.fillText(text, PONG.FIELD_WIDTH / 2, PONG.FIELD_HEIGHT / 2 + 0.5);
      };
      if (lastGame.phase === 'countdown') {
        // Tempo até o saque no relógio do servidor, descontado o tempo desde que o estado chegou.
        const msUntilServe = lastGame.serveAt - lastGame.serverTs - (now - lastGame.receivedAt);
        drawBanner(String(Math.max(1, Math.ceil(msUntilServe / 1000))));
      } else if (lastGame.phase === 'paused') {
        drawBanner('Esperando o adversário voltar');
      }
    };
    draw();
    return () => cancelAnimationFrame(animationFrameId);
  }, [world]);

  if (!seat || !table) return null;
  const nameOf = (id: string | null) =>
    id === 'bot' ? 'Bot' : id === world.selfId ? 'Você' : id ? (world.players.get(id)?.name ?? 'Alguém') : '…';
  const opponent = seat.side === 'left' ? table.right : table.left;

  // Faixa abaixo do campo: chamar o bot enquanto espera, revanche depois do fim.
  let statusBar = null;
  if (table.phase === 'waiting') {
    statusBar = (
      <div className="pong-status">
        <span>{notice ?? 'Esperando alguém do outro lado da mesa.'}</span>
        <button type="button" className="primary" onClick={() => send({ t: 'game.bot' })}>
          Jogar contra o bot
        </button>
      </div>
    );
  } else if (table.phase === 'ended') {
    statusBar = (
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

  /** Botões de toque fazem papel de tecla: aperta no pointerdown e solta em qualquer saída do dedo. */
  const touchHandlers = (key: string) => ({
    onPointerDown: () => paddleKeys.press(key, true, true),
    onPointerUp: () => paddleKeys.press(key, false, true),
    onPointerLeave: () => paddleKeys.press(key, false, true),
    onPointerCancel: () => paddleKeys.press(key, false, true),
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
      <canvas ref={canvas} className="pong-field" width={PONG.FIELD_WIDTH} height={PONG.FIELD_HEIGHT} aria-label="Campo da partida" />
      {statusBar}
      <div className="pong-controls">
        <span className="hint">Setas ou W/S movem a sua raquete (azul).</span>
        <button type="button" aria-label="Raquete para cima" {...touchHandlers('touch-up')}>
          ▲
        </button>
        <button type="button" aria-label="Raquete para baixo" {...touchHandlers('touch-down')}>
          ▼
        </button>
        <button type="button" onClick={() => send({ t: 'game.leave' })}>
          Sair da mesa
        </button>
      </div>
    </Modal>
  );
}
