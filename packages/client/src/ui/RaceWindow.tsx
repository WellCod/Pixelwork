import { RACE_CONES, RACE_LENGTH, type ClientMsg, type RaceDriver, type RaceLane, type RaceState } from '@pixelwork/shared';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ClientWorld } from '../net/client-world.ts';
import { Modal } from './Modal.tsx';
import './race.css';

const WIDTH = 352;
const HEIGHT = 198;
const HORIZON = 47;

function paintRace(ctx: CanvasRenderingContext2D, race: RaceState, own: RaceDriver): void {
  const rect = (color: string, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  };
  rect('#232651', 0, 0, WIDTH, HORIZON);
  rect('#583c71', 0, 28, WIDTH, HORIZON - 28);
  rect('#ec777f', 247, 17, 26, 21);
  rect('#ffab82', 250, 14, 20, 28);
  for (const [x, height, width] of [[6, 15, 15], [30, 9, 24], [70, 20, 14], [89, 13, 11],
    [111, 24, 19], [134, 10, 10], [209, 13, 9], [282, 8, 15], [317, 18, 16]] as const) {
    rect('#282943', x, HORIZON - height, width, height);
    rect('#686087', x + 3, HORIZON - height + 4, 2, 2);
  }
  for (let y = HORIZON; y < HEIGHT; y++) {
    const ratio = (y - HORIZON) / (HEIGHT - HORIZON);
    const half = 24 + ratio * 131;
    const row = Math.floor((1 - ratio) * 260 + own.distance);
    const alternate = Math.floor(row / 22) % 2 === 0;
    rect(alternate ? '#234b51' : '#2c5a57', 0, y, WIDTH, 1);
    rect(alternate ? '#f57f85' : '#f5d6a5', WIDTH / 2 - half - 5, y, half * 2 + 10, 1);
    rect(alternate ? '#35455e' : '#33415a', WIDTH / 2 - half, y, half * 2, 1);
    if (row % 39 < 17) {
      for (const side of [-1, 1]) rect('#c2cada', WIDTH / 2 + side * half / 3 - 1, y, ratio * 2 + 1, 1);
    }
  }
  const project = (lane: RaceLane, distance: number) => {
    const ratio = Math.min(1.02, Math.max(0, 0.84 - distance / 310));
    const half = 24 + ratio * 131;
    return { x: WIDTH / 2 + (lane - 1) * half * 2 / 3, y: HORIZON + ratio * (HEIGHT - HORIZON), scale: ratio };
  };
  const finish = RACE_LENGTH - own.distance;
  if (finish < 255 && finish > -48) {
    const { y, scale } = project(1, finish);
    const width = (24 + scale * 131) / 6;
    for (let tile = 0; tile < 12; tile++) {
      rect(tile % 2 ? '#ecf0df' : '#1e2840', WIDTH / 2 + (tile - 6) * width, y, width, 3);
      rect(tile % 2 ? '#1e2840' : '#ecf0df', WIDTH / 2 + (tile - 6) * width, y + 3, width, 3);
    }
  }
  for (const cone of [...RACE_CONES].reverse()) {
    const delta = cone.distance - own.distance;
    if (delta < -42 || delta > 250) continue;
    const { x, y, scale } = project(cone.lane, delta);
    rect('#19263f', x - 7 * scale, y, 14 * scale, 3 * scale);
    rect('#f99457', x - 5 * scale, y - 10 * scale, 10 * scale, 10 * scale);
    rect('#ffe9b3', x - 4 * scale, y - 7 * scale, 8 * scale, 2 * scale);
    rect('#f99457', x - 2 * scale, y - 14 * scale, 4 * scale, 4 * scale);
  }
  for (const driver of [...race.drivers].sort((a, b) => b.distance - a.distance)) {
    const delta = driver.distance - own.distance;
    if (delta < -42 || delta > 245) continue;
    const { x: center, y, scale } = project(driver.lane, delta);
    const local = driver.id === own.id;
    const size = 0.35 + scale * 0.85;
    const beside = race.drivers.some((other) => other.id !== driver.id &&
      other.lane === driver.lane && Math.abs(other.distance - driver.distance) < 20);
    const x = center + (beside ? (local ? -11 : 11) * size : 0);
    const dark = local ? '#23567c' : '#79435d';
    const body = local ? '#59d5ee' : '#ff9f74';
    rect('#20273d', x - 15 * size, y - 8 * size, 30 * size, 11 * size);
    rect(dark, x - 12 * size, y - 15 * size, 24 * size, 15 * size);
    rect(driver.hit ? '#f5db91' : body, x - 10 * size, y - 12 * size, 20 * size, 10 * size);
    rect('#2c3c59', x - 7 * size, y - 15 * size, 14 * size, 5 * size);
    rect('#f77483', x - 10 * size, y - 3 * size, 4 * size, 2 * size);
    rect('#f77483', x + 6 * size, y - 3 * size, 4 * size, 2 * size);
  }
}

