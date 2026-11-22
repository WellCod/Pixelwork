import { isWalkable, replay, zoneAt, type CompiledMap, type Recording, type ReplayFrame } from '@pixelwork/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { mapApi } from '../api.ts';
import { Modal } from './Modal.tsx';
import { errorMessage } from './useWorld.ts';

interface Props {
  spaceId: string;
  map: CompiledMap;
  mapVersion: number;
  nameOf: (id: string) => string;
  onClose: () => void;
}

const SPEEDS = [1, 4, 16, 64] as const;
const COLORS = ['#fee761', '#2ce8f5', '#f77622', '#b55088', '#63c74d', '#e43b44', '#c0cbdc', '#0099db'];

/** Cor estável por pessoa, derivada do id. */
function colorOf(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length] ?? '#ffffff';
}

/** Índice do último quadro com tempo <= t (busca binária). */
function frameAt(frames: readonly ReplayFrame[], t: number): number {
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((frames[mid]?.t ?? Infinity) <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Replay da simulação (só admin): a gravação do servidor reproduzida aqui com o mesmo `step`
 * puro. Mostra que o estado do mapa sai só das entradas e do relógio.
 */
export function ReplayModal({ spaceId, map, mapVersion, nameOf, onClose }: Props) {
  const [recording, setRecording] = useState<Recording | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(4);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    mapApi
      .replay(spaceId)
      .then((r) => {
        setRecording(r.recording);
        if (r.recording) setTime(r.recording.startedAt);
      })
      .catch((e: unknown) => setError(errorMessage(e)));
  }, [spaceId]);

  const frames = useMemo(() => {
    if (!recording) return [];
    const list: ReplayFrame[] = [];
    replay(map, recording, (f) => list.push(f));
    return list;
  }, [map, recording]);

  const start = recording?.startedAt ?? 0;
  const end = frames.at(-1)?.t ?? start;

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      setTime((t) => {
        const next = t + dt * speed;
        if (next >= end) setPlaying(false);
        return Math.min(next, end);
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, end]);

  const cell = Math.max(2, Math.floor(Math.min(400 / map.width, 280 / map.height)));

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const meeting = zoneAt(map, x, y).type === 'meeting';
        ctx.fillStyle = !isWalkable(map, x, y) ? '#181425' : meeting ? '#3a4466' : '#262b44';
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    const frame = frames.length > 0 ? frames[frameAt(frames, time)] : undefined;
    for (const [id, p] of frame?.players ?? []) {
      ctx.fillStyle = colorOf(id);
      ctx.beginPath();
      ctx.arc(p.x * cell + cell / 2, p.y * cell + cell / 2, Math.max(2, cell * 0.45), 0, Math.PI * 2);
      ctx.fill();
    }
  }, [map, frames, time, cell]);

  const frame = frames.length > 0 ? frames[frameAt(frames, time)] : undefined;

  return (
    <Modal title="Replay da simulação" onClose={onClose}>
      {error && <p className="error">{error}</p>}
      {recording === undefined && !error && <p className="muted">Carregando a gravação…</p>}
      {recording === null && <p>Nada gravado ainda: ninguém entrou neste coworking desde que o servidor subiu.</p>}
      {recording && (
        <>
          {recording.mapVersion !== mapVersion && (
            <p className="error">A gravação é de outra versão do mapa; as posições podem não bater.</p>
          )}
          <canvas
            ref={canvas}
            className="replay-canvas"
            width={map.width * cell}
            height={map.height * cell}
            aria-label="Mapa do replay"
          />
          <div className="replay-controls">
            <button type="button" className="primary" onClick={() => setPlaying((p) => !p)} disabled={frames.length === 0}>
              {playing ? 'Pausar' : time >= end ? 'Repetir' : 'Reproduzir'}
            </button>
            {!playing && time >= end && end > start && (
              <button type="button" onClick={() => setTime(start)}>
                Do início
              </button>
            )}
            <label>
              Velocidade
              <select value={speed} onChange={(e) => setSpeed(Number(e.target.value) as (typeof SPEEDS)[number])}>
                {SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {s}x
                  </option>
                ))}
              </select>
            </label>
            <span className="muted">
              {clock(time - start)} / {clock(end - start)}
            </span>
          </div>
          <input
            type="range"
            className="replay-timeline"
            aria-label="Linha do tempo"
            min={start}
            max={Math.max(end, start + 1)}
            value={time}
            onChange={(e) => {
              setPlaying(false);
              setTime(Number(e.target.value));
            }}
          />
          <ul className="replay-legend">
            {[...(frame?.players.keys() ?? [])].map((id) => (
              <li key={id}>
                <span className="replay-dot" style={{ background: colorOf(id) }} />
                {nameOf(id)}
              </li>
            ))}
          </ul>
          <p className="muted">
            {recording.events.length} eventos desde a última troca de mapa. O estado vem só das entradas gravadas e do
            relógio, reproduzidas com o mesmo <code>step</code> do servidor.
          </p>
        </>
      )}
      <div className="actions">
        <button type="button" onClick={onClose}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}
