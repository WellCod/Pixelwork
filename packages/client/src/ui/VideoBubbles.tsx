import { useEffect, useRef } from 'react';
import type { MediaManager } from '../media/media-manager.ts';
import type { ProximityController } from '../media/proximity-controller.ts';
import type { ClientWorld } from '../net/client-world.ts';
import { useMedia } from './MediaControls.tsx';
import { useWorld } from './useWorld.ts';

interface Props {
  media: MediaManager;
  world: ClientWorld;
  controller: ProximityController;
  /**
   * Posição em tela do avatar. Função em vez da cena do Phaser: o React em desenvolvimento
   * compara props a fundo e quebraria lendo getters de uma cena já destruída.
   */
  positionOf: (id: string) => { x: number; y: number } | null;
}

/** Quem aparece num balão de vídeo; a cena usa para subir o balão de chat acima do vídeo. */
export function hasVideoBubble(media: MediaManager, controller: ProximityController, id: string): boolean {
  // Em reunião e chamada a grade do RoomPanel substitui os balões.
  return !media.isPrivate && media.expandedId !== id && controller.bubbles.includes(id) && media.remoteVideo(id) !== undefined;
}

/**
 * Balões de vídeo em HTML sobre o canvas. A posição é atualizada a cada frame direto no
 * estilo, sem passar pelo React; o React só monta e desmonta os balões.
 */
export function VideoBubbles({ media, world, controller, positionOf }: Props) {
  useMedia(media);
  useWorld(world);
  // Elementos dos balões montados, por id do jogador, preenchidos pelo ref de cada `Bubble`.
  const bubbleElements = useRef(new Map<string, HTMLDivElement>());
  const bubbleIds = media.isPrivate ? [] : controller.bubbles.filter((id) => media.remoteVideo(id));

  // Laço por quadro que segue o avatar; o balão ampliado fica parado onde o CSS o põe.
  useEffect(() => {
    let animationFrameId = 0;
    const loop = () => {
      for (const [id, bubbleElement] of bubbleElements.current) {
        if (media.expandedId === id) continue;
        const screenPosition = positionOf(id);
        if (screenPosition) {
          bubbleElement.style.transform = `translate(${Math.round(screenPosition.x)}px, ${Math.round(screenPosition.y)}px)`;
        }
      }
      animationFrameId = requestAnimationFrame(loop);
    };
    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [media, positionOf]);

  return (
    <div className="bubbles">
      {bubbleIds.map((id) => (
        <Bubble
          key={id}
          id={id}
          media={media}
          name={world.players.get(id)?.name ?? ''}
          expanded={media.expandedId === id}
          register={(bubbleElement) => {
            if (bubbleElement) bubbleElements.current.set(id, bubbleElement);
            else bubbleElements.current.delete(id);
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
  register: (bubbleElement: HTMLDivElement | null) => void;
}

/** Um balão de vídeo; clique, Enter ou espaço ampliam e reduzem, Esc reduz. */
function Bubble({ id, name, media, expanded, register }: BubbleProps) {
  const video = useRef<HTMLVideoElement>(null);
  const track = media.remoteVideo(id);

  // Liga a trilha remota ao <video> e solta ao trocar de trilha ou desmontar.
  useEffect(() => {
    const videoElement = video.current;
    if (!videoElement || !track) return;
    track.attach(videoElement);
    return () => {
      track.detach(videoElement);
    };
  }, [track]);

  return (
    <div
      ref={register}
      className={expanded ? 'bubble expanded' : 'bubble'}
      role="button"
      tabIndex={0}
      aria-pressed={expanded}
      aria-label={`Vídeo de ${name}. ${expanded ? 'Reduzir' : 'Ampliar'}`}
      title={expanded ? 'Clique para reduzir' : 'Clique para ampliar'}
      onClick={() => media.setExpanded(expanded ? null : id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          media.setExpanded(expanded ? null : id);
        }
        if (event.key === 'Escape' && expanded) media.setExpanded(null);
      }}
    >
      <video ref={video} muted playsInline autoPlay />
      <span>{name}</span>
    </div>
  );
}