export function RaceWindow({ world, send }: { world: ClientWorld; send: (message: ClientMsg) => void }) {
  const race = useSyncExternalStore((change) => world.subscribe(change), () => world.race);
  const [error, setError] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const own = race?.drivers.find(({ id }) => id === world.selfId);
  const steering = race?.phase === 'running' || race?.phase === 'countdown';
  const leave = () => send({ t: 'race.leave' });

  useEffect(() => world.subscribe((event) => {
    if (event.type === 'selfStep' || event.type === 'race' || event.type === 'reset') setError(null);
    if (event.type === 'error' && event.code === 'race_busy') setError('Este fliperama está ocupado ou você já está em outra atividade.');
    if (event.type === 'error' && event.code === 'race_not_at_arcade') setError('Fique em frente ao fliperama para jogar.');
  }), [world]);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx && race && own) paintRace(ctx, race, own);
  }, [race, own]);

  useEffect(() => {
    if (!steering) return;
    const arrow = (event: KeyboardEvent) => {
      const dir = event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a' ? -1 :
        event.key === 'ArrowRight' || event.key.toLowerCase() === 'd' ? 1 : 0;
      if (!dir) return;
      event.preventDefault();
      if (!event.repeat) send({ t: 'race.steer', dir });
    };
    window.addEventListener('keydown', arrow);
    return () => window.removeEventListener('keydown', arrow);
  }, [steering, send]);

  if (!race || !own) return error ? <div className="race-error hud-card" role="alert">{error}</div> : null;
  const rival = race.drivers.find(({ id }) => id !== own.id);
  const status = race.phase === 'countdown' ? String(race.countdown)
    : race.phase === 'waiting' ? 'Aguardando outro jogador no fliperama ao lado'
      : race.phase === 'running' ? null
        : race.opponentLeft ? 'O outro jogador saiu'
          : race.solo ? 'Corrida concluída'
            : race.winner === null ? 'Empate' : race.winner === own.id ? 'Você venceu!' : 'O adversário venceu';

  return (
    <Modal title="Corrida de fliperama" className="race-modal" onClose={leave}>
      <div className="race-score">
        <span><strong>Você</strong> {Math.min(RACE_LENGTH, Math.floor(own.distance))} / {RACE_LENGTH} m</span>
        {rival && <span><strong>Adversário</strong> {Math.min(RACE_LENGTH, Math.floor(rival.distance))} m</span>}
      </div>
      <div className="race-track">
        <canvas ref={canvas} width={WIDTH} height={HEIGHT} role="img" aria-label="Pista noturna com três faixas, cones e carros" />
        {status && <div className="race-status" role="status">{status}</div>}
      </div>
      <div className="race-controls">
        {race.phase === 'waiting' && <button type="button" className="primary" onClick={() => send({ t: 'race.solo' })}>Jogar sozinho</button>}
        {race.phase === 'finished' && <button type="button" className="primary" onClick={() => send({ t: 'race.restart' })}>Jogar de novo</button>}
        {steering && <>
          <button type="button" onClick={() => send({ t: 'race.steer', dir: -1 })}>← Esquerda</button>
          <button type="button" onClick={() => send({ t: 'race.steer', dir: 1 })}>Direita →</button>
        </>}
        <button type="button" onClick={leave}>Sair da corrida</button>
      </div>
      {steering && <p className="race-hint">Use as setas ou os botões para desviar dos cones.</p>}
    </Modal>
  );
}
