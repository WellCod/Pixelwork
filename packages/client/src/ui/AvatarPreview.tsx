import { characterImageUrl, type AvatarSpec, type CharacterLayer } from '@pixelwork/shared';
import { useEffect, useRef } from 'react';
import { FRAME_H, FRAME_W, composeAvatar, layersOf } from '../game/avatar-compose.ts';

/** Cache por URL das camadas já pedidas: várias prévias abertas compartilham o mesmo download. */
const layerImagesByUrl = new Map<string, Promise<HTMLImageElement>>();

/** Carrega a imagem de uma camada do personagem, reaproveitando o pedido em andamento ou já feito. */
function loadLayer(layer: CharacterLayer, id: string): Promise<HTMLImageElement> {
  const url = characterImageUrl(layer, id);
  let layerImage = layerImagesByUrl.get(url);
  if (!layerImage) {
    layerImage = new Promise((resolve, reject) => {
      const imageElement = new Image();
      imageElement.onload = () => resolve(imageElement);
      imageElement.onerror = () => reject(new Error(`falha ao carregar ${url}`));
      imageElement.src = url;
    });
    layerImagesByUrl.set(url, layerImage);
  }
  return layerImage;
}

/** Primeiro frame (parado, de frente) do avatar composto, em escala inteira. */
export function AvatarPreview({ spec, scale = 3 }: { spec: AvatarSpec; scale?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  // Carrega as camadas, compõe a folha e desenha só o primeiro frame. `cancelled` descarta o
  // desenho de um avatar antigo quando a escolha muda antes de as imagens chegarem.
  useEffect(() => {
    let cancelled = false;
    const layers = layersOf(spec);
    void Promise.all(layers.map(([layer, id]) => loadLayer(layer, id))).then((loadedImages) => {
      const targetCanvas = canvas.current;
      if (cancelled || !targetCanvas) return;
      const imageByLayerKey = new Map(layers.map(([layer, id], i) => [`${layer}:${id}`, loadedImages[i]]));
      const sheet = composeAvatar(spec, (layer, id) => {
        const layerImage = imageByLayerKey.get(`${layer}:${id}`);
        if (!layerImage) throw new Error(`camada ausente ${layer}:${id}`);
        return layerImage;
      });
      const context2d = targetCanvas.getContext('2d');
      if (!context2d) return;
      // Pixel art: ampliar sem suavização para os pixels continuarem nítidos.
      context2d.imageSmoothingEnabled = false;
      context2d.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
      context2d.drawImage(sheet, 0, 0, FRAME_W, FRAME_H, 0, 0, FRAME_W * scale, FRAME_H * scale);
    });
    return () => {
      cancelled = true;
    };
  }, [spec, scale]);

  return <canvas ref={canvas} width={FRAME_W * scale} height={FRAME_H * scale} className="avatar-preview" />;
}
