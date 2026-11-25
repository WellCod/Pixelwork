import { useEffect, useState } from 'react';
import { receptionApi, type ReceptionSettings } from '../api.ts';
import { Modal } from './Modal.tsx';
import { errorMessage } from './useWorld.ts';

export function ReceptionSettingsModal({ spaceId, onClose }: { spaceId: string; onClose: () => void }) {
  const [settings, setSettings] = useState<ReceptionSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let current = true;
    void receptionApi.settings(spaceId)
      .then((result) => { if (current) setSettings(result); })
      .catch((failure: unknown) => { if (current) setError(errorMessage(failure)); });
    return () => { current = false; };
  }, [spaceId]);

  async function toggle(enabled: boolean) {
    setSaving(true);
    setError(null);
    try {
      setSettings(await receptionApi.setEnabled(spaceId, enabled));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Recepção de IA" onClose={onClose}>
      {!settings && !error && <p role="status">Carregando…</p>}
      {settings && (
        <>
          <p>{settings.installationEnabled ? 'A recepção está habilitada nesta instalação.' : 'A recepção está desligada nesta instalação.'}</p>
          {!settings.hasMarker && <p>Adicione o ponto da recepção ao mapa no Tiled.</p>}
          <label className="row">
            <input type="checkbox" checked={settings.enabled} disabled={saving} onChange={(event) => { void toggle(event.target.checked); }} />
            Autorizar a recepção neste coworking
          </label>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions"><button type="button" onClick={onClose}>Fechar</button></div>
    </Modal>
  );
}
