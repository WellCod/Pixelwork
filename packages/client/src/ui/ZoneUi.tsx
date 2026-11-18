import { DIR_DELTA, KNOCK_TIMEOUT_MS, zoneAt, type ClientMsg } from '@pixelwork/shared';
import { useEffect, useState } from 'react';
import type { ClientWorld } from '../net/client-world.ts';
import { useWorld } from './useWorld.ts';

interface Request {
  requestId: string;
  zoneKey: string;
  from: string;
}

/**
 * Tranca da sala (para quem está dentro), batida na porta (para quem está num tile vizinho de
 * uma sala trancada) e os pedidos que chegam para quem está dentro.
 */
export function ZoneUi({ world, send }: { world: ClientWorld; send: (msg: ClientMsg) => void }) {
  useWorld(world);
  const [requests, setRequests] = useState<Request[]>([]);
  const [knocking, setKnocking] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(
    () =>
      world.subscribe((event) => {
        if (event.type === 'knockRequest') {
          const request = { requestId: event.requestId, zoneKey: event.zoneKey, from: event.from };
          setRequests((list) => [...list, request]);
          // Sem mensagem de "resolvido" para os outros ocupantes: o pedido some com o prazo.
          setTimeout(() => {
            setRequests((list) => list.filter((r) => r.requestId !== request.requestId));
          }, KNOCK_TIMEOUT_MS);
        }
        if (event.type === 'knockResult') {
          setKnocking(null);
          setResult(event.allowed ? 'Pode entrar.' : 'Não liberaram a entrada.');
        }
      }),
    [world],
  );

  const { map, self } = world;
  const here = zoneAt(map, self.x, self.y);
  const inside = here.type === 'meeting' ? world.zones.get(here.key) : undefined;
  const door = here.type === 'meeting'
    ? undefined
    : Object.values(DIR_DELTA)
        .map(([dx, dy]) => zoneAt(map, self.x + dx, self.y + dy))
        .find((z) => z.type === 'meeting' && world.zones.get(z.key)?.locked);

  const reply = (request: Request, allow: boolean) => {
    send({ t: 'zone.knockReply', requestId: request.requestId, allow });
    setRequests((list) => list.filter((r) => r.requestId !== request.requestId));
  };

  return (
    <div className="zone-ui">
      {inside && (
        <div className="zone-card">
          <span>
            {here.name} {inside.locked ? '(trancada)' : ''}
          </span>
          <button type="button" onClick={() => send({ t: 'zone.lock', zoneKey: here.key, locked: !inside.locked })}>
            {inside.locked ? 'Destrancar' : 'Trancar'}
          </button>
        </div>
      )}
      {door && (
        <div className="zone-card">
          <span>{door.name} está trancada</span>
          <button
            type="button"
            disabled={knocking === door.key}
            onClick={() => {
              setResult(null);
              setKnocking(door.key);
              send({ t: 'zone.knock', zoneKey: door.key });
            }}
          >
            {knocking === door.key ? 'Aguardando…' : 'Bater na porta'}
          </button>
        </div>
      )}
      {result && !inside && <div className="zone-card">{result}</div>}
      {inside &&
        requests
          .filter((r) => r.zoneKey === here.key)
          .map((r) => (
            <div key={r.requestId} className="zone-card request">
              <span>{world.players.get(r.from)?.name ?? 'Alguém'} quer entrar</span>
              <button type="button" className="primary" onClick={() => reply(r, true)}>
                Deixar entrar
              </button>
              <button type="button" onClick={() => reply(r, false)}>
                Recusar
              </button>
            </div>
          ))}
    </div>
  );
}
