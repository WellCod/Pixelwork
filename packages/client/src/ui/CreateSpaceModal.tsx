import { MAP_TEMPLATES } from '@pixelwork/shared';
import { useState, type SubmitEvent } from 'react';
import { orgApi, type SpaceSummary } from '../api.ts';
import { Modal } from './Modal.tsx';

/** Valor do select de empresa que significa "criar uma empresa nova". */
const NEW_ORG = '__new';

/** Códigos de erro da API traduzidos para o formulário. */
const ERRORS: Record<string, string> = {
  slug_taken: 'Esse endereço já está em uso. Escolha outro.',
  guest_forbidden: 'Convidados não criam empresas. Entre com o GitHub.',
  invalid_body: 'Confira os campos: o endereço usa só letras minúsculas, números e hífen.',
};

/** Endereço (slug) a partir do nome: sem acento, minúsculo, só letras, números e hífen, até 40. */
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
  // Empresas onde o usuário tem papel (dono ou admin), sem repetição: vários coworkings da mesma
  // empresa viram uma entrada só. Cada item é `[orgId, orgName]`.
  const manageableOrgs = [
    ...new Map(
      spaces.filter((space) => space.orgRole !== null).map((space) => [space.orgId, space.orgName]),
    ).entries(),
  ];
  const [orgId, setOrgId] = useState(manageableOrgs[0]?.[0] ?? NEW_ORG);
  const [orgName, setOrgName] = useState('');
  const [spaceName, setSpaceName] = useState('');
  const [templateId, setTemplateId] = useState<string>(MAP_TEMPLATES[0].id);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Empresa nova é criada antes, e o coworking entra nela; senão entra na empresa escolhida.
  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const targetOrgId = orgId === NEW_ORG ? (await orgApi.createOrg(orgName, slugify(orgName))).id : orgId;
      const createdSpace = await orgApi.createSpace(targetOrgId, spaceName, slugify(spaceName), templateId);
      onCreated(createdSpace.id);
    } catch (createError) {
      const code = (createError as { code?: unknown }).code;
      setError((typeof code === 'string' && ERRORS[code]) || 'Não deu para criar. Tente de novo.');
      setBusy(false);
    }
  };

  return (
    <Modal title="Novo coworking" onClose={onClose}>
      <form className="fields" onSubmit={(event) => void submit(event)}>
        <label>
          Empresa
          <select value={orgId} onChange={(event) => setOrgId(event.target.value)}>
            {manageableOrgs.map(([id, name]) => (
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
            <input required maxLength={60} value={orgName} onChange={(event) => setOrgName(event.target.value)} />
          </label>
        )}
        <label>
          Nome do coworking
          <input required maxLength={60} value={spaceName} onChange={(event) => setSpaceName(event.target.value)} />
        </label>
        <label>
          Mapa inicial
          <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
            {MAP_TEMPLATES.map((mapTemplate) => (
              <option key={mapTemplate.id} value={mapTemplate.id}>
                {mapTemplate.name}
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
