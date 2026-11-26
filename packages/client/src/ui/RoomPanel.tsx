import type { RemoteVideoTrack } from 'livekit-client';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { MediaManager } from '../media/media-manager.ts';
import type { ClientWorld } from '../net/client-world.ts';
import { useMedia } from './MediaControls.tsx';
import { FullscreenIcon, GripIcon, MinimizeIcon, PanelIcon } from './icons.tsx';
import { useWorld } from './useWorld.ts';

const MOVE_WINDOW: Record<string, [number, number]> = {
  ArrowLeft: [-24, 0],
  ArrowRight: [24, 0],
  ArrowUp: [0, -24],
  ArrowDown: [0, 24],
};

interface FloatingLayout {
  x: number;
  y: number;
  width: number;
}

const FLOATING_LAYOUT_KEY = 'pixelwork:floating-presentation-layout';
const DEFAULT_FLOATING_LAYOUT: FloatingLayout = { x: 80, y: 65, width: 380 };
const MAX_FLOATING_WIDTH = 680;

function readFloatingLayout(): FloatingLayout | undefined {
  try {
    const stored = localStorage.getItem(FLOATING_LAYOUT_KEY);
    if (stored === null) return;
    const value: unknown = JSON.parse(stored);
    if (!value || typeof value !== 'object') return;
    const { x, y, width } = value as Partial<Record<keyof FloatingLayout, unknown>>;
    if (
      typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 100 &&
      typeof y === 'number' && Number.isFinite(y) && y >= 0 && y <= 100 &&
      typeof width === 'number' && Number.isFinite(width) && width > 0 && width <= MAX_FLOATING_WIDTH
    ) return { x, y, width };
  } catch {
    // O modo flutuante também funciona quando o navegador bloqueia o armazenamento.
  }
}

