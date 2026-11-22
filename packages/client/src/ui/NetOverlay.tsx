import { useEffect, useState, useSyncExternalStore } from 'react';
import type { NetStats } from '../net/connection.ts';
import type { ClientWorld } from '../net/client-world.ts';
import type { NetSim } from '../net/net-sim.ts';

interface Props {
  sim: NetSim;
  world: ClientWorld;
  stats: () => NetStats | null;
}

const ms = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${Math.round(value)} ms`);

/**
 * Overlay de netcode (tecla F3 ou botão "Rede"): RTT, jitter, latência do tick, passos ainda não
 * confirmados e correções, mais o simulador de latência. Com ele aberto, o mapa mostra um
 * fantasma na posição que o servidor confirmou por último.
 */
export function NetOverlay({ sim, world, stats }: Props) {
  useSyncExternalStore(
    (onChange) => sim.subscribe(onChange),
    () => sim.version,
  );
  const [, setFrame] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F3') {
        e.preventDefault();
        sim.set({ overlay: !sim.overlay });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sim]);

  // Os números mudam fora do React (pong, tick): redesenha algumas vezes por segundo.
  useEffect(() => {
    if (!sim.overlay) return;
    const timer = setInterval(() => setFrame((f) => f + 1), 250);
    return () => clearInterval(timer);
  }, [sim.overlay]);

  if (!sim.overlay) {
    return (
      <button type="button" className="net-toggle" title="Overlay de rede (F3)" onClick={() => sim.set({ overlay: true })}>
        Rede
      </button>
    );
  }

  const s = stats();
  const tick = world.lastTick;
  // Latência do tick: hora local convertida para a do servidor menos a hora de envio do tick.
  const tickLatency = tick && s?.clockOffset != null ? tick.receivedAt + s.clockOffset - tick.serverTs : null;

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
          {ms(s?.rtt)} <span className="muted">(média {ms(s?.rttAvg)})</span>
        </dd>
        <dt>Jitter</dt>
        <dd>{ms(s?.jitter)}</dd>
        <dt>Tick → aqui</dt>
        <dd>{ms(tickLatency)}</dd>
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
            onChange={(e) => sim.set({ latencyMs: Number(e.target.value) })}
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
            onChange={(e) => sim.set({ jitterMs: Number(e.target.value) })}
          />
        </label>
      </fieldset>
      <p className="muted">O quadrado tracejado no mapa é a posição que o servidor já confirmou.</p>
    </section>
  );
}
