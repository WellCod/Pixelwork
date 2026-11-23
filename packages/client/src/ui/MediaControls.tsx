import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { MediaManager } from '../media/media-manager.ts';
import { CamIcon, MicIcon, ScreenIcon } from './icons.tsx';

/** Re-renderiza o componente a cada mudança do `MediaManager` (ele avisa pelo `version`). */
export function useMedia(media: MediaManager): MediaManager {
  useSyncExternalStore(
    (onChange) => media.subscribe(onChange),
    () => media.version,
  );
  return media;
}

/** Microfone, câmera e o aviso de que a câmera aparece para quem está perto. */
export function MediaControls({ media, onReconnect }: { media: MediaManager; onReconnect: () => void }) {
  useMedia(media);
  const preview = useRef<HTMLVideoElement>(null);
  const localVideoTrack = media.localVideo();

  // Liga a trilha da própria câmera ao <video> da prévia e solta ao trocar de trilha ou desmontar.
  useEffect(() => {
    const videoElement = preview.current;
    if (!videoElement || !localVideoTrack) return;
    localVideoTrack.attach(videoElement);
    return () => {
      localVideoTrack.detach(videoElement);
    };
  }, [localVideoTrack]);

  return (
    <div className="media-controls">
      <button
        type="button"
        className={media.micOn ? 'media-toggle on' : 'media-toggle off'}
        aria-pressed={media.micOn}
        title={media.micOn ? 'Desligar microfone' : 'Ligar microfone'}
        onClick={() => void media.setMic(!media.micOn)}
      >
        <MicIcon off={!media.micOn} />
        <span>{media.micOn ? 'Microfone' : 'Mudo'}</span>
      </button>
      <button
        type="button"
        className={media.camOn ? 'media-toggle on' : 'media-toggle off'}
        aria-pressed={media.camOn}
        title={media.camOn ? 'Desligar câmera' : 'Ligar câmera'}
        onClick={() => void media.setCamera(!media.camOn)}
      >
        <CamIcon off={!media.camOn} />
        <span>{media.camOn ? 'Câmera' : 'Sem câmera'}</span>
      </button>
      {/* Compartilhar tela só existe em sala privada (reunião ou chamada). */}
      {media.isPrivate && (
        <button
          type="button"
          className={media.screenOn ? 'media-toggle on' : 'media-toggle'}
          aria-pressed={media.screenOn}
          onClick={() => void media.setScreenShare(!media.screenOn)}
        >
          <ScreenIcon />
          <span>{media.screenOn ? 'Parar de compartilhar' : 'Compartilhar tela'}</span>
        </button>
      )}
      {media.camOn && (
        <div className="self-preview">
          <video ref={preview} muted playsInline />
          <span>Visível para quem está perto</span>
        </div>
      )}
      {media.audioBlocked && (
        <button type="button" className="primary" onClick={() => void media.enableAudio()}>
          Ativar áudio
        </button>
      )}
      {!media.connected && !media.lost && !media.error && <span className="muted">Áudio e vídeo conectando…</span>}
      {media.lost && (
        <span className="error">
          Áudio e vídeo desconectados.{' '}
          <button type="button" onClick={onReconnect}>
            Reconectar
          </button>
        </span>
      )}
      {media.error && (
        <span className="error">
          {media.error}{' '}
          <button type="button" aria-label="Dispensar aviso" onClick={() => media.dismissError()}>
            ×
          </button>
        </span>
      )}
    </div>
  );
}
