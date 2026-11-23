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

/** Multiplicadores de velocidade da reprodução. */
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
  let low = 0;
  let high = frames.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if ((frames[middle]?.t ?? Infinity) <= t) low = middle;
    else high = middle - 1;
  }
  return low;
}

/** Duração em milissegundos no formato mm:ss. */
const clock = (durationMs: number) => {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
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

  // Busca a gravação: `undefined` é carregando, `null` é "nada gravado ainda".
  useEffect(() => {
    mapApi
      .replay(spaceId)
      .then((replayResponse) => {
        setRecording(replayResponse.recording);
        if (replayResponse.recording) setTime(replayResponse.recording.startedAt);
      })
      .catch((requestError: unknown) => setError(errorMessage(requestError)));
  }, [spaceId]);

  // Roda a simulação inteira uma vez sobre a gravação e guarda todos os quadros para navegar.
  const frames = useMemo(() => {
    if (!recording) return [];
    const replayFrames: ReplayFrame[] = [];
    replay(map, recording, (replayFrame) => replayFrames.push(replayFrame));
    return replayFrames;
  }, [map, recording]);

  const start = recording?.startedAt ?? 0;
  const end = frames.at(-1)?.t ?? start;

  // Reprodução: a cada quadro do navegador avança o tempo da gravação pelo tempo real vezes a
  // velocidade, e para sozinha ao chegar no fim.
  useEffect(() => {
    if (!playing) return;
    let lastFrameAt = performance.now();
    let animationFrameId = 0;
    const loop = (now: number) => {
      const elapsedMs = now - lastFrameAt;
      lastFrameAt = now;
      setTime((currentTime) => {
        const nextTime = currentTime + elapsedMs * speed;
        if (nextTime >= end) setPlaying(false);
        return Math.min(nextTime, end);
      });
      animationFrameId = requestAnimationFrame(loop);
    };
    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [playing, speed, end]);

  // Lado do tile em pixels para o mapa caber em cerca de 400x280.
  const cell = Math.max(2, Math.floor(Math.min(400 / map.width, 280 / map.height)));

  // Redesenha o mapa (parede, sala de reunião, chão) e um ponto por pessoa no quadro do tempo atual.
  useEffect(() => {
    const context2d = canvas.current?.getContext('2d');
    if (!context2d) return;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const isMeetingTile = zoneAt(map, x, y).type === 'meeting';
        context2d.fillStyle = !isWalkable(map, x, y) ? '#181425' : isMeetingTile ? '#3a4466' : '#262b44';
        context2d.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    const frame = frames.length > 0 ? frames[frameAt(frames, time)] : undefined;
    for (const [id, position] of frame?.players ?? []) {
      context2d.fillStyle = colorOf(id);
      context2d.beginPath();
      context2d.arc(position.x * cell + cell / 2, position.y * cell + cell / 2, Math.max(2, cell * 0.45), 0, Math.PI * 2);
      context2d.fill();
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
            <button type="button" className="primary" onClick={() => setPlaying((isPlaying) => !isPlaying)} disabled={frames.length === 0}>
              {playing ? 'Pausar' : time >= end ? 'Repetir' : 'Reproduzir'}
            </button>
            {!playing && time >= end && end > start && (
              <button type="button" onClick={() => setTime(start)}>
                Do início
              </button>
            )}
            <label>
              Velocidade
              <select value={speed} onChange={(event) => setSpeed(Number(event.target.value) as (typeof SPEEDS)[number])}>
                {SPEEDS.map((speedOption) => (
                  <option key={speedOption} value={speedOption}>
                    {speedOption}x
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
            onChange={(event) => {
              setPlaying(false);
              setTime(Number(event.target.value));
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
