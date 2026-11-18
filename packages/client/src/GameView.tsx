import type { CompiledMap } from '@pixelwork/shared';
import { useEffect, useRef, useState } from 'react';
import type { Me, SpaceDetail } from './api.ts';
import { createGame } from './game/createGame.ts';
import { ClientWorld } from './net/client-world.ts';
import { Connection, type ConnectionStatus } from './net/connection.ts';

interface Props {
  me: Me;
  space: SpaceDetail;
  map: CompiledMap;
  onLogout: () => void;
}

const STATUS_TEXT: Record<ConnectionStatus, string> = {
  connecting: 'Conectando…',
  online: 'Online',
  reconnecting: 'Reconectando…',
  replaced: 'Você abriu este coworking em outra aba.',
};

export function GameView({ me, space, map, onLogout }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  useEffect(() => {
    const parent = container.current;
    if (!parent) return;
    const world = new ClientWorld(map);
    const connection = new Connection(space.id, (msg) => world.handle(msg), setStatus);
    const game = createGame(parent, {
      world,
      mapJson: space.map as Record<string, unknown>,
      send: (msg) => connection.send(msg),
    });
    connection.open();
    return () => {
      connection.close();
      game.destroy(true);
    };
  }, [space, map]);

  return (
    <div className="shell">
      <header className="bar">
        <strong>{space.name}</strong>
        <span className={`status status-${status}`}>{STATUS_TEXT[status]}</span>
        <span className="spacer" />
        <span>{me.name}</span>
        <button type="button" onClick={onLogout}>
          Sair
        </button>
      </header>
      <div ref={container} className="game" />
    </div>
  );
}
