import { useEffect, useRef } from 'react';
import type { WorldScene } from '../game/WorldScene.ts';
import type { MediaManager } from '../media/media-manager.ts';
import type { ProximityController } from '../media/proximity-controller.ts';
import type { ClientWorld } from '../net/client-world.ts';
import { useMedia } from './MediaControls.tsx';
import { useWorld } from './useWorld.ts';

interface Props {
  media: MediaManager;
  world: ClientWorld;
  controller: ProximityController;
  scene: WorldScene;
}

/**
 * Balões de vídeo em HTML sobre o canvas. A posição é atualizada a cada frame direto no
 * estilo, sem passar pelo React; o React só monta e desmonta os balões.
 */
export function VideoBubbles({ media, world, controller, scene }: Props) {
  useMedia(media);
  useWorld(world);
  const elements = useRef(new Map<string, HTMLDivElement>());
  // Em reunião e chamada a grade do RoomPanel substitui os balões.
  const ids = media.isPrivate ? [] : controller.bubbles.filter((id) => media.remoteVideo(id));

  useEffect(() => {
    let frame = 0;
    const loop = () => {
      for (const [id, element] of elements.current) {
        if (media.expandedId === id) continue;
        const pos = scene.screenPosition(id);
        if (pos) element.style.transform = `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px)`;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [media, scene]);

  return (
    <div className="bubbles">
      {ids.map((id) => (
        <Bubble
          key={id}
          id={id}
          media={media}
          name={world.players.get(id)?.name ?? ''}
          expanded={media.expandedId === id}
          register={(el) => {
            if (el) elements.current.set(id, el);
            else elements.current.delete(id);
          }}
        />
      ))}
    </div>
  );
}

interface BubbleProps {
  id: string;
  name: string;
  media: MediaManager;
  expanded: boolean;
  register: (el: HTMLDivElement | null) => void;
}

function Bubble({ id, name, media, expanded, register }: BubbleProps) {
  const video = useRef<HTMLVideoElement>(null);
  const track = media.remoteVideo(id);

  useEffect(() => {
    const element = video.current;
    if (!element || !track) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);

  return (
    <div
      ref={register}
      className={expanded ? 'bubble expanded' : 'bubble'}
      title={expanded ? 'Clique para reduzir' : 'Clique para ampliar'}
      onClick={() => media.setExpanded(expanded ? null : id)}
    >
      <video ref={video} muted playsInline autoPlay />
      <span>{name}</span>
    </div>
  );
}
