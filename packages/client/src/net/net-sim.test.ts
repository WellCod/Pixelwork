import { describe, expect, it } from 'vitest';
import { NetSim } from './net-sim.ts';

describe('NetSim', () => {
  it('sem simulação não atrasa', () => {
    expect(new NetSim(() => 0.5).delay()).toBe(0);
  });

  it('metade da latência em cada direção mais uma fração do jitter', () => {
    const sim = new NetSim(() => 0.5);
    sim.set({ latencyMs: 200, jitterMs: 40 });
    expect(sim.delay()).toBe(120);
  });

  it('avisa quem assina a cada mudança', () => {
    const sim = new NetSim();
    let calls = 0;
    sim.subscribe(() => calls++);
    sim.set({ overlay: true });
    expect(calls).toBe(1);
    expect(sim.overlay).toBe(true);
  });
});
