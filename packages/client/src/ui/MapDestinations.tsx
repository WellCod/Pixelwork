import { OPEN_ZONE_KEY, type Dir } from '@pixelwork/shared';
import { useState } from 'react';
import { destinationRoute, type WorldTargets } from '../game/world-actions.ts';
import type { ClientWorld } from '../net/client-world.ts';
import { Modal } from './Modal.tsx';
import { useWorld } from './useWorld.ts';

export function MapDestinations({ world, targets, followPath, online }: {
  world: ClientWorld; targets: WorldTargets; followPath: (path: Dir[]) => boolean; online: boolean;
}) {
  useWorld(world);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const zones = world.map.zones.filter(({ key, name }) => key !== OPEN_ZONE_KEY && name.trim());
  if (!zones.length) return null;
  const close = () => setOpen(false);
  return (
    <div className="map-destinations">
      <button type="button" aria-haspopup="dialog" disabled={!online || Boolean(world.seat)} onClick={() => {
        setError('');
        setStatus('');
        setOpen(true);
      }}>Mapa</button>
      <span role="status" className="visually-hidden">{status}</span>
      {open && (
        <Modal title="Destinos do mapa" onClose={close} className="map-destination-dialog">
          <ul>
            {zones.map(({ key, name }) => (
              <li key={key}>
                <button type="button" onClick={() => {
                  const route = destinationRoute(world, targets, key);
                  if (!route || !followPath(route.path)) {
                    setError(`Não foi possível traçar um caminho até ${name}.`);
                    return;
                  }
                  setStatus(route.atDoor ? `Sala trancada. Destino: porta de ${name}.` : route.path.length ? `Destino: ${name}.` : `Você já está em ${name}.`);
                  close();
                }}>
                  <span>{name}</span>
                  {world.zones.get(key)?.locked && <small>Trancada</small>}
                </button>
              </li>
            ))}
          </ul>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="button" onClick={close}>Fechar</button>
        </Modal>
      )}
    </div>
  );
}
