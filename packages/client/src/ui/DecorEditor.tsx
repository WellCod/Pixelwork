import {
  DECOR_ITEMS,
  DESK_VARIANTS,
  FLOOR_ITEMS,
  TILESETS,
  TILE_PX,
  WALL_ITEMS,
  tilesetImageUrl,
  type DeskDecor,
} from '@pixelwork/shared';
import { useState, type CSSProperties } from 'react';
import { SLOT_OFFSET_WIDE, dividerLayout } from '../game/presence.ts';
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
/** Margem em pixels do sprite ao redor da mesa na prévia (itens passam da borda da mesa). */
const PAD = { left: 4, top: 24 };

/**
 * Prévia da mesa larga como ela aparece no mapa (virada para baixo), montada com os mesmos
 * deslocamentos do jogo: assim a escolha de cada item já mostra o resultado.
 */
function DeskPreview({ decor, wallBehind }: { decor: DeskDecor; wallBehind: boolean }) {
  const offsets = SLOT_OFFSET_WIDE.down;
  const divider = decor.slots.back
    ? dividerLayout({ key: '', x: 0, y: 0, w: 2, h: 1, orientation: 'down', chairX: 0, chairY: 0, wallBehind })
    : null;
  const back = divider ? divider.back : offsets.back;
  const bottom = PAD.top + TILE_PX;
  const at = (item: string | null, x: number, y: number, z: number) =>
    item && FRAMES.has(item) ? (
      <Thumb
        key={`${item}-${x}-${y}`}
        item={item}
        scale={PREVIEW_SCALE}
        style={{ position: 'absolute', left: (PAD.left + x) * PREVIEW_SCALE, top: (bottom + y - TILE_PX) * PREVIEW_SCALE, zIndex: z }}
      />
    ) : null;
  return (
    <div
      className="desk-preview"
      aria-label="Prévia da mesa"
      style={{ width: (PAD.left + 48) * PREVIEW_SCALE, height: (bottom + 6) * PREVIEW_SCALE }}
    >
      {divider?.pieces.map((p) => at(p.item, p.dx, p.dy, 0))}
      {at(decor.slots.back, back[0], back[1], 1)}
      {at(`${decor.variant}-wide-l`, 0, 0, 2)}
      {at(`${decor.variant}-wide-r`, TILE_PX, 0, 2)}
      {at(`monitor-${decor.monitor}`, offsets.monitor[0], offsets.monitor[1], 3)}
      {at(decor.slots.left, offsets.left[0], offsets.left[1], 4)}
      {at(decor.slots.right, offsets.right[0], offsets.right[1], 4)}
      {at(decor.slots.floor, offsets.floor[0], offsets.floor[1], 4)}
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
  deskKey: string;
  /** Sem parede atrás, a prévia mostra a divisória onde o item de parede fica preso. */
  wallBehind: boolean;
  initial: DeskDecor;
  onClose: () => void;
}

export function DecorEditor({ spaceId, deskKey, wallBehind, initial, onClose }: Props) {
  const [decor, setDecor] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = () => {
    setSaving(true);
    profileApi
      .setDecor(spaceId, deskKey, decor)
      .then(onClose)
      .catch((e: unknown) => {
        setError(errorMessage(e));
        setSaving(false);
      });
  };

  return (
    <Modal title="Decorar a mesa" onClose={onClose}>
      <DeskPreview decor={decor} wallBehind={wallBehind} />
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
