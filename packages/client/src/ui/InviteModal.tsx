import { useState } from 'react';
import { orgApi } from '../api.ts';
import { Modal } from './Modal.tsx';

/** Gera um link de convite para o coworking, com papel e limite de usos opcionais. */
export function InviteModal({ spaceId, onClose }: { spaceId: string; onClose: () => void }) {
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [maxUses, setMaxUses] = useState('');
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Campo vazio vira `null`: convite sem limite de usos.
  const create = () => {
    setError(null);
    orgApi
      .createInvite(spaceId, role, maxUses ? Number(maxUses) : null)
      .then(setLink)
      .catch(() => setError('Não deu para criar o convite.'));
  };

  const copy = () => {
    if (!link) return;
    navigator.clipboard
      .writeText(link.url)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

  return (
    <Modal title="Convidar para o coworking" onClose={onClose}>
      <div className="fields">
        <label>
          Papel
          <select value={role} onChange={(event) => setRole(event.target.value as 'member' | 'admin')}>
            <option value="member">Membro</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label>
          Limite de usos (vazio = sem limite)
          <input
            type="number"
            min={1}
            max={1000}
            value={maxUses}
            onChange={(event) => setMaxUses(event.target.value)}
          />
        </label>
        <button type="button" className="primary" onClick={create}>
          Gerar link
        </button>
        {link && (
          <>
            <label>
              Link do convite (vale 7 dias)
              <input readOnly value={link.url} onFocus={(event) => event.target.select()} />
            </label>
            <button type="button" onClick={copy}>
              {copied ? 'Copiado' : 'Copiar link'}
            </button>
          </>
        )}
        {error && <p className="error">{error}</p>}
      </div>
      <div className="actions">
        <button type="button" onClick={onClose}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}
