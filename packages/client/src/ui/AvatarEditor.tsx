import {
  ACCESSORY_IDS,
  BODY_IDS,
  HAIR_IDS,
  HAIR_PALETTES,
  OUTFIT_IDS,
  OUTFIT_PALETTES,
  SKIN_PALETTES,
  type AvatarSpec,
} from '@pixelwork/shared';
import { useState } from 'react';
import { profileApi } from '../api.ts';
import { AvatarPreview } from './AvatarPreview.tsx';
import { label } from './labels.ts';
import { Modal } from './Modal.tsx';
import { errorMessage } from './useWorld.ts';

/** Valor da opção "Nenhum" no select: o `<select>` não aceita `null`, então vira este marcador. */
const NONE = '__none';

/** Um select do editor: qual campo do avatar altera, as opções e o contexto do rótulo. */
interface Field {
  key: keyof AvatarSpec;
  label: string;
  options: readonly string[];
  optional?: boolean;
  context?: 'outfit' | 'skin' | 'color';
}

const FIELDS: Field[] = [
  { key: 'body', label: 'Corpo', options: BODY_IDS },
  { key: 'skin', label: 'Pele', options: SKIN_PALETTES, context: 'skin' },
  { key: 'hair', label: 'Cabelo', options: HAIR_IDS, optional: true },
  { key: 'hairColor', label: 'Cor do cabelo', options: HAIR_PALETTES, context: 'color' },
  { key: 'outfit', label: 'Roupa', options: OUTFIT_IDS, context: 'outfit' },
  { key: 'outfitColor', label: 'Cor da roupa', options: OUTFIT_PALETTES, context: 'color' },
  { key: 'accessory', label: 'Acessório', options: ACCESSORY_IDS, optional: true },
];

/** Modal para montar o avatar com prévia ao vivo; salva no perfil e fecha. */
export function AvatarEditor({ initial, onClose }: { initial: AvatarSpec; onClose: () => void }) {
  const [spec, setSpec] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = () => {
    setSaving(true);
    profileApi
      .setAvatar(spec)
      .then(onClose)
      .catch((saveError: unknown) => {
        setError(errorMessage(saveError));
        setSaving(false);
      });
  };

  return (
    <Modal title="Seu avatar" onClose={onClose}>
      <div className="avatar-editor">
        <AvatarPreview spec={spec} scale={5} />
        <div className="fields">
          {FIELDS.map((field) => (
            <label key={field.key}>
              {field.label}
              <select
                value={spec[field.key] ?? NONE}
                onChange={(event) => {
                  const value = event.target.value === NONE ? null : event.target.value;
                  setSpec({ ...spec, [field.key]: value });
                }}
              >
                {field.optional && <option value={NONE}>Nenhum</option>}
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {label(option, field.context)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>
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
