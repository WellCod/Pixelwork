import { CALL_RING_TIMEOUT_MS, type ClientMsg } from '@pixelwork/shared';
import type { ClientWorld } from './client-world.ts';

export type CallState =
  | { kind: 'idle' }
  | { kind: 'calling'; to: string }
  | { kind: 'ringing'; callId: string; from: string }
  | { kind: 'active'; peer: string };

const ENDED_TEXT = {
  declined: 'recusou a chamada',
  left: 'encerrou a chamada',
  timeout: 'não atendeu',
  busy: 'está ocupado agora',
} as const;

/**
 * Estado da chamada do ponto de vista deste cliente. O servidor é quem decide; aqui só se
 * junta o que ele mandou (incoming, ended, atividade) com o pedido feito daqui.
 */
export class CallStore {
  state: CallState = { kind: 'idle' };
  notice: string | null = null;
  version = 0;
  private readonly listeners = new Set<() => void>();
  private callingTimer: ReturnType<typeof setTimeout> | null = null;

  private send: (msg: ClientMsg) => void = () => undefined;

  constructor(private readonly world: ClientWorld) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Liga a store à conexão atual; devolve a função que desliga. */
  start(send: (msg: ClientMsg) => void): () => void {
    this.send = send;
    const stop = this.world.subscribe((event) => {
      const { world } = this;
      switch (event.type) {
        case 'callIncoming':
          this.set({ kind: 'ringing', callId: event.callId, from: event.from });
          break;
        case 'callEnded': {
          const peer = this.peer();
          const name = (peer && world.players.get(peer)?.name) ?? 'A outra pessoa';
          this.notice = `${name} ${ENDED_TEXT[event.reason]}.`;
          this.set({ kind: 'idle' });
          break;
        }
        case 'update': {
          // Atividade "call" nos dois lados é o sinal de que a chamada começou.
          const self = world.selfId ? world.players.get(world.selfId) : undefined;
          if (event.id !== world.selfId || !self) break;
          if (self.activity === 'call' && this.state.kind !== 'active') {
            const peer = this.peer();
            if (peer) this.set({ kind: 'active', peer });
          }
          break;
        }
        case 'error':
          if (['not_seated', 'call_unavailable', 'already_in_call'].includes(event.code)) {
            this.notice = event.code === 'not_seated' ? 'Sente na sua mesa para ligar.' : 'Não deu para ligar agora.';
            this.set({ kind: 'idle' });
          }
          break;
        default:
          break;
      }
    });
    return () => {
      stop();
      if (this.callingTimer) clearTimeout(this.callingTimer);
      this.callingTimer = null;
    };
  }

  call(userId: string): void {
    this.notice = null;
    this.send({ t: 'call.invite', userId });
    this.set({ kind: 'calling', to: userId });
    if (this.callingTimer) clearTimeout(this.callingTimer);
    // O servidor manda timeout; isto só protege a UI se a mensagem se perder.
    this.callingTimer = setTimeout(() => {
      if (this.state.kind === 'calling') this.set({ kind: 'idle' });
    }, CALL_RING_TIMEOUT_MS + 5_000);
  }

  answer(accept: boolean): void {
    if (this.state.kind !== 'ringing') return;
    this.send({ t: 'call.reply', callId: this.state.callId, accept });
    this.set(accept ? { kind: 'active', peer: this.state.from } : { kind: 'idle' });
  }

  hangUp(): void {
    this.send({ t: 'call.leave' });
    this.set({ kind: 'idle' });
  }

  dismissNotice(): void {
    this.notice = null;
    this.changed();
  }

  private peer(): string | null {
    const s = this.state;
    if (s.kind === 'calling') return s.to;
    if (s.kind === 'ringing') return s.from;
    if (s.kind === 'active') return s.peer;
    return null;
  }

  private set(state: CallState): void {
    if (this.callingTimer && state.kind !== 'calling') {
      clearTimeout(this.callingTimer);
      this.callingTimer = null;
    }
    this.state = state;
    this.changed();
  }

  private changed(): void {
    this.version++;
    for (const listener of this.listeners) listener();
  }
}
