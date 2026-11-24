import {
  ACCESSORY_IDS,
  BODY_IDS,
  HAIR_IDS,
  HAIR_PALETTES,
  OUTFIT_IDS,
  OUTFIT_PALETTES,
  RAMPS,
  SKIN_PALETTES,
  type AvatarSpec,
} from '@pixelwork/shared';
import { useState } from 'react';
import { profileApi } from '../api.ts';
import { AvatarPreview } from './AvatarPreview.tsx';
import { CustomizationEditor, CustomizationNav, CustomizationPicker } from './CustomizationEditor.tsx';
import { label } from './labels.ts';
import { errorMessage } from './useWorld.ts';

const SECTIONS = [
  { key: 'skin', label: 'Pele' },
  { key: 'hair', label: 'Cabelo' },
  { key: 'outfit', label: 'Roupa' },
  { key: 'accessory', label: 'Acessórios' },
] as const;

const BODY_OPTIONS: readonly AvatarSpec['body'][] = BODY_IDS;

const VIEWS = [
  { key: 'down', label: 'Frente' },
  { key: 'left', label: 'Lado' },
  { key: 'up', label: 'Costas' },
] as const;

function PalettePicker<Color extends string>({ legend, value, options, ramps, context, onChange }: {
  legend: string;
  value: Color;
  options: readonly Color[];
  ramps: Record<Color, readonly string[]>;
  context: 'skin' | 'color';
  onChange: (color: Color) => void;
}) {
  return (
    <CustomizationPicker
      legend={legend}
      value={value}
      options={options}
      text={(color) => label(color, context)}
      preview={(color) => <span className="customization-swatch" style={{ backgroundColor: ramps[color][2] }} />}
      onChange={onChange}
      swatches
    />
  );
}

/** Personalização do avatar com miniaturas e prévia em três direções. */
export function AvatarEditor({ initial, onClose }: { initial: AvatarSpec; onClose: () => void }) {
  const [spec, setSpec] = useState(initial);
  const [section, setSection] = useState<(typeof SECTIONS)[number]['key']>('hair');
  const [view, setView] = useState<(typeof VIEWS)[number]['key']>('down');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      await profileApi.setAvatar(spec);
      onClose();
    } catch (saveError) {
      setError(errorMessage(saveError));
      setSaving(false);
    }
  };

  return (
    <CustomizationEditor
      title="Personalizar avatar"
      preview={
        <>
          <div className="customization-stage avatar-stage">
            <AvatarPreview spec={spec} scale={5} direction={view} />
          </div>
          <CustomizationNav label="Ângulo da prévia" options={VIEWS} current={view} onChange={setView} />
        </>
      }
      error={error}
      saving={saving}
      onClose={onClose}
      onSave={() => { void save(); }}
    >
      <CustomizationNav label="Categorias do avatar" options={SECTIONS} current={section} onChange={setSection} />
      <div className="customization-section" key={section}>
        {section === 'skin' && (
          <>
            {BODY_OPTIONS.length > 1 && (
              <CustomizationPicker
                legend="Corpo"
                value={spec.body}
                options={BODY_OPTIONS}
                text={(body) => label(body)}
                preview={(body) => <AvatarPreview spec={{ ...spec, body }} scale={2} />}
                onChange={(body) => setSpec({ ...spec, body })}
              />
            )}
            <PalettePicker
              legend="Tom de pele" value={spec.skin} options={SKIN_PALETTES} ramps={RAMPS.skin} context="skin"
              onChange={(skin) => setSpec({ ...spec, skin })}
            />
          </>
        )}
        {section === 'hair' && (
          <>
            <CustomizationPicker<AvatarSpec['hair']>
              legend="Penteado"
              value={spec.hair}
              options={[null, ...HAIR_IDS]}
              text={(option) => option === null ? 'Sem cabelo' : label(option)}
              preview={(hair) => <AvatarPreview spec={{ ...spec, hair, accessory: null }} crop="head" scale={2} />}
              onChange={(hair) => setSpec({ ...spec, hair })}
            />
            {spec.hair !== null && (
              <PalettePicker
                legend="Cor do cabelo" value={spec.hairColor} options={HAIR_PALETTES} ramps={RAMPS.hair} context="color"
                onChange={(hairColor) => setSpec({ ...spec, hairColor })}
              />
            )}
          </>
        )}
        {section === 'outfit' && (
          <>
            <CustomizationPicker
              legend="Modelo da roupa"
              value={spec.outfit}
              options={OUTFIT_IDS}
              text={(outfit) => label(outfit, 'outfit')}
              preview={(outfit) => <AvatarPreview spec={{ ...spec, outfit }} crop="outfit" scale={2} />}
              onChange={(outfit) => setSpec({ ...spec, outfit })}
            />
            <PalettePicker
              legend="Cor da roupa" value={spec.outfitColor} options={OUTFIT_PALETTES} ramps={RAMPS.outfit} context="color"
              onChange={(outfitColor) => setSpec({ ...spec, outfitColor })}
            />
          </>
        )}
        {section === 'accessory' && (
          <CustomizationPicker<AvatarSpec['accessory']>
            legend="Acessório"
            value={spec.accessory}
            options={[null, ...ACCESSORY_IDS]}
            text={(option) => option === null ? 'Sem acessório' : label(option)}
            preview={(accessory) => <AvatarPreview spec={{ ...spec, accessory }} crop="head" scale={2} />}
            onChange={(accessory) => setSpec({ ...spec, accessory })}
          />
        )}
      </div>
    </CustomizationEditor>
  );
}
