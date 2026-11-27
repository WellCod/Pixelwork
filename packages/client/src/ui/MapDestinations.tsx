import { OPEN_ZONE_KEY, zoneAt, type Dir, type ReceptionDestination } from '@pixelwork/shared';
import { useState } from 'react';
import { destinationSteps } from '../game/reception-path.ts';
import type { WorldTargets } from '../game/world-actions.ts';
import type { ClientWorld } from '../net/client-world.ts';
import { Modal } from './Modal.tsx';
import { useWorld } from './useWorld.ts';

const searchable = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').replaceAll('-', ' ').toLocaleLowerCase('pt-BR').trim();

export function MapDestinations({ world, targets, followPath, online, spaceId }: {
  world: ClientWorld; targets: WorldTargets; followPath: (path: Dir[]) => boolean; online: boolean; spaceId: string;
}) {
  useWorld(world);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const zones = world.map.zones.filter(({ key, name }) => key !== OPEN_ZONE_KEY && name.trim());
  const close = () => setOpen(false);

  const needle = searchable(query);
  const destinations: ReceptionDestination[] = zones.map(({ key, name }) => ({ kind: 'room', key, label: name }));
  if (needle) {
    destinations.push(...world.map.desks.map(({ key }) => ({
      kind: 'desk' as const, key, label: key.replaceAll('-', ' '),
    })));
    for (const player of world.players.values()) {
      if (player.id !== world.selfId && player.activity !== 'call' && player.activity !== 'meeting' && zoneAt(world.map, player.x, player.y).type === 'open') {
        destinations.push({ kind: 'person', id: player.id, label: player.name });
      }
    }
  }
  const results = destinations.filter(({ label }) => searchable(label).includes(needle));

  const go = (destination: ReceptionDestination) => {
    const route = destinationSteps(world, targets, destination);
    if (!route || (route.length && !followPath(route))) {
      setError(`Não foi possível traçar um caminho até ${destination.label}.`);
      return;
    }
    if (route.length) world.setDestination(destination);
    else world.clearReceptionDestination();
    setStatus(route.length ? `Destino: ${destination.label}.` : `Você já está no destino: ${destination.label}.`);
    close();
  };

  const copy = async (key: string) => {
    const url = new URL('/', location.origin);
    url.searchParams.set('coworking', spaceId);
    url.searchParams.set('sala', key);
    try {
      await navigator.clipboard.writeText(url.href);
      setStatus('Link da sala copiado.');
      setShareUrl('');
    } catch {
      setShareUrl(url.href);
    }
  };

  return (
    <div className="map-destinations">
      <button type="button" aria-haspopup="dialog" disabled={!online || Boolean(world.seat)} onClick={() => {
        setError('');
        setStatus('');
        setQuery('');
        setShareUrl('');
        setOpen(true);
      }}>Mapa</button>
      {!open && <span role="status" className="visually-hidden">{status}</span>}
      {open && (
        <Modal title="Destinos do mapa" onClose={close} className="map-destination-dialog">
          <label className="fields">
            Buscar sala, mesa ou pessoa
            <input type="search" value={query} onKeyDown={(event) => {
              if (event.key === 'Enter' && results.length === 1 && results[0]) go(results[0]);
            }} onChange={(event) => {
              setQuery(event.target.value);
              setError('');
              setShareUrl('');
            }} />
          </label>
          <ul>
            {results.slice(0, 25).map((destination) => {
              const id = destination.kind === 'person' ? destination.id : destination.key;
              const meeting = destination.kind === 'room' && zones.some((zone) => zone.key === id && zone.type === 'meeting');
              const locked = meeting && world.zones.get(id)?.locked;
              return (
                <li key={`${destination.kind}:${id}`}>
                  <button type="button" onClick={() => go(destination)}>
                    <span>{destination.label}</span>
                    {meeting && <small>{locked ? 'Trancada · Ir até a porta' : 'Ir até a porta'}</small>}
                    {destination.kind === 'person' && <small>Pessoa</small>}
                  </button>
                  {meeting && <button type="button" aria-label={`Copiar link de ${destination.label}`} onClick={() => void copy(id)}>Copiar link</button>}
                </li>
              );
            })}
          </ul>
          {!results.length && <p role="status">Nenhum destino encontrado.</p>}
          {results.length > 25 && <p role="status">Refine a busca para ver mais destinos.</p>}
          {error && <p className="error" role="alert">{error}</p>}
          {status && <p role="status">{status}</p>}
          {shareUrl && <label className="fields">Link da sala<input readOnly value={shareUrl} onFocus={(event) => event.target.select()} /></label>}
          <button type="button" onClick={close}>Fechar</button>
        </Modal>
      )}
    </div>
  );
}
