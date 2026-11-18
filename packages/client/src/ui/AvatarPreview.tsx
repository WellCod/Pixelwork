import { characterImageUrl, type AvatarSpec, type CharacterLayer } from '@pixelwork/shared';
import { useEffect, useRef } from 'react';
import { FRAME_H, FRAME_W, composeAvatar, layersOf } from '../game/avatar-compose.ts';

const images = new Map<string, Promise<HTMLImageElement>>();

function loadLayer(layer: CharacterLayer, id: string): Promise<HTMLImageElement> {
  const url = characterImageUrl(layer, id);
  let image = images.get(url);
  if (!image) {
    image = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`falha ao carregar ${url}`));
      img.src = url;
    });
    images.set(url, image);
  }
  return image;
}

/** Primeiro frame (parado, de frente) do avatar composto, em escala inteira. */
export function AvatarPreview({ spec, scale = 3 }: { spec: AvatarSpec; scale?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    const layers = layersOf(spec);
    void Promise.all(layers.map(([layer, id]) => loadLayer(layer, id))).then((loaded) => {
      const target = canvas.current;
      if (cancelled || !target) return;
      const byKey = new Map(layers.map(([layer, id], i) => [`${layer}:${id}`, loaded[i]]));
      const sheet = composeAvatar(spec, (layer, id) => {
        const img = byKey.get(`${layer}:${id}`);
        if (!img) throw new Error(`camada ausente ${layer}:${id}`);
        return img;
      });
      const ctx = target.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, target.width, target.height);
      ctx.drawImage(sheet, 0, 0, FRAME_W, FRAME_H, 0, 0, FRAME_W * scale, FRAME_H * scale);
    });
    return () => {
      cancelled = true;
    };
  }, [spec, scale]);

  return <canvas ref={canvas} width={FRAME_W * scale} height={FRAME_H * scale} className="avatar-preview" />;
}
