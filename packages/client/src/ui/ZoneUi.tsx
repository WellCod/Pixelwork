import { DIR_DELTA, KNOCK_TIMEOUT_MS, zoneAt, type ClientMsg } from '@pixelwork/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientWorld } from '../net/client-world.ts';
import type { DoorKnock } from './useDoorKnock.ts';
import { useWorld } from './useWorld.ts';

/** Pedido de entrada (batida na porta) recebido por quem está dentro da sala. */
interface KnockRequest {
  requestId: string;
  zoneKey: string;
  from: string;
}

/**
 * Tranca da sala (para quem está dentro), batida na porta (para quem está num tile vizinho de
 * uma sala trancada) e os pedidos que chegam para quem está dentro.
 */
export function ZoneUi({ world, send, knock }: { world: ClientWorld; send: (message: ClientMsg) => void; knock: DoorKnock }) {
  useWorld(world);
  const [requests, setRequests] = useState<KnockRequest[]>([]);
  // Timers pendentes, para cancelar todos ao desmontar e não mexer em estado depois disso.
  const pendingTimers = useRef(new Set<ReturnType<typeof setTimeout>>());

  /** `setTimeout` registrado em `pendingTimers`, que se remove da lista ao disparar. */
  // Estável (só mexe no ref), então pode entrar nas dependências do efeito abaixo sem refazê-lo.
  const runLater = useCallback((callback: () => void, delayMs: number) => {
    const timer = setTimeout(() => {
      pendingTimers.current.delete(timer);
      callback();
    }, delayMs);
    pendingTimers.current.add(timer);
  }, []);

  // Escuta as batidas recebidas por quem está dentro.
  useEffect(() => {
    const timersAtMount = pendingTimers.current;
    const unsubscribe = world.subscribe((event) => {
      if (event.type === 'knockRequest') {
        const request = { requestId: event.requestId, zoneKey: event.zoneKey, from: event.from };
        setRequests((currentRequests) => [...currentRequests, request]);
        // Sem mensagem de "resolvido" para os outros ocupantes: o pedido some com o prazo.
        runLater(
          () =>
            setRequests((currentRequests) =>
              currentRequests.filter((queued) => queued.requestId !== request.requestId),
            ),
          KNOCK_TIMEOUT_MS,
        );
      }
    });
    return () => {
      unsubscribe();
      for (const timer of timersAtMount) clearTimeout(timer);
      timersAtMount.clear();
    };
  }, [world, runLater]);

  const { map, self } = world;
  const currentZone = zoneAt(map, self.x, self.y);
  // Dentro de uma sala de reunião: o estado dela (trancada ou não).
  const insideZoneState = currentZone.type === 'meeting' ? world.zones.get(currentZone.key) : undefined;
  // Fora de sala: a primeira sala trancada num tile vizinho, para oferecer a batida na porta.
  const lockedDoorZone = currentZone.type === 'meeting'
    ? undefined
    : Object.values(DIR_DELTA)
        .map(([dx, dy]) => zoneAt(map, self.x + dx, self.y + dy))
        .find((neighborZone) => neighborZone.type === 'meeting' && world.zones.get(neighborZone.key)?.locked);

  const reply = (request: KnockRequest, allow: boolean) => {
    send({ t: 'zone.knockReply', requestId: request.requestId, allow });
    setRequests((currentRequests) => currentRequests.filter((queued) => queued.requestId !== request.requestId));
  };

  return (
    <div className="zone-ui">
      {insideZoneState && (
        <div className="zone-card">
          <span>
            {currentZone.name} {insideZoneState.locked ? '(trancada)' : ''}
          </span>
          <button
            type="button"
            onClick={() => send({ t: 'zone.lock', zoneKey: currentZone.key, locked: !insideZoneState.locked })}
          >
            {insideZoneState.locked ? 'Destrancar' : 'Trancar'}
          </button>
        </div>
      )}
      {lockedDoorZone && (
        <div className="zone-card">
          <span>{lockedDoorZone.name} está trancada</span>
          <button
            type="button"
            disabled={knock.pending === lockedDoorZone.key}
            onClick={() => knock.request(lockedDoorZone.key)}
          >
            {knock.pending === lockedDoorZone.key ? 'Aguardando…' : 'Bater na porta'}
          </button>
        </div>
      )}
      {knock.result && !insideZoneState && <div className="zone-card" role="status">{knock.result}</div>}
      {/* Pedidos de entrada só aparecem para quem está dentro da sala a que se referem. */}
      {insideZoneState &&
        requests
          .filter((request) => request.zoneKey === currentZone.key)
          .map((request) => (
            <div key={request.requestId} className="zone-card request">
              <span>{world.players.get(request.from)?.name ?? 'Alguém'} quer entrar</span>
              <button type="button" className="primary" onClick={() => reply(request, true)}>
                Deixar entrar
              </button>
              <button type="button" onClick={() => reply(request, false)}>
                Recusar
              </button>
            </div>
          ))}
    </div>
  );
}