function positionInMap(screen: HTMLElement, left: number, top: number) {
  const area = screen.offsetParent;
  if (!area) return;
  const bounds = area.getBoundingClientRect();
  // Frações do espaço disponível mantêm a janela no mapa ao redimensionar o navegador.
  const percent = (offset: number, space: number) => space > 0
    ? Math.max(0, Math.min(100, (offset / space) * 100))
    : 0;
  return {
    x: percent(left - bounds.left, area.clientWidth - screen.offsetWidth),
    y: percent(top - bounds.top, area.clientHeight - screen.offsetHeight),
  };
}

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
  const floatingToggle = useRef<HTMLButtonElement>(null);
  const restoreToggleFocus = useRef(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState(false);
  const [mode, setMode] = useState<'panel' | 'minimized' | 'floating'>('panel');
  const [layout, setLayout] = useState(DEFAULT_FLOATING_LAYOUT);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; resize: DOMRect | null } | null>(null);
  const resizeAnchor = useRef<DOMRect | null>(null);
  const minimized = mode === 'minimized';
  const floating = mode === 'floating' && !fullscreen;
  const { x, y, width } = layout;
  const title = name ? `Tela de ${name}` : 'Tela compartilhada';
  const fullscreenLabel = fullscreen ? 'Sair da tela cheia' : 'Tela cheia';
  const minimizeLabel = minimized ? 'Restaurar apresentação' : 'Minimizar';

  useEffect(() => {
    const syncFullscreen = () => setFullscreen(document.fullscreenElement === screenRef.current);
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  useLayoutEffect(() => {
    const anchor = resizeAnchor.current;
    const screen = screenRef.current;
    if (!anchor || !screen) return;
    resizeAnchor.current = null;
    // Mede a nova altura após a quebra de linha dos botões para manter o canto superior no lugar.
    const nextPosition = positionInMap(screen, anchor.left, anchor.top);
    if (nextPosition) setLayout((current) => ({ ...current, ...nextPosition }));
  }, [width]);

  useEffect(() => {
    if (!floating || dragging) return;
    try {
      localStorage.setItem(FLOATING_LAYOUT_KEY, JSON.stringify(layout));
    } catch {
      // A janela conserva os ajustes em memória se não puder salvá-los.
    }
  }, [dragging, floating, layout]);

  useLayoutEffect(() => {
    if (!restoreToggleFocus.current) return;
    restoreToggleFocus.current = false;
    floatingToggle.current?.focus({ preventScroll: true });
  }, [floating]);

  function toggleFloating() {
    if (!floating) setLayout(readFloatingLayout() ?? layout);
    restoreToggleFocus.current = true;
    setMode(floating ? 'panel' : 'floating');
  }

  function resetFloatingLayout() {
    resizeAnchor.current = null;
    setLayout(DEFAULT_FLOATING_LAYOUT);
  }

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
    if (!screen) return;
    const nextPosition = positionInMap(screen, left, top);
    if (nextPosition) setLayout((current) => ({ ...current, ...nextPosition }));
  }

  function resizeWindow(bounds: DOMRect, delta: number) {
    const area = screenRef.current?.offsetParent;
    if (!area) return;
    const maximum = Math.floor(Math.min(MAX_FLOATING_WIDTH, area.clientWidth * 0.85));
    const minimum = Math.min(240, maximum);
    const nextWidth = Math.max(minimum, Math.min(maximum, Math.round(bounds.width + delta)));
    if (nextWidth === width) return;
    resizeAnchor.current = bounds;
    setLayout((current) => ({ ...current, width: nextWidth }));
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>, resize = false) {
    const screen = screenRef.current;
    if (!screen || !event.isPrimary || event.button !== 0) return;
    const bounds = screen.getBoundingClientRect();
    drag.current = resize
      ? { x: event.clientX, y: event.clientY, resize: bounds }
      : { x: event.clientX - bounds.left, y: event.clientY - bounds.top, resize: null };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const gesture = drag.current;
    if (!gesture || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const horizontal = event.clientX - gesture.x;
    const vertical = event.clientY - gesture.y;
    if (gesture.resize) {
      const verticalAsWidth = vertical * 16 / 9;
      resizeWindow(gesture.resize, Math.abs(horizontal) >= Math.abs(verticalAsWidth) ? horizontal : verticalAsWidth);
    } else {
      moveWindow(horizontal, vertical);
    }
  }

  function endDrag() {
    drag.current = null;
    setDragging(false);
  }

  function moveWithKeys(event: KeyboardEvent<HTMLButtonElement>, resize = false) {
    const offset = MOVE_WINDOW[event.key];
    const screen = screenRef.current;
    if (!offset || !screen) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = screen.getBoundingClientRect();
    if (resize) resizeWindow(bounds, offset[0] + offset[1]);
    else moveWindow(bounds.left + offset[0], bounds.top + offset[1]);
  }

  return (
    <figure
      ref={screenRef}
      className="screen"
      data-minimized={minimized}
      data-floating={floating}
      style={floating ? {
        width,
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(-${x}%, -${y}%)`,
      } : undefined}
    >
      {floating && (
        <button
          type="button"
          className="screen-resize"
          aria-label="Redimensionar apresentação"
          title="Arraste o canto ou use as setas para redimensionar"
          onPointerDown={(event) => startDrag(event, true)}
          onPointerMove={moveDrag}
          onLostPointerCapture={endDrag}
          onKeyDown={(event) => moveWithKeys(event, true)}
        />
      )}
      <Video track={track} />
      <figcaption className="screen-controls">
        {floating ? (
          <>
            <button
              type="button"
              className="screen-drag"
              aria-label="Mover"
              title="Arraste ou use as setas para mover a apresentação"
              onPointerDown={startDrag}
              onPointerMove={moveDrag}
              onLostPointerCapture={endDrag}
              onKeyDown={moveWithKeys}
            >
              <GripIcon />
              <span className="screen-title">{title}</span>
            </button>
            <button ref={floatingToggle} type="button" className="screen-dock" onClick={toggleFloating}
              aria-label="Voltar ao painel" title="Voltar ao painel">
              <PanelIcon />
              <span>Voltar ao painel</span>
            </button>
          </>
        ) : (
          <span className="screen-title">{title}</span>
        )}
        <div className="screen-actions">
          {!minimized && !fullscreen && !floating && (
            <button ref={floatingToggle} type="button" onClick={toggleFloating}>Flutuante</button>
          )}
          {floating && (
            <button type="button" className="screen-reset" onClick={resetFloatingLayout}
              aria-label="Redefinir janela" title="Voltar à posição e ao tamanho padrão">
              <span>Redefinir janela</span>
            </button>
          )}
          {!minimized && (
            <button type="button" aria-label={fullscreenLabel} title={fullscreenLabel}
              onClick={() => void toggleFullscreen()}>
              {floating ? <FullscreenIcon /> : fullscreenLabel}
            </button>
          )}
          <button type="button" aria-label={minimizeLabel} title={minimizeLabel} aria-expanded={!minimized}
            onClick={() => void toggleMinimized()}>
            {floating ? <MinimizeIcon /> : minimizeLabel}
          </button>
        </div>
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
