import { TILESETS, tilesetImageUrl, type TilesetId } from '@pixelwork/shared';

/**
 * Um frame de qualquer tileset recortado por CSS, sem suavizar. Célula de 16 px sai em 2x; as
 * maiores, em 1x, para caberem numa grade de miniaturas.
 */
export function TileThumb({ tileset, frame }: { tileset: TilesetId; frame: number }) {
  const meta = TILESETS[tileset];
  const scale = meta.tileWidth > 16 || meta.tileHeight > 16 ? 1 : 2;
  const w = meta.tileWidth * scale;
  const h = meta.tileHeight * scale;
  const col = frame % meta.columns;
  const row = Math.floor(frame / meta.columns);
  return (
    <span
      className="thumb"
      style={{
        width: w,
        height: h,
        backgroundImage: `url(${tilesetImageUrl(tileset)})`,
        backgroundPosition: `-${col * w}px -${row * h}px`,
        backgroundSize: `${meta.columns * w}px auto`,
      }}
    />
  );
}
