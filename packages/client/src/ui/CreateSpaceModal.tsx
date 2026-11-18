import { MAP_TEMPLATES } from '@pixelwork/shared';
import { useState, type SubmitEvent } from 'react';
import { orgApi, type SpaceSummary } from '../api.ts';
import { Modal } from './Modal.tsx';

const NEW_ORG = '__new';

const ERRORS: Record<string, string> = {
  slug_taken: 'Esse endereço já está em uso. Escolha outro.',
  guest_forbidden: 'Convidados não criam empresas. Entre com o GitHub.',
  invalid_body: 'Confira os campos: o endereço usa só letras minúsculas, números e hífen.',
};

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

interface Props {
  spaces: SpaceSummary[];
  onClose: () => void;
  onCreated: (spaceId: string) => void;
}

/** Cria o coworking numa empresa onde o usuário é dono ou admin, ou numa empresa nova. */
export function CreateSpaceModal({ spaces, onClose, onCreated }: Props) {
  const orgs = [
    ...new Map(spaces.filter((s) => s.orgRole !== null).map((s) => [s.orgId, s.orgName])).entries(),
  ];
  const [orgId, setOrgId] = useState(orgs[0]?.[0] ?? NEW_ORG);
  const [orgName, setOrgName] = useState('');
  const [spaceName, setSpaceName] = useState('');
  const [template, setTemplate] = useState<string>(MAP_TEMPLATES[0].id);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const target = orgId === NEW_ORG ? (await orgApi.createOrg(orgName, slugify(orgName))).id : orgId;
      const created = await orgApi.createSpace(target, spaceName, slugify(spaceName), template);
      onCreated(created.id);
    } catch (err) {
      const code = (err as { code?: unknown }).code;
      setError((typeof code === 'string' && ERRORS[code]) || 'Não deu para criar. Tente de novo.');
      setBusy(false);
    }
  };

  return (
    <Modal title="Novo coworking" onClose={onClose}>
      <form className="fields" onSubmit={(e) => void submit(e)}>
        <label>
          Empresa
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            {orgs.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
            <option value={NEW_ORG}>Nova empresa…</option>
          </select>
        </label>
        {orgId === NEW_ORG && (
          <label>
            Nome da empresa
            <input required maxLength={60} value={orgName} onChange={(e) => setOrgName(e.target.value)} />
          </label>
        )}
        <label>
          Nome do coworking
          <input required maxLength={60} value={spaceName} onChange={(e) => setSpaceName(e.target.value)} />
        </label>
        <label>
          Mapa inicial
          <select value={template} onChange={(e) => setTemplate(e.target.value)}>
            {MAP_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="primary" disabled={busy}>
            Criar
          </button>
        </div>
      </form>
    </Modal>
  );
}
