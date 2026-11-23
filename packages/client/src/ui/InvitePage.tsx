import { useEffect, useState } from 'react';
import { orgApi, type InvitePreview } from '../api.ts';

/** Códigos de erro do convite traduzidos para a página. */
const ERRORS: Record<string, string> = {
  not_found: 'Este convite não existe.',
  invite_expired: 'Este convite expirou. Peça um novo.',
  invite_used_up: 'Este convite já foi usado o máximo de vezes.',
  already_member: 'Você já participa deste coworking.',
};

const inviteErrorMessage = (error: unknown) => {
  const code = (error as { code?: unknown }).code;
  return (typeof code === 'string' && ERRORS[code]) || 'Não deu para abrir o convite.';
};

/**
 * Página aberta pelo link de convite: mostra para onde é o convite e aceita. `onDone` recebe o
 * coworking para abrir, ou `null` quando a pessoa só volta.
 */
export function InvitePage({ token, onDone }: { token: string; onDone: (spaceId: string | null) => void }) {
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Busca a prévia do convite (coworking, empresa, papel) assim que o token chega.
  useEffect(() => {
    orgApi
      .invite(token)
      .then(setPreview)
      .catch((requestError: unknown) => setError(inviteErrorMessage(requestError)));
  }, [token]);

  const accept = () => {
    orgApi
      .acceptInvite(token)
      .then((acceptance) => onDone(acceptance.spaceId))
      .catch((requestError: unknown) => setError(inviteErrorMessage(requestError)));
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
