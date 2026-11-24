import { useId, type ReactNode } from 'react';
import { Modal } from './Modal.tsx';

export function CustomizationEditor({ title, preview, children, error, saving, onSave, onClose }: {
  title: string;
  preview: ReactNode;
  children: ReactNode;
  error: string | null;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} className="customization-modal" onClose={() => { if (!saving) onClose(); }}>
      <div className="customization-body">
        <section className="customization-preview" aria-label="Prévia">
          <h3>Prévia</h3>
          {preview}
        </section>
        <div className="customization-controls" inert={saving}>{children}</div>
      </div>
      <footer className="customization-footer">
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button type="button" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" className="primary" onClick={onSave} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      </footer>
    </Modal>
  );
}

export function CustomizationNav<Key extends string>({ label, options, current, onChange }: {
  label: string;
  options: readonly { key: Key; label: string }[];
  current: Key;
  onChange: (key: Key) => void;
}) {
  return (
    <div className="customization-nav" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          aria-pressed={current === option.key}
          onClick={() => onChange(option.key)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function CustomizationPicker<Value extends string | null>({ legend, value, options, text, preview, onChange, swatches = false }: {
  legend: string;
  value: Value;
  options: readonly Value[];
  text: (option: Value) => string;
  preview: (option: Value) => ReactNode;
  onChange: (option: Value) => void;
  swatches?: boolean;
}) {
  const name = useId();
  return (
    <fieldset className={swatches ? 'customization-picker customization-swatches' : 'customization-picker'}>
      <legend>{legend}</legend>
      {swatches && <p className="customization-color-name">{text(value)}</p>}
      <div className="customization-options">
        {options.map((option) => (
          <label key={option ?? 'none'} className="customization-option" title={text(option)}>
            <input
              className="visually-hidden"
              type="radio"
              name={name}
              checked={option === value}
              onChange={() => onChange(option)}
            />
            <span className="customization-option-content">
              <span className="customization-option-art" aria-hidden="true">{preview(option)}</span>
              <span className={swatches ? 'visually-hidden' : 'customization-option-label'}>{text(option)}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
