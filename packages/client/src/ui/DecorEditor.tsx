import {
  DECOR_ITEMS,
  DESK_VARIANTS,
  FLOOR_ITEMS,
  TILESETS,
  TILE_PX,
  WALL_ITEMS,
  tilesetImageUrl,
  type CompiledDesk,
  type DeskDecor,
} from '@pixelwork/shared';
import { useState, type CSSProperties } from 'react';
import { deskSprites } from '../game/presence.ts';
import { profileApi } from '../api.ts';
import { label } from './labels.ts';
import { Modal } from './Modal.tsx';
import { errorMessage } from './useWorld.ts';

/** Tipos de tela; cada um tem o tile `monitor-<tipo>` no tileset de decoração. */
const MONITORS = ['single', 'dual', 'laptop'] as const;
const DECOR = TILESETS['desk-decor'];
/** item_id do catálogo -> frame no tileset de decoração. */
const FRAMES = new Map(Object.entries(DECOR.items).map(([frame, item]) => [item, Number(frame)]));
const THUMB_SCALE = 3;

type SlotKey = keyof DeskDecor['slots'];
/** Posições livres da mesa e quais itens cabem em cada uma. */
const SLOTS: { key: SlotKey; label: string; options: readonly string[] }[] = [
  { key: 'left', label: 'Na mesa, à esquerda', options: DECOR_ITEMS },
  { key: 'right', label: 'Na mesa, à direita', options: DECOR_ITEMS },
  { key: 'back', label: 'Na parede (ou na divisória)', options: WALL_ITEMS },
  { key: 'floor', label: 'No chão', options: FLOOR_ITEMS },
];

/** Um tile do tileset de decoração, recortado por CSS e ampliado sem suavizar. */
function Thumb({ item, scale = THUMB_SCALE, style }: { item: string | null; scale?: number; style?: CSSProperties }) {
  const frame = item === null ? undefined : FRAMES.get(item);
  const size = TILE_PX * scale;
  if (frame === undefined) return <span className="thumb thumb-empty" style={{ width: size, height: size, ...style }} />;
  // Posição do tile na grade do tileset, para deslocar o background até ele.
  const column = frame % DECOR.columns;
  const row = Math.floor(frame / DECOR.columns);
  return (
    <span
      className="thumb"
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${tilesetImageUrl('desk-decor')})`,
        backgroundPosition: `-${column * size}px -${row * size}px`,
        backgroundSize: `${DECOR.columns * size}px auto`,
        ...style,
      }}
    />
  );
}

const PREVIEW_SCALE = 4;
/** Margem em pixels do sprite em volta do que a mesa desenha. */
const PAD = 2;

/**
 * Prévia da mesa como ela aparece no mapa (orientação, tamanho e divisória), montada pelo mesmo
 * `deskSprites` do jogo: assim a escolha de cada item já mostra o resultado.
 */
function DeskPreview({ desk, decor }: { desk: CompiledDesk; decor: DeskDecor }) {
  // Só os itens que têm tile na decoração, do fundo para a frente (a ordem vira o zIndex).
  const sprites = deskSprites(desk, decor)
    .filter((sprite) => FRAMES.has(sprite.item))
    .sort((spriteA, spriteB) => spriteA.z - spriteB.z);
  // Caixa que envolve todos os sprites; `dy` é a base do tile, por isso o topo desconta TILE_PX.
  const left = Math.min(...sprites.map((sprite) => sprite.dx)) - PAD;
  const top = Math.min(...sprites.map((sprite) => sprite.dy - TILE_PX)) - PAD;
  const right = Math.max(...sprites.map((sprite) => sprite.dx + TILE_PX)) + PAD;
  const bottom = Math.max(...sprites.map((sprite) => sprite.dy)) + PAD;
  return (
    <div
      className="desk-preview"
      aria-label="Prévia da mesa"
      style={{ width: (right - left) * PREVIEW_SCALE, height: (bottom - top) * PREVIEW_SCALE }}
    >
      {sprites.map((sprite, i) => (
        <Thumb
          key={`${sprite.item}-${sprite.dx}-${sprite.dy}`}
          item={sprite.item}
          scale={PREVIEW_SCALE}
          style={{
            position: 'absolute',
            left: (sprite.dx - left) * PREVIEW_SCALE,
            top: (sprite.dy - TILE_PX - top) * PREVIEW_SCALE,
            zIndex: i,
            transform: sprite.flip ? 'scaleX(-1)' : undefined,
          }}
        />
      ))}
    </div>
  );
}

/** Grupo de botões com miniatura; um rádio acessível em vez de um select de IDs. */
function Picker<T extends string | null>({
  legend,
  value,
  options,
  thumb,
  text,
  onChange,
}: {
  legend: string;
  value: T;
  options: readonly T[];
  thumb: (option: T) => string | null;
  text: (option: T) => string;
  onChange: (option: T) => void;
}) {
  return (
    <fieldset className="picker">
      <legend>{legend}</legend>
      <div role="radiogroup" aria-label={legend}>
        {options.map((option) => (
          <button
            key={option ?? 'nada'}
            type="button"
            role="radio"
            aria-checked={option === value}
            className={option === value ? 'picker-option selected' : 'picker-option'}
            onClick={() => onChange(option)}
          >
            <Thumb item={thumb(option)} />
            <span>{text(option)}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

interface Props {
  spaceId: string;
  /** A mesa decorada: a prévia segue a orientação, o tamanho e a divisória dela. */
  desk: CompiledDesk;
  initial: DeskDecor;
  onClose: () => void;
}

/** Modal de decoração da própria mesa: variante, tela e um item por posição, com prévia. */
export function DecorEditor({ spaceId, desk, initial, onClose }: Props) {
  const [decor, setDecor] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = () => {
    setSaving(true);
    profileApi
      .setDecor(spaceId, desk.key, decor)
      .then(onClose)
      .catch((saveError: unknown) => {
        setError(errorMessage(saveError));
        setSaving(false);
      });
  };

  return (
    <Modal title="Decorar a mesa" onClose={onClose}>
      <DeskPreview desk={desk} decor={decor} />
      <Picker
        legend="Mesa"
        value={decor.variant}
        options={DESK_VARIANTS}
        thumb={(variant) => variant}
        text={(variant) => label(variant, 'desk')}
        onChange={(variant) => setDecor({ ...decor, variant })}
      />
      <Picker
        legend="Tela"
        value={decor.monitor}
        options={MONITORS}
        thumb={(monitor) => `monitor-${monitor}`}
        text={(monitor) => label(monitor)}
        onChange={(monitor) => setDecor({ ...decor, monitor })}
      />
      {/* `null` é a opção "Nada": a posição fica vazia. */}
      {SLOTS.map((slot) => (
        <Picker<string | null>
          key={slot.key}
          legend={slot.label}
          value={decor.slots[slot.key]}
          options={[null, ...slot.options]}
          thumb={(option) => option}
          text={(option) => (option === null ? 'Nada' : label(option))}
          onChange={(value) => setDecor({ ...decor, slots: { ...decor.slots, [slot.key]: value } })}
        />
      ))}
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="button" onClick={onClose}>
          Cancelar
        </button>
        <button type="button" className="primary" onClick={save} disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </Modal>
  );
}
