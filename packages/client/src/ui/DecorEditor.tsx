import {
  CONTACT_SHADOW_COLOR,
  DECOR_ITEMS,
  deskContactShadows,
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
import { deskDecorFrame, deskSprites } from '../game/presence.ts';
import { profileApi } from '../api.ts';
import { label } from './labels.ts';
import { CustomizationEditor, CustomizationNav, CustomizationPicker } from './CustomizationEditor.tsx';
import { errorMessage } from './useWorld.ts';

/** Tipos de tela; cada um tem o tile `monitor-<tipo>` no tileset de decoração. */
const MONITORS = ['single', 'dual', 'laptop'] as const;
const THUMB_SCALE = 2;

type SlotKey = keyof DeskDecor['slots'];
const SLOTS = [
  { key: 'left', label: 'Esquerda', legend: 'Lado esquerdo da mesa', options: DECOR_ITEMS },
  { key: 'right', label: 'Direita', legend: 'Lado direito da mesa', options: DECOR_ITEMS },
  { key: 'back', label: 'Parede', legend: 'Parede ou divisória', options: WALL_ITEMS },
  { key: 'floor', label: 'Chão', legend: 'Chão ao lado da mesa', options: FLOOR_ITEMS },
] as const;

const SECTIONS = [
  { key: 'variant', label: 'Mesa' },
  { key: 'monitor', label: 'Tela' },
  ...SLOTS,
] as const;

/** Um tile do tileset de decoração, recortado por CSS e ampliado sem suavizar. */
function Thumb({ item, scale = THUMB_SCALE, style }: { item: string | null; scale?: number; style?: CSSProperties }) {
  const sprite = item === null ? undefined : deskDecorFrame(item);
  const size = TILE_PX * scale;
  if (sprite === undefined) return <span className="thumb thumb-empty" style={{ width: size, height: size, ...style }} />;
  // Posição do tile na grade do tileset, para deslocar o background até ele.
  const { columns } = TILESETS[sprite.tileset];
  const column = sprite.frame % columns;
  const row = Math.floor(sprite.frame / columns);
  return (
    <span
      className="thumb"
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${tilesetImageUrl(sprite.tileset)})`,
        backgroundPosition: `-${column * size}px -${row * size}px`,
        backgroundSize: `${columns * size}px auto`,
        ...style,
      }}
    />
  );
}

const PREVIEW_SCALE = 3;
/** Margem em pixels do sprite em volta do que a mesa desenha. */
const PAD = 2;

/**
 * Prévia da mesa como ela aparece no mapa (orientação, tamanho e divisória), montada pelo mesmo
 * `deskSprites` do jogo: assim a escolha de cada item já mostra o resultado.
 */
function DeskPreview({ desk, decor }: { desk: CompiledDesk; decor: DeskDecor }) {
  // Só os itens que têm tile na decoração, do fundo para a frente (a ordem vira o zIndex).
  const sprites = deskSprites(desk, decor)
    .sort((spriteA, spriteB) => spriteA.z - spriteB.z);
  // Caixa que envolve todos os sprites; `dy` é a base do tile, por isso o topo desconta TILE_PX.
  // Reserve espaço para todas as posições, mesmo vazias, para a mesa não se deslocar ao editar.
  const bounds = deskSprites(desk, {
    ...decor,
    slots: { left: DECOR_ITEMS[0], right: DECOR_ITEMS[0], back: WALL_ITEMS[0], floor: FLOOR_ITEMS[0] },
  });
  const left = Math.min(...bounds.map((sprite) => sprite.dx)) - PAD;
  const top = Math.min(...bounds.map((sprite) => sprite.dy - TILE_PX)) - PAD;
  const right = Math.max(...bounds.map((sprite) => sprite.dx + TILE_PX)) + PAD;
  const bottom = Math.max(...bounds.map((sprite) => sprite.dy)) + PAD;
  return (
    <div
      className="desk-preview"
      role="img"
      aria-label="Prévia da mesa"
      style={{ width: (right - left) * PREVIEW_SCALE, height: (bottom - top) * PREVIEW_SCALE }}
    >
      {deskContactShadows(desk.width * TILE_PX, desk.height * TILE_PX).map((shadow) => (
        <span
          key={[shadow.centerX, shadow.centerY].join(':')}
          style={{
            position: 'absolute',
            left: (shadow.centerX - shadow.width / 2 - left) * PREVIEW_SCALE,
            top: (shadow.centerY - shadow.height / 2 - top) * PREVIEW_SCALE,
            width: shadow.width * PREVIEW_SCALE,
            height: shadow.height * PREVIEW_SCALE,
            borderRadius: '50%',
            backgroundColor: '#' + CONTACT_SHADOW_COLOR.toString(16),
            opacity: shadow.alpha,
          }}
        />
      ))}
      {sprites.map((sprite, i) => (
        <Thumb
          key={`${sprite.item}-${sprite.dx}-${sprite.dy}`}
          item={sprite.item}
          scale={PREVIEW_SCALE}
          style={{
            position: 'absolute',
            left: (sprite.dx - left) * PREVIEW_SCALE,
            top: (sprite.dy - TILE_PX - top) * PREVIEW_SCALE,
            zIndex: i + 1,
            transform: 'scale(' + [sprite.flip ? -1 : 1, sprite.flipY ? -1 : 1].join(',') + ')',
          }}
        />
      ))}
    </div>
  );
}

interface Props {
  spaceId: string;
  /** A mesa decorada: a prévia segue a orientação, o tamanho e a divisória dela. */
  desk: CompiledDesk;
  initial: DeskDecor;
  onClose: () => void;
}

/** Personalização da própria mesa, organizada pelas posições que podem ser alteradas. */
export function DecorEditor({ spaceId, desk, initial, onClose }: Props) {
  const [decor, setDecor] = useState(initial);
  const [section, setSection] = useState<(typeof SECTIONS)[number]['key']>('variant');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const activeSlot = SLOTS.find((slot) => slot.key === section);

  const updateSlot = <Key extends SlotKey>(key: Key, value: DeskDecor['slots'][Key]) => {
    setDecor({ ...decor, slots: { ...decor.slots, [key]: value } });
  };

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      await profileApi.setDecor(spaceId, desk.key, decor);
      onClose();
    } catch (saveError) {
      setError(errorMessage(saveError));
      setSaving(false);
    }
  };

  return (
    <CustomizationEditor
      title="Decorar a mesa"
      preview={<div className="customization-stage desk-stage"><DeskPreview desk={desk} decor={decor} /></div>}
      error={error}
      saving={saving}
      onClose={onClose}
      onSave={() => { void save(); }}
    >
      <CustomizationNav label="Categorias da mesa" options={SECTIONS} current={section} onChange={setSection} />
      <div className="customization-section" key={section}>
        {section === 'variant' && (
          <CustomizationPicker
            legend="Acabamento da mesa"
            value={decor.variant}
            options={DESK_VARIANTS}
            text={(variant) => label(variant, 'desk')}
            preview={(variant) => <Thumb item={variant} />}
            onChange={(variant) => setDecor({ ...decor, variant })}
          />
        )}
        {section === 'monitor' && (
          <CustomizationPicker
            legend="Tipo de tela"
            value={decor.monitor}
            options={MONITORS}
            text={(monitor) => label(monitor)}
            preview={(monitor) => <Thumb item={`monitor-${monitor}`} />}
            onChange={(monitor) => setDecor({ ...decor, monitor })}
          />
        )}
        {activeSlot && (
          <CustomizationPicker
            legend={activeSlot.legend}
            value={decor.slots[activeSlot.key]}
            options={[null, ...activeSlot.options]}
            text={(option) => option === null ? 'Sem item' : label(option)}
            preview={(option) => <Thumb item={option} />}
            onChange={(value) => updateSlot(activeSlot.key, value)}
          />
        )}
      </div>
    </CustomizationEditor>
  );
}
