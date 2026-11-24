import {
  ACCESSORY_IDS,
  BACKPACK_IDS,
  BODY_IDS,
  HAIR_IDS,
  HAIR_PALETTES,
  HEADWEAR_IDS,
  OUTFIT_IDS,
  OUTFIT_PALETTES,
  RAMPS,
  SKIN_PALETTES,
  type AvatarSpec,
} from '@pixelwork/shared';
import { useState } from 'react';
import { profileApi } from '../api.ts';
import { AvatarPreview } from './AvatarPreview.tsx';
import { collectionItems, type CustomizationCollection } from './customization-collections.ts';
import { CustomizationCollectionPicker, CustomizationEditor, CustomizationNav, CustomizationPicker } from './CustomizationEditor.tsx';
import { label } from './labels.ts';
import { errorMessage } from './useWorld.ts';

const SECTIONS = [
  { key: 'skin', label: 'Pele' },
  { key: 'hair', label: 'Cabelo' },
  { key: 'outfit', label: 'Roupa' },
  { key: 'accessory', label: 'Acessórios' },
  { key: 'headwear', label: 'Gorros' },
  { key: 'backpack', label: 'Itens nas costas' },
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
  const [collection, setCollection] = useState<CustomizationCollection>('default');
  const [section, setSection] = useState<(typeof SECTIONS)[number]['key']>('hair');
  const [view, setView] = useState<(typeof VIEWS)[number]['key']>('down');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const outfits = collectionItems(OUTFIT_IDS, collection);
  const accessories = collectionItems(ACCESSORY_IDS, collection);
  const headwearOptions = collectionItems(HEADWEAR_IDS, collection);
  const backpackOptions = collectionItems(BACKPACK_IDS, collection);
  const sections = SECTIONS.filter(({ key }) => {
    if (key === 'outfit') return outfits.length > 0;
    if (key === 'accessory') return accessories.length > 0;
    if (key === 'headwear') return headwearOptions.length > 0;
    if (key === 'backpack') return backpackOptions.length > 0;
    return collection === 'default';
  });
  const activeSection = sections.find(({ key }) => key === section)?.key ?? sections[0]?.key;

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
      <CustomizationCollectionPicker collection={collection} onChange={setCollection} />
      {activeSection && <CustomizationNav label="Categorias do avatar" options={sections} current={activeSection} onChange={setSection} />}
      <div className="customization-section" key={`${collection}-${activeSection}`}>
        {activeSection === 'skin' && (
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
        {activeSection === 'hair' && (
          <>
            <CustomizationPicker<AvatarSpec['hair']>
              legend="Penteado"
              value={spec.hair}
              options={[null, ...HAIR_IDS]}
              text={(option) => option === null ? 'Sem cabelo' : label(option)}
              preview={(hair) => <AvatarPreview spec={{ ...spec, hair, accessory: null, headwear: null }} crop="head" scale={2} />}
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
        {activeSection === 'outfit' && (
          <>
            <CustomizationPicker
              legend="Modelo da roupa"
              value={spec.outfit}
              options={outfits}
              text={(outfit) => label(outfit, 'outfit')}
              preview={(outfit) => <AvatarPreview spec={{ ...spec, outfit }} crop="outfit" scale={2} />}
              onChange={(outfit) => setSpec({ ...spec, outfit })}
            />
            {spec.outfit !== 'grinch-fur' && (
              <PalettePicker
                legend="Cor da roupa" value={spec.outfitColor} options={OUTFIT_PALETTES} ramps={RAMPS.outfit} context="color"
                onChange={(outfitColor) => setSpec({ ...spec, outfitColor })}
              />
            )}
          </>
        )}
        {activeSection === 'accessory' && (
          <CustomizationPicker<AvatarSpec['accessory']>
            legend="Acessório"
            value={spec.accessory}
            options={[null, ...accessories]}
            text={(option) => option === null ? 'Sem acessório' : label(option)}
            preview={(accessory) => <AvatarPreview spec={{ ...spec, accessory }} crop="head" scale={2} />}
            onChange={(accessory) => setSpec({ ...spec, accessory })}
          />
        )}
        {activeSection === 'headwear' && (
          <CustomizationPicker
            legend="Gorro"
            value={spec.headwear ?? null}
            options={[null, ...headwearOptions]}
            text={(headwear) => headwear ? label(headwear) : 'Sem gorro'}
            preview={(headwear) => <AvatarPreview spec={{ ...spec, headwear }} crop="head" scale={2} />}
            onChange={(headwear) => setSpec({ ...spec, headwear })}
          />
        )}
        {activeSection === 'backpack' && (
          <CustomizationPicker
            legend="Item nas costas"
            value={spec.backpack ?? null}
            options={[null, ...backpackOptions]}
            text={(backpack) => backpack ? label(backpack) : 'Sem item nas costas'}
            preview={(backpack) => <AvatarPreview spec={{ ...spec, backpack }} direction="up" crop="outfit" scale={2} />}
            onChange={(backpack) => {
              setSpec({ ...spec, backpack });
              setView('up');
            }}
          />
        )}
      </div>
    </CustomizationEditor>
  );
}
