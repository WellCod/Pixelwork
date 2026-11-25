import { useEffect, useRef, useState } from 'react';
import { paintAquarium, TANK_HEIGHT, TANK_WIDTH } from '../game/aquarium-art.ts';
import { Modal } from './Modal.tsx';
import './aquarium.css';

export function AquariumModal({ onClose }: { onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const elapsed = useRef(0);
  const [pump, setPump] = useState(true);
  const [paused, setPaused] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d', { alpha: false });
    if (!ctx) return;
    paintAquarium(ctx, elapsed.current, pump);
    if (paused) return;

    let frame: number;
    let lastTime = performance.now();
    const animate = (now: number) => {
      const delta = now - lastTime;
      if (delta >= 1000 / 30) {
        elapsed.current += Math.min(delta, 100) / 1000;
        lastTime = now;
        paintAquarium(ctx, elapsed.current, pump);
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [paused, pump]);

  return (
    <Modal title="Aquário marinho" onClose={onClose} className="aquarium-modal">
      <div className="aquarium-glass">
        <canvas ref={canvas} width={TANK_WIDTH} height={TANK_HEIGHT} role="img"
          aria-label="Recife em pixel art com cardume, arraia, águas-vivas, cavalo-marinho, polvo, moluscos, estrelas-do-mar e corais" />
      </div>
      <div className="aquarium-controls">
        <button type="button" aria-label="Bomba d’água" aria-pressed={pump} onClick={() => setPump(!pump)}>
          Bomba d’água <span aria-hidden="true">{pump ? 'Ligada' : 'Desligada'}</span>
        </button>
        <button type="button" onClick={() => setPaused(!paused)}>{paused ? 'Retomar animação' : 'Pausar animação'}</button>
        <button type="button" onClick={onClose}>Fechar</button>
      </div>
    </Modal>
  );
}
