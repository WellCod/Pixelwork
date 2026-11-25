import type { ClientMsg, CompiledMap, Dir } from '@pixelwork/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SpaceDetail } from './api.ts';
import { EditorPanel } from './editor/EditorPanel.tsx';
import { EditorScene } from './editor/EditorScene.ts';
import type { EditorController } from './editor/editor-controller.ts';
import { createGame, mountGame } from './game/createGame.ts';
import type { WorldScene } from './game/WorldScene.ts';
import { collectWorldTargets } from './game/world-actions.ts';
import { MediaManager } from './media/media-manager.ts';
import { ProximityController } from './media/proximity-controller.ts';
import { CallStore } from './net/call-store.ts';
import { ClientWorld } from './net/client-world.ts';
import { Connection, type ConnectionStatus } from './net/connection.ts';
import { CallUi } from './ui/CallUi.tsx';
import { ChatBox } from './ui/ChatBox.tsx';
import { DeskBar } from './ui/DeskBar.tsx';
import { GameWindow } from './ui/GameWindow.tsx';
import { FurnitureSeatBar } from './ui/FurnitureSeatBar.tsx';
import { TableBar } from './ui/TableBar.tsx';
import { MediaControls } from './ui/MediaControls.tsx';
import { RoomPanel } from './ui/RoomPanel.tsx';
import { ReceptionBar, ReceptionRoute } from './ui/ReceptionBar.tsx';
import { Sidebar } from './ui/Sidebar.tsx';
import { VideoBubbles, hasVideoBubble } from './ui/VideoBubbles.tsx';
import { Welcome } from './ui/Welcome.tsx';
import { ZoneUi } from './ui/ZoneUi.tsx';
import { MapDestinations } from './ui/MapDestinations.tsx';
import { WorldActions } from './ui/WorldActions.tsx';
import { useDoorKnock } from './ui/useDoorKnock.ts';
import { NetOverlay } from './ui/NetOverlay.tsx';
import { ReplayModal } from './ui/ReplayModal.tsx';
import { NetSim } from './net/net-sim.ts';

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

/**
 * Tela do coworking: monta a conexão, a mídia e o canvas do Phaser, e põe a UI em React por cima
 * (cards do HUD, chat, vídeo, barra lateral). No modo de edição a cena e a lateral viram as do editor.
 */
