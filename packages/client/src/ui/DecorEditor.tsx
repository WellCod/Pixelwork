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

const MONITORS = ['single', 'dual', 'laptop'] as const;
const DECOR = TILESETS['desk-decor'];
/** item_id do catálogo -> frame no tileset de decoração. */
const FRAMES = new Map(Object.entries(DECOR.items).map(([frame, item]) => [item, Number(frame)]));
const THUMB_SCALE = 3;

type SlotKey = keyof DeskDecor['slots'];
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
  const col = frame % DECOR.columns;
  const row = Math.floor(frame / DECOR.columns);
  return (
    <span
      className="thumb"
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${tilesetImageUrl('desk-decor')})`,
        backgroundPosition: `-${col * size}px -${row * size}px`,
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
  const sprites = deskSprites(desk, decor)
    .filter((s) => FRAMES.has(s.item))
    .sort((a, b) => a.z - b.z);
  const left = Math.min(...sprites.map((s) => s.dx)) - PAD;
  const top = Math.min(...sprites.map((s) => s.dy - TILE_PX)) - PAD;
  const right = Math.max(...sprites.map((s) => s.dx + TILE_PX)) + PAD;
  const bottom = Math.max(...sprites.map((s) => s.dy)) + PAD;
  return (
    <div
      className="desk-preview"
      aria-label="Prévia da mesa"
      style={{ width: (right - left) * PREVIEW_SCALE, height: (bottom - top) * PREVIEW_SCALE }}
    >
      {sprites.map((s, i) => (
        <Thumb
          key={`${s.item}-${s.dx}-${s.dy}`}
          item={s.item}
          scale={PREVIEW_SCALE}
          style={{
            position: 'absolute',
            left: (s.dx - left) * PREVIEW_SCALE,
            top: (s.dy - TILE_PX - top) * PREVIEW_SCALE,
            zIndex: i,
            transform: s.flip ? 'scaleX(-1)' : undefined,
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

export function DecorEditor({ spaceId, desk, initial, onClose }: Props) {
  const [decor, setDecor] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = () => {
    setSaving(true);
    profileApi
      .setDecor(spaceId, desk.key, decor)
      .then(onClose)
      .catch((e: unknown) => {
        setError(errorMessage(e));
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
        thumb={(v) => v}
        text={(v) => label(v, 'desk')}
        onChange={(variant) => setDecor({ ...decor, variant })}
      />
      <Picker
        legend="Tela"
        value={decor.monitor}
        options={MONITORS}
        thumb={(m) => `monitor-${m}`}
        text={(m) => label(m)}
        onChange={(monitor) => setDecor({ ...decor, monitor })}
      />
      {SLOTS.map((slot) => (
        <Picker<string | null>
          key={slot.key}
          legend={slot.label}
          value={decor.slots[slot.key]}
          options={[null, ...slot.options]}
          thumb={(o) => o}
          text={(o) => (o === null ? 'Nada' : label(o))}
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
