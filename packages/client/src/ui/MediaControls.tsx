import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { MediaManager } from '../media/media-manager.ts';

export function useMedia(media: MediaManager): MediaManager {
  useSyncExternalStore(
    (onChange) => media.subscribe(onChange),
    () => media.version,
  );
  return media;
}

/** Microfone, câmera e o aviso de que a câmera aparece para quem está perto. */
export function MediaControls({ media }: { media: MediaManager }) {
  useMedia(media);
  const preview = useRef<HTMLVideoElement>(null);
  const local = media.localVideo();

  useEffect(() => {
    const element = preview.current;
    if (!element || !local) return;
    local.attach(element);
    return () => {
      local.detach(element);
    };
  }, [local]);

  return (
    <div className="media-controls">
      <button
        type="button"
        className={media.micOn ? 'on' : 'off'}
        aria-pressed={media.micOn}
        onClick={() => void media.setMic(!media.micOn)}
      >
        {media.micOn ? 'Microfone ligado' : 'Microfone desligado'}
      </button>
      <button
        type="button"
        className={media.camOn ? 'on' : 'off'}
        aria-pressed={media.camOn}
        onClick={() => void media.setCamera(!media.camOn)}
      >
        {media.camOn ? 'Câmera ligada' : 'Câmera desligada'}
      </button>
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
      {!media.connected && <span className="muted">Áudio e vídeo conectando…</span>}
      {media.error && <span className="error">Mídia: {media.error}</span>}
    </div>
  );
}