export function GameView({ space, map, onStatus, onMapUpdated, editor, onEditorBaseVersion, onEditorClose }: Props) {
  const gameContainer = useRef<HTMLDivElement>(null);
  const connection = useRef<Connection | null>(null);
  // Callbacks do pai guardados em ref: o efeito da conexão chama sempre a versão mais recente
  // sem recriar a conexão a cada render do pai.
  const statusListener = useRef(onStatus);
  const mapListener = useRef(onMapUpdated);
  useEffect(() => {
    statusListener.current = onStatus;
    mapListener.current = onMapUpdated;
  });
  const [world] = useState(() => new ClientWorld(map));
  const [media] = useState(() => new MediaManager());
  const [proximityController] = useState(() => new ProximityController(world, media));
  // Cena do Phaser em ref: é recriada quando o mapa troca, e os botões leem sempre a atual.
  const worldScene = useRef<WorldScene | null>(null);
  const positionOf = useCallback((id: string) => worldScene.current?.screenPosition(id) ?? null, []);
  const project = useCallback((x: number, y: number) => worldScene.current?.project(x, y) ?? null, []);
  const followPath = useCallback((path: Dir[]) => worldScene.current?.followPath(path) ?? false, []);
  const [calls] = useState(() => new CallStore(world));
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [netSim] = useState(() => new NetSim());
  const [followedPlayerId, setFollowedPlayerId] = useState<string | null>(null);
  const [replayOpen, setReplayOpen] = useState(false);
  const netStats = useCallback(() => connection.current?.stats ?? null, []);

  // Estável entre renderizações (só lê o ref da conexão): o GameWindow recria os controles
  // quando o send muda, e isso soltava as teclas seguradas no meio da partida.
  const send = useCallback((message: ClientMsg) => connection.current?.send(message), []);

  const knock = useDoorKnock(world, send);

  // Conexão, mídia e chamadas vivem enquanto o coworking for o mesmo, mesmo se o mapa trocar.
  useEffect(() => {
    const spaceConnection = new Connection(
      space.id,
      // `media.join` vai para a mídia (o servidor decide a sala do LiveKit); o resto é estado do mundo.
      (message) => {
        if (message.t === 'media.join') void media.join(message.url, message.token, message.room);
        else world.handle(message);
      },
      (nextStatus) => {
        setConnectionStatus(nextStatus);
        statusListener.current(nextStatus);
        // Outra aba assumiu ou saiu do coworking: a mídia sai junto.
        if (nextStatus === 'replaced' || nextStatus === 'removed' || nextStatus === 'ended') void media.close();
      },
      () => netSim.delay(),
      (shortId) => world.idOf(shortId),
    );
    connection.current = spaceConnection;
    const stopMapUpdates = world.subscribe((event) => {
      if (event.type === 'mapUpdated') mapListener.current();
    });
    proximityController.start();
    const stopCalls = calls.start((message) => spaceConnection.send(message));
    // Só em desenvolvimento: estado de assinatura e posição para scripts de verificação.
    if (import.meta.env.DEV) {
      Object.assign(window, {
        __pixelwork: { media, world, controller: proximityController, connection: spaceConnection, netSim },
      });
    }
    spaceConnection.open();
    // Saindo do coworking (ou desmontando): para proximidade e chamadas, fecha a conexão e a mídia.
    return () => {
      proximityController.stop();
      stopCalls();
      stopMapUpdates();
      spaceConnection.close();
      void media.close();
    };
  }, [space.id, world, media, proximityController, calls, netSim]);

  // Editando, a cena é a do editor e ignora mapas que chegam de fora (o salvar dá 409).
  const editorController = editor?.controller ?? null;
  const worldMap = editorController ? null : map;
  const worldMapJson = editorController ? null : space.map as Record<string, unknown>;

  const targets = useMemo(() => worldMap && worldMapJson ? collectWorldTargets(worldMap, worldMapJson) : [], [worldMap, worldMapJson]);

  // A cena é refeita quando o mapa muda; o estado do mundo e a conexão continuam.
  useEffect(() => {
    const containerElement = gameContainer.current;
    if (!containerElement) return;
    // Modo de edição: monta só a cena do editor, sem ligar o mundo a ela.
    if (editorController || !worldMap || !worldMapJson) {
      if (!editorController) return;
      const editorGame = mountGame(containerElement, new EditorScene(editorController));
      if (import.meta.env.DEV) {
        Object.assign(window, { __pixelworkEditor: { scene: editorGame.scene, controller: editorController } });
      }
      return () => {
        editorGame.game.destroy(true);
      };
    }
    world.setMap(worldMap);
    const worldGame = createGame(containerElement, {
      world,
      mapJson: worldMapJson,
      targets,
      send: (message) => connection.current?.send(message),
      canMove: () => connection.current?.online ?? false,
      isSpeaking: (id) => media.speaking.has(id),
      showGhost: () => netSim.overlay,
      onFollowChange: setFollowedPlayerId,
      hasVideoBubble: (id) => hasVideoBubble(media, proximityController, id),
    });
    worldScene.current = worldGame.scene;
    return () => {
      worldScene.current = null;
      worldGame.game.destroy(true);
    };
  }, [editorController, worldMap, worldMapJson, world, media, proximityController, netSim, targets]);

  return (
      <div className="main">
        <div className="stage">
          <div ref={gameContainer} className="game" />
          {!editor && <VideoBubbles media={media} world={world} controller={proximityController} positionOf={positionOf} />}
          <RoomPanel media={media} world={world} />
          {!editor && connectionStatus === 'online' && <WorldActions world={world} targets={targets} project={project} followPath={followPath} send={send} knock={knock} />}
          <MediaControls media={media} onReconnect={() => connection.current?.reconnect()} />
          {/* Um painel só para os cards: zona, mesa e chamada se empilham em vez de se cobrirem. */}
          <div className="hud">
            <CallUi calls={calls} world={world} />
            {followedPlayerId && (
              <div className="hud-card">
                <span>Seguindo {world.players.get(followedPlayerId)?.name ?? 'alguém'}</span>
                <button type="button" onClick={() => worldScene.current?.stopFollowing()}>
                  Parar
                </button>
              </div>
            )}
            {/* No modo de edição os cards do jogo somem; ficam só a chamada e o "seguindo". */}
            {!editor && (
              <>
                <Welcome />
                <ReceptionBar world={world} send={send} />
                <ReceptionRoute world={world} />
                <ZoneUi world={world} send={send} knock={knock} />
                <DeskBar world={world} spaceId={space.id} isAdmin={space.role === 'admin'} />
                <TableBar world={world} send={send} />
                <FurnitureSeatBar world={world} send={send} />
              </>
            )}
          </div>
          {!editor && <ChatBox world={world} send={send} />}
          {!editor && <GameWindow world={world} send={send} />}
          {!editor && <NetOverlay sim={netSim} world={world} stats={netStats} />}
          {!editor && space.role === 'admin' && (
            <button type="button" className="replay-toggle" title="Replay da simulação" onClick={() => setReplayOpen(true)}>
              Replay
            </button>
          )}
          {replayOpen && (
            <ReplayModal
              spaceId={space.id}
              map={map}
              mapVersion={space.mapVersion}
              nameOf={(id) => world.players.get(id)?.name ?? 'Quem já saiu'}
              onClose={() => setReplayOpen(false)}
            />
          )}
          {!editor && (
            <div className="zoom-controls" aria-label="Navegação do mapa">
              <MapDestinations world={world} targets={targets} followPath={followPath} online={connectionStatus === 'online'} />
              <button type="button" title="Afastar (-)" aria-label="Afastar" onClick={() => worldScene.current?.zoom(-1)}>
                −
              </button>
              <button type="button" title="Aproximar (+)" aria-label="Aproximar" onClick={() => worldScene.current?.zoom(1)}>
                +
              </button>
            </div>
          )}
          {connectionStatus === 'replaced' && (
            <div className="stage-overlay" role="alert">
              <p>Este coworking foi aberto em outra aba.</p>
              <button type="button" className="primary" onClick={() => connection.current?.reconnect()}>
                Usar nesta aba
              </button>
            </div>
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
          <Sidebar world={world} media={media} spaceId={space.id} calls={calls} isAdmin={space.role === 'admin'} />
        )}
      </div>
  );
}
