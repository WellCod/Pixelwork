import { useEffect, useState, useSyncExternalStore } from 'react';
import type { NetStats } from '../net/connection.ts';
import type { ClientWorld } from '../net/client-world.ts';
import type { NetSim } from '../net/net-sim.ts';

interface Props {
  sim: NetSim;
  world: ClientWorld;
  stats: () => NetStats | null;
  onReplay?: () => void;
}

/** Milissegundos arredondados para exibir; sem medida ainda, um travessão. */
const formatMs = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${Math.round(value)} ms`);

/**
 * Overlay de netcode (tecla F3 ou botão "Rede"): RTT, jitter, latência do tick, passos ainda não
 * confirmados e correções, mais o simulador de latência. Com ele aberto, o mapa mostra um
 * fantasma na posição que o servidor confirmou por último.
 */
export function NetOverlay({ sim, world, stats, onReplay }: Props) {
  useSyncExternalStore(
    (onChange) => sim.subscribe(onChange),
    () => sim.version,
  );
  // Contador só para forçar render periódico enquanto o overlay está aberto.
  const [, setFrame] = useState(0);

  // F3 liga e desliga o overlay de qualquer lugar da página.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F3') {
        event.preventDefault();
        sim.set({ overlay: !sim.overlay });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sim]);

  // Os números mudam fora do React (pong, tick): redesenha algumas vezes por segundo.
  useEffect(() => {
    if (!sim.overlay) return;
    const timer = setInterval(() => setFrame((frame) => frame + 1), 250);
    return () => clearInterval(timer);
  }, [sim.overlay]);

  if (!sim.overlay) {
    return (
      <details className="diagnostics-menu">
        <summary aria-label="Diagnóstico">Diagnóstico</summary>
        <div>
          <button type="button" onClick={() => sim.set({ overlay: true })}>Rede (F3)</button>
          {onReplay && <button type="button" onClick={onReplay}>Replay</button>}
        </div>
      </details>
    );
  }

  const netStats = stats();
  const tick = world.lastTick;
  // Latência do tick: hora local convertida para a do servidor menos a hora de envio do tick.
  const tickLatency =
    tick && netStats?.clockOffset != null ? tick.receivedAt + netStats.clockOffset - tick.serverTs : null;

  return (
    <section className="net-overlay" aria-label="Overlay de rede">
      <header>
        <strong>Rede</strong>
        <button type="button" aria-label="Fechar overlay de rede" onClick={() => sim.set({ overlay: false })}>
          ×
        </button>
      </header>
      <dl>
        <dt>RTT</dt>
        <dd>
          {formatMs(netStats?.rtt)} <span className="muted">(média {formatMs(netStats?.rttAvg)})</span>
        </dd>
        <dt>Jitter</dt>
        <dd>{formatMs(netStats?.jitter)}</dd>
        <dt>Tick → aqui</dt>
        <dd>{formatMs(tickLatency)}</dd>
        <dt>Passos pendentes</dt>
        <dd>{world.pendingCount}</dd>
        <dt>Correções</dt>
        <dd>{world.corrections}</dd>
      </dl>
      <fieldset>
        <legend>Simular rede ruim</legend>
        <label>
          Latência {sim.latencyMs} ms
          <input
            type="range"
            min={0}
            max={600}
            step={20}
            value={sim.latencyMs}
            onChange={(event) => sim.set({ latencyMs: Number(event.target.value) })}
          />
        </label>
        <label>
          Jitter {sim.jitterMs} ms
          <input
            type="range"
            min={0}
            max={300}
            step={10}
            value={sim.jitterMs}
            onChange={(event) => sim.set({ jitterMs: Number(event.target.value) })}
          />
        </label>
      </fieldset>
      <p className="muted">O quadrado tracejado no mapa é a posição que o servidor já confirmou.</p>
    </section>
  );
}
