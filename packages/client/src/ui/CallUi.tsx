import { useSyncExternalStore } from 'react';
import type { CallStore } from '../net/call-store.ts';
import type { ClientWorld } from '../net/client-world.ts';
import { useWorld } from './useWorld.ts';

/** Re-renderiza o componente a cada mudança da `CallStore` (ela avisa pelo `version`). */
export function useCalls(calls: CallStore): CallStore {
  useSyncExternalStore(
    (onChange) => calls.subscribe(onChange),
    () => calls.version,
  );
  return calls;
}

/** Chamada recebida, chamando, em andamento e o aviso de fim. */
export function CallUi({ calls, world }: { calls: CallStore; world: ClientWorld }) {
  useCalls(calls);
  useWorld(world);
  const playerName = (id: string) => world.players.get(id)?.name ?? 'alguém';
  const { state } = calls;

  return (
    <div className="call-ui">
      {state.kind === 'ringing' && (
        <div className="call-card ringing" role="alertdialog" aria-label="Chamada recebida">
          <span>{playerName(state.from)} está ligando</span>
          <button type="button" className="primary" onClick={() => calls.answer(true)}>
            Atender
          </button>
          <button type="button" onClick={() => calls.answer(false)}>
            Recusar
          </button>
        </div>
      )}
      {state.kind === 'calling' && (
        <div className="call-card">
          <span>Chamando {playerName(state.to)}…</span>
          <button type="button" onClick={() => calls.hangUp()}>
            Cancelar
          </button>
        </div>
      )}
      {state.kind === 'active' && (
        <div className="call-card active">
          <span>Em chamada com {playerName(state.peer)}</span>
          <button type="button" onClick={() => calls.hangUp()}>
            Encerrar
          </button>
        </div>
      )}
      {calls.notice && (
        <div className="call-card notice">
          <span>{calls.notice}</span>
          <button type="button" onClick={() => calls.dismissNotice()}>
            Ok
          </button>
        </div>
      )}
    </div>
  );
}
