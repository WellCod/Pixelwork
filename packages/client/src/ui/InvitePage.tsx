import { useEffect, useState } from 'react';
import { orgApi, type InvitePreview } from '../api.ts';

const ERRORS: Record<string, string> = {
  not_found: 'Este convite não existe.',
  invite_expired: 'Este convite expirou. Peça um novo.',
  invite_used_up: 'Este convite já foi usado o máximo de vezes.',
  already_member: 'Você já participa deste coworking.',
};

const message = (error: unknown) => {
  const code = (error as { code?: unknown }).code;
  return (typeof code === 'string' && ERRORS[code]) || 'Não deu para abrir o convite.';
};

export function InvitePage({ token, onDone }: { token: string; onDone: (spaceId: string | null) => void }) {
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    orgApi
      .invite(token)
      .then(setPreview)
      .catch((e: unknown) => setError(message(e)));
  }, [token]);

  const accept = () => {
    orgApi
      .acceptInvite(token)
      .then((r) => onDone(r.spaceId))
      .catch((e: unknown) => setError(message(e)));
  };

  return (
    <main className="center">
      <h1>Convite</h1>
      {preview && (
        <>
          <p>
            Você foi convidado para <strong>{preview.spaceName}</strong> ({preview.orgName}) como{' '}
            {preview.role === 'admin' ? 'admin' : 'membro'}.
          </p>
          {preview.alreadyMember ? (
            <button type="button" className="primary" onClick={() => onDone(preview.spaceId)}>
              Você já participa. Abrir
            </button>
          ) : (
            <button type="button" className="primary" onClick={accept}>
              Aceitar convite
            </button>
          )}
        </>
      )}
      {error && <p className="error">{error}</p>}
      <button type="button" onClick={() => onDone(null)}>
        Voltar
      </button>
    </main>
  );
}
