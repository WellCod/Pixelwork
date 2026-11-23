import { TILESETS, tilesetImageUrl, type TilesetId } from '@pixelwork/shared';

/**
 * Um frame de qualquer tileset recortado por CSS, sem suavizar. Célula de 16 px sai em 2x; as
 * maiores, em 1x, para caberem numa grade de miniaturas.
 */
export function TileThumb({ tileset, frame }: { tileset: TilesetId; frame: number }) {
  const tilesetInfo = TILESETS[tileset];
  const scale = tilesetInfo.tileWidth > 16 || tilesetInfo.tileHeight > 16 ? 1 : 2;
  const width = tilesetInfo.tileWidth * scale;
  const height = tilesetInfo.tileHeight * scale;
  // Posição do frame na grade do tileset, para deslocar o background até ele.
  const column = frame % tilesetInfo.columns;
  const row = Math.floor(frame / tilesetInfo.columns);
  return (
    <span
      className="thumb"
      style={{
        width,
        height,
        backgroundImage: `url(${tilesetImageUrl(tileset)})`,
        backgroundPosition: `-${column * width}px -${row * height}px`,
        backgroundSize: `${tilesetInfo.columns * width}px auto`,
      }}
    />
  );
}
