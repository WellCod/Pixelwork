/**
 * Simulador de rede do overlay de netcode: atraso e variação aplicados no próprio cliente, nas
 * duas direções. Não há perda de pacote: o WebSocket roda sobre TCP, e perda ali aparece como
 * atraso (retransmissão), que o jitter já representa.
 */
export class NetSim {
  /** Atraso médio de ida e volta somado, em ms (metade em cada direção). */
  latencyMs = 0;
  /** Variação máxima por mensagem, em ms. */
  jitterMs = 0;
  /** Overlay de netcode visível. */
  overlay = false;
  /** Muda a cada `set`; a UI em React usa como snapshot. */
  version = 0;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly random: () => number = Math.random) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Atraso de uma mensagem numa direção. */
  delay(): number {
    if (this.latencyMs === 0 && this.jitterMs === 0) return 0;
    return this.latencyMs / 2 + this.random() * this.jitterMs;
  }

  set(patch: Partial<Pick<NetSim, 'latencyMs' | 'jitterMs' | 'overlay'>>): void {
    Object.assign(this, patch);
    this.version++;
    for (const listener of this.listeners) listener();
  }
}
