import type { ClientMsg, CompiledMap } from '@pixelwork/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpaceDetail } from './api.ts';
import { EditorPanel } from './editor/EditorPanel.tsx';
import { EditorScene } from './editor/EditorScene.ts';
import type { EditorController } from './editor/editor-controller.ts';
import { createGame, mountGame } from './game/createGame.ts';
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
import { VideoBubbles, hasVideoBubble } from './ui/VideoBubbles.tsx';
import { ZoneUi } from './ui/ZoneUi.tsx';

interface Props {
  space: SpaceDetail;
  map: CompiledMap;
  onStatus: (status: ConnectionStatus) => void;
  /** `map.updated`: quem renderiza busca o mapa novo e passa de volta em `space` e `map`. */
  onMapUpdated: () => void;
  /** Modo de edição do mapa (só admin): troca a cena do jogo pela do editor. */
  editor: { controller: EditorController; baseVersion: number } | null;
  onEditorBaseVersion: (version: number) => void;
  onEditorClose: () => void;
}

export function GameView({ space, map, onStatus, onMapUpdated, editor, onEditorBaseVersion, onEditorClose }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const connection = useRef<Connection | null>(null);
  const statusListener = useRef(onStatus);
  const mapListener = useRef(onMapUpdated);
  useEffect(() => {
    statusListener.current = onStatus;
    mapListener.current = onMapUpdated;
  });
  const [world] = useState(() => new ClientWorld(map));
  const [media] = useState(() => new MediaManager());
  const [controller] = useState(() => new ProximityController(world, media));
  const scene = useRef<WorldScene | null>(null);
  const positionOf = useCallback((id: string) => scene.current?.screenPosition(id) ?? null, []);
  const [calls] = useState(() => new CallStore(world));

  const send = (msg: ClientMsg) => connection.current?.send(msg);

  // Conexão, mídia e chamadas vivem enquanto o coworking for o mesmo, mesmo se o mapa trocar.
  useEffect(() => {
    const conn = new Connection(
      space.id,
      (msg) => {
        if (msg.t === 'media.join') void media.join(msg.url, msg.token, msg.room);
        else world.handle(msg);
      },
      (next) => {
        statusListener.current(next);
        // Outra aba assumiu ou saiu do coworking: a mídia sai junto.
        if (next === 'replaced' || next === 'removed') void media.close();
      },
    );
    connection.current = conn;
    const stopMap = world.subscribe((event) => {
      if (event.type === 'mapUpdated') mapListener.current();
    });
    controller.start();
    const stopCalls = calls.start((msg) => conn.send(msg));
    // Só em desenvolvimento: estado de assinatura e posição para scripts de verificação.
    if (import.meta.env.DEV) Object.assign(window, { __pixelwork: { media, world, controller } });
    conn.open();
    return () => {
      controller.stop();
      stopCalls();
      stopMap();
      conn.close();
      void media.close();
    };
  }, [space.id, world, media, controller, calls]);

  // Editando, a cena é a do editor e ignora mapas que chegam de fora (o salvar dá 409).
  const editorController = editor?.controller ?? null;
  const worldMap = editorController ? null : map;
  const worldMapJson = editorController ? null : space.map;

  // A cena é refeita quando o mapa muda; o estado do mundo e a conexão continuam.
  useEffect(() => {
    const parent = container.current;
    if (!parent) return;
    if (editorController || !worldMap) {
      if (!editorController) return;
      const created = mountGame(parent, new EditorScene(editorController));
      if (import.meta.env.DEV) Object.assign(window, { __pixelworkEditor: { scene: created.scene, controller: editorController } });
      return () => {
        created.game.destroy(true);
      };
    }
    world.setMap(worldMap);
    const created = createGame(parent, {
      world,
      mapJson: worldMapJson as Record<string, unknown>,
      send: (msg) => connection.current?.send(msg),
      hasVideoBubble: (id) => hasVideoBubble(media, controller, id),
    });
    scene.current = created.scene;
    return () => {
      scene.current = null;
      created.game.destroy(true);
    };
  }, [editorController, worldMap, worldMapJson, world, media, controller]);

  return (
      <div className="main">
        <div className="stage">
          <div ref={container} className="game" />
          {!editor && <VideoBubbles media={media} world={world} controller={controller} positionOf={positionOf} />}
          <RoomPanel media={media} world={world} />
          <MediaControls media={media} />
          <CallUi calls={calls} world={world} />
          {!editor && (
            <>
              <ZoneUi world={world} send={send} />
              <DeskBar world={world} spaceId={space.id} isAdmin={space.role === 'admin'} />
              <ChatBox world={world} send={send} />
            </>
          )}
        </div>
        {editor ? (
          <EditorPanel
            controller={editor.controller}
            spaceId={space.id}
            baseVersion={editor.baseVersion}
            onBaseVersion={onEditorBaseVersion}
            onClose={onEditorClose}
          />
        ) : (
          <Sidebar world={world} spaceId={space.id} calls={calls} isAdmin={space.role === 'admin'} />
        )}
      </div>
  );
}
