import type { RemoteVideoTrack } from 'livekit-client';
import { useEffect, useRef, useState } from 'react';
import type { MediaManager } from '../media/media-manager.ts';
import type { ClientWorld } from '../net/client-world.ts';
import { useMedia } from './MediaControls.tsx';
import { useWorld } from './useWorld.ts';

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

  return (
    <figure ref={screenRef} className="screen">
      <Video track={track} />
      <figcaption className="screen-controls">
        <span>{name ? `Tela de ${name}` : 'Tela compartilhada'}</span>
        <button type="button" onClick={() => void toggleFullscreen()}>
          {fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
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
