import type { ClientMsg, CompiledMap } from '@pixelwork/shared';
import { useEffect, useRef, useState } from 'react';
import type { Me, SpaceDetail } from './api.ts';
import { createGame } from './game/createGame.ts';
import type { WorldScene } from './game/WorldScene.ts';
import { MediaManager } from './media/media-manager.ts';
import { ProximityController } from './media/proximity-controller.ts';
import { CallStore } from './net/call-store.ts';
import { ClientWorld } from './net/client-world.ts';
import { Connection, type ConnectionStatus } from './net/connection.ts';
import { CallUi } from './ui/CallUi.tsx';
import { ChatBox } from './ui/ChatBox.tsx';
import { DeskBar } from './ui/DeskBar.tsx';
import { MediaControls } from './ui/MediaControls.tsx';
import { RoomPanel } from './ui/RoomPanel.tsx';
import { Sidebar } from './ui/Sidebar.tsx';
import { VideoBubbles } from './ui/VideoBubbles.tsx';
import { ZoneUi } from './ui/ZoneUi.tsx';

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
  const connection = useRef<Connection | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [world] = useState(() => new ClientWorld(map));
  const [media] = useState(() => new MediaManager());
  const [controller] = useState(() => new ProximityController(world, media));
  const [scene, setScene] = useState<WorldScene | null>(null);
  const [calls] = useState(() => new CallStore(world));

  const send = (msg: ClientMsg) => connection.current?.send(msg);

  useEffect(() => {
    const parent = container.current;
    if (!parent) return;
    const conn = new Connection(
      space.id,
      (msg) => {
        if (msg.t === 'media.join') void media.join(msg.url, msg.token, msg.room);
        else world.handle(msg);
      },
      (next) => {
        setStatus(next);
        // Outra aba assumiu: a mídia desta também sai, senão as duas disputam a mesma identidade.
        if (next === 'replaced') void media.close();
      },
    );
    connection.current = conn;
    const created = createGame(parent, {
      world,
      mapJson: space.map as Record<string, unknown>,
      send: (msg) => conn.send(msg),
    });
    setScene(created.scene);
    controller.start();
    const stopCalls = calls.start((msg) => conn.send(msg));
    // Só em desenvolvimento: estado de assinatura e posição para scripts de verificação.
    if (import.meta.env.DEV) Object.assign(window, { __pixelwork: { media, world, controller } });
    conn.open();
    return () => {
      controller.stop();
      stopCalls();
      conn.close();
      void media.close();
      created.game.destroy(true);
      setScene(null);
    };
  }, [space, world, media, controller, calls]);

  return (
    <div className="shell">
      <header className="bar">
        <strong>{space.name}</strong>
        <span className={`status status-${status}`}>{STATUS_TEXT[status]}</span>
        <span className="spacer" />
        <span>{me.isGuest ? 'Convidado' : me.name}</span>
        <button type="button" onClick={onLogout}>
          Sair
        </button>
      </header>
      <div className="main">
        <div className="stage">
          <div ref={container} className="game" />
          {scene && <VideoBubbles media={media} world={world} controller={controller} scene={scene} />}
          <RoomPanel media={media} world={world} />
          <MediaControls media={media} />
          <ZoneUi world={world} send={send} />
          <CallUi calls={calls} world={world} />
          <DeskBar world={world} spaceId={space.id} isAdmin={space.role === 'admin'} />
          <ChatBox world={world} send={send} />
        </div>
        <Sidebar world={world} spaceId={space.id} calls={calls} />
      </div>
    </div>
  );
}
