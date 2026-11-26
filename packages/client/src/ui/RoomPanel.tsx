import type { RemoteVideoTrack } from 'livekit-client';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { MediaManager } from '../media/media-manager.ts';
import type { ClientWorld } from '../net/client-world.ts';
import { useMedia } from './MediaControls.tsx';
import { useWorld } from './useWorld.ts';

const MOVE_WINDOW: Record<string, [number, number]> = {
  ArrowLeft: [-24, 0],
  ArrowRight: [24, 0],
  ArrowUp: [0, -24],
  ArrowDown: [0, 24],
};

/** Reunião e chamada: grade com as câmeras de todos e a tela compartilhada em destaque. */
export function RoomPanel({ media, world }: { media: MediaManager; world: ClientWorld }) {
  useMedia(media);
  useWorld(world);
  if (!media.isPrivate) return null;
  const screens = media.remoteScreens();
  const cameras = media.remoteCameras();
  const playerName = (id: string) => world.players.get(id)?.name ?? '';

  return (
    <div className="room-panel">
      {screens.map(({ identity, track }) => (
        <SharedScreen key={`screen:${identity}`} track={track} name={playerName(identity)} />
      ))}
      <div className="room-grid">
        {cameras.map((id) => {
          const track = media.remoteVideo(id);
          return track ? (
            <figure key={id}>
              <Video track={track} />
              <figcaption>{playerName(id)}</figcaption>
            </figure>
          ) : null;
        })}
      </div>
    </div>
  );
}

function SharedScreen({ track, name }: { track: RemoteVideoTrack; name: string }) {
  const screenRef = useRef<HTMLElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState(false);
  const [mode, setMode] = useState<'panel' | 'minimized' | 'floating'>('panel');
  const [position, setPosition] = useState({ x: 100, y: 75 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const minimized = mode === 'minimized';
  const floating = mode === 'floating' && !fullscreen;

  useEffect(() => {
    const syncFullscreen = () => setFullscreen(document.fullscreenElement === screenRef.current);
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  async function toggleFullscreen() {
    const screen = screenRef.current;
    if (!screen) return;
    setFullscreenError(false);
    try {
      if (document.fullscreenElement === screen) await document.exitFullscreen();
      else await screen.requestFullscreen();
    } catch {
      setFullscreenError(true);
    }
  }

  async function toggleMinimized() {
    setFullscreenError(false);
    const screen = screenRef.current;
    if (screen && document.fullscreenElement === screen) {
      try {
        await document.exitFullscreen();
      } catch {
        setFullscreenError(true);
        return;
      }
    }
    setMode(minimized ? 'panel' : 'minimized');
  }

  function moveWindow(left: number, top: number) {
    const screen = screenRef.current;
    const area = screen?.offsetParent;
    if (!screen || !area) return;
    const bounds = area.getBoundingClientRect();
    // Frações do espaço disponível mantêm a janela no mapa ao redimensionar.
    const percent = (offset: number, space: number) => space > 0
      ? Math.max(0, Math.min(100, (offset / space) * 100))
      : 0;
    setPosition({
      x: percent(left - bounds.left, area.clientWidth - screen.offsetWidth),
      y: percent(top - bounds.top, area.clientHeight - screen.offsetHeight),
    });
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    const screen = screenRef.current;
    if (!screen || !event.isPrimary || event.button !== 0) return;
    const bounds = screen.getBoundingClientRect();
    drag.current = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!drag.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    moveWindow(event.clientX - drag.current.x, event.clientY - drag.current.y);
  }

  function moveWithKeys(event: KeyboardEvent<HTMLButtonElement>) {
    const offset = MOVE_WINDOW[event.key];
    const screen = screenRef.current;
    if (!offset || !screen) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = screen.getBoundingClientRect();
    moveWindow(bounds.left + offset[0], bounds.top + offset[1]);
  }

  return (
    <figure
      ref={screenRef}
      className="screen"
      data-minimized={minimized}
      data-floating={floating}
      style={floating ? {
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: `translate(-${position.x}%, -${position.y}%)`,
      } : undefined}
    >
      <Video track={track} />
      <figcaption className="screen-controls">
        <span>{name ? `Tela de ${name}` : 'Tela compartilhada'}</span>
        {floating && (
          <button
            type="button"
            className="screen-drag"
            title="Arraste ou use as setas para mover a apresentação"
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onLostPointerCapture={() => { drag.current = null; }}
            onKeyDown={moveWithKeys}
          >
            Mover
          </button>
        )}
        {!minimized && !fullscreen && (
          <button type="button" onClick={() => setMode(floating ? 'panel' : 'floating')}>
            {floating ? 'Voltar ao painel' : 'Flutuante'}
          </button>
        )}
        {!minimized && (
          <button type="button" onClick={() => void toggleFullscreen()}>
            {fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
          </button>
        )}
        <button type="button" aria-expanded={!minimized} onClick={() => void toggleMinimized()}>
          {minimized ? 'Restaurar apresentação' : 'Minimizar'}
        </button>
        {fullscreenError && <span role="status">Tela cheia indisponível no navegador.</span>}
      </figcaption>
    </figure>
  );
}

/** Um `<video>` ligado a uma trilha remota do LiveKit; solta a trilha ao trocar ou desmontar. */
function Video({ track }: { track: RemoteVideoTrack }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;
    track.attach(videoElement);
    return () => {
      track.detach(videoElement);
    };
  }, [track]);
  return <video ref={videoRef} muted playsInline autoPlay />;
}
