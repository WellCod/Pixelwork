import {
  DECOR_ITEMS,
  DESK_VARIANTS,
  FLOOR_ITEMS,
  WALL_ITEMS,
  type DeskDecor,
} from '@pixelwork/shared';
import { useState } from 'react';
import { profileApi } from '../api.ts';
import { Modal } from './Modal.tsx';
import { errorMessage } from './useWorld.ts';

const NONE = '__none';
const MONITORS = ['single', 'dual', 'laptop'] as const;
const MONITOR_LABEL: Record<(typeof MONITORS)[number], string> = {
  single: 'monitor',
  dual: 'dois monitores',
  laptop: 'notebook',
};

type SlotKey = keyof DeskDecor['slots'];
const SLOTS: { key: SlotKey; label: string; options: readonly string[] }[] = [
  { key: 'left', label: 'Mesa, à esquerda', options: DECOR_ITEMS },
  { key: 'right', label: 'Mesa, à direita', options: DECOR_ITEMS },
  { key: 'back', label: 'Parede', options: WALL_ITEMS },
  { key: 'floor', label: 'Chão', options: FLOOR_ITEMS },
];

interface Props {
  spaceId: string;
  deskKey: string;
  initial: DeskDecor;
  onClose: () => void;
}

export function DecorEditor({ spaceId, deskKey, initial, onClose }: Props) {
  const [decor, setDecor] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    profileApi
      .setDecor(spaceId, deskKey, decor)
      .then(onClose)
      .catch((e: unknown) => setError(errorMessage(e)));
  };

  return (
    <Modal title="Decorar a mesa" onClose={onClose}>
      <div className="fields">
        <label>
          Mesa
          <select
            value={decor.variant}
            onChange={(e) => setDecor({ ...decor, variant: e.target.value as DeskDecor['variant'] })}
          >
            {DESK_VARIANTS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tela
          <select
            value={decor.monitor}
            onChange={(e) => setDecor({ ...decor, monitor: e.target.value as DeskDecor['monitor'] })}
          >
            {MONITORS.map((m) => (
              <option key={m} value={m}>
                {MONITOR_LABEL[m]}
              </option>
            ))}
          </select>
        </label>
        {SLOTS.map((slot) => (
          <label key={slot.key}>
            {slot.label}
            <select
              value={decor.slots[slot.key] ?? NONE}
              onChange={(e) => {
                const value = e.target.value === NONE ? null : e.target.value;
                setDecor({ ...decor, slots: { ...decor.slots, [slot.key]: value } });
              }}
            >
              <option value={NONE}>nada</option>
              {slot.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="button" onClick={onClose}>
          Cancelar
        </button>
        <button type="button" className="primary" onClick={save}>
          Salvar
        </button>
      </div>
    </Modal>
  );
}
