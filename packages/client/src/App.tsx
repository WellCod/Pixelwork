import { compileMap, type CompiledMap } from '@pixelwork/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, orgApi, type Me, type SpaceDetail, type SpaceSummary } from './api.ts';
import { GameView } from './GameView.tsx';
import { EditorController } from './editor/editor-controller.ts';
import type { TiledDoc } from '@pixelwork/shared/editor';
import type { ConnectionStatus } from './net/connection.ts';
import { CreateSpaceModal } from './ui/CreateSpaceModal.tsx';
import { CreditsPage } from './ui/CreditsPage.tsx';
import { InviteModal } from './ui/InviteModal.tsx';
import { InvitePage } from './ui/InvitePage.tsx';
import { MapModal } from './ui/MapModal.tsx';

type Current = { space: SpaceDetail; map: CompiledMap };

type State =
  | { kind: 'loading' }
  | { kind: 'login'; error?: string }
  | { kind: 'ready'; me: Me; spaces: SpaceSummary[]; current: Current | null; notice: string };

const STORAGE_KEY = 'pixelwork.space';
const STATUS_TEXT: Record<ConnectionStatus, string> = {
  connecting: 'Conectando…',
  online: 'Online',
  reconnecting: 'Reconectando…',
  replaced: 'Aberto em outra aba',
  removed: 'Você saiu deste coworking',
  ended: 'Sessão encerrada',
};

function remembered(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function remember(spaceId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, spaceId);
  } catch {
    // Navegação privada: a escolha só não fica salva.
  }
}

function inviteToken(): string | null {
  const match = /^\/invite\/([\w-]+)$/.exec(location.pathname);
  return match?.[1] ?? null;
}

async function openSpace(spaceId: string): Promise<Current> {
  const space = await api.space(spaceId);
  const compiled = compileMap(space.map);
  if (!compiled.ok) throw new Error('O mapa deste coworking não pôde ser carregado.');
  remember(spaceId);
  return { space, map: compiled.map };
}

async function loadReady(me: Me, preferred: string | null = null, notice = ''): Promise<State> {
  const spaces = await api.spaces();
  const pick = spaces.find((s) => s.id === preferred) ?? spaces.find((s) => s.id === remembered()) ?? spaces[0];
  const current = pick ? await openSpace(pick.id) : null;
  return { kind: 'ready', me, spaces, current, notice };
}

export function App() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [github, setGithub] = useState(false);
  const [invite, setInvite] = useState(inviteToken);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [modal, setModal] = useState<'create' | 'invite' | 'map' | null>(null);
  const [editor, setEditor] = useState<{ controller: EditorController; baseVersion: number } | null>(null);

  // Só a resposta do pedido mais recente vale: trocas rápidas de coworking chegam fora de ordem.
  const openRequest = useRef(0);
  /** Erro passageiro com a sessão ainda válida vira aviso; não manda para o login. */
  const warn = useCallback((error: unknown) => {
    const text = error instanceof Error ? error.message : 'Não deu para abrir o coworking.';
    setState((prev) => (prev.kind === 'ready' ? { ...prev, notice: text } : { kind: 'login', error: text }));
  }, []);

  const fail = useCallback((error: unknown) => {
    setState({ kind: 'login', error: error instanceof Error ? error.message : 'Falha ao entrar.' });
  }, []);

  useEffect(() => {
    orgApi
      .providers()
      .then((p) => setGithub(p.github))
      .catch(() => setGithub(false));
    const githubError = new URLSearchParams(location.search).has('erro');
    if (githubError) history.replaceState(null, '', location.pathname);
    api
      .me()
      .then((me) => loadReady(me))
      .then(setState)
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          setState(githubError ? { kind: 'login', error: 'Não deu para entrar com o GitHub.' } : { kind: 'login' });
        } else fail(error);
      });
  }, [fail]);

  const reload = (me: Me, preferred: string | null = null, notice = '') => {
    loadReady(me, preferred, notice).then(setState).catch(fail);
  };

  const enterAsGuest = () => {
    setState({ kind: 'loading' });
    api
      .guest()
      .then((me) => loadReady(me))
      .then(setState)
      .catch(fail);
  };

  const logout = () => {
    void api.logout().finally(() => setState({ kind: 'login' }));
  };

  if (location.pathname === '/creditos') return <CreditsPage />;
  if (state.kind === 'loading') return <main className="center">Carregando…</main>;

  if (state.kind === 'login') {
    return (
      <main className="center">
        <h1>Pixelwork</h1>
        <p>Coworking virtual em pixel art.</p>
        {invite && <p>Entre para aceitar o convite.</p>}
        <button type="button" onClick={enterAsGuest}>
          Entrar como convidado
        </button>
        {github && (
          <a className="button primary" href="/auth/github">
            Entrar com GitHub
          </a>
        )}
        {state.error && <p className="error">{state.error}</p>}
        <a href="/creditos">Créditos</a>
      </main>
    );
  }

  const { me, spaces, current } = state;

  if (invite) {
    return (
      <InvitePage
        token={invite}
        onDone={(spaceId) => {
          history.replaceState(null, '', '/');
          setInvite(null);
          // Sem isto o coworking anterior aparece por um instante antes do novo.
          setState({ kind: 'loading' });
          reload(me, spaceId);
        }}
      />
    );
  }

  const select = (spaceId: string) => {
    const request = ++openRequest.current;
    openSpace(spaceId)
      .then((next) => {
        if (request !== openRequest.current) return;
        setEditor(null);
        setState((prev) => (prev.kind === 'ready' ? { ...prev, current: next, notice: '' } : prev));
      })
      .catch((error: unknown) => {
        if (request === openRequest.current) warn(error);
      });
  };

  return (
    <div className="shell">
      <header className="bar">
        <strong>Pixelwork</strong>
        {spaces.length > 0 && (
          <select aria-label="Coworking" value={current?.space.id ?? ''} onChange={(e) => select(e.target.value)}>
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.orgName} · {s.name}
              </option>
            ))}
          </select>
        )}
        {current && <span className={`status status-${status}`}>{STATUS_TEXT[status]}</span>}
        <span className="spacer" />
        {current?.space.role === 'admin' && (
          <>
            <button
              type="button"
              disabled={editor !== null}
              onClick={() =>
                setEditor({
                  controller: new EditorController(structuredClone(current.space.map) as TiledDoc),
                  baseVersion: current.space.mapVersion,
                })
              }
            >
              Editar mapa
            </button>
            <button type="button" onClick={() => setModal('map')}>
              Mapa
            </button>
            <button type="button" onClick={() => setModal('invite')}>
              Convidar
            </button>
          </>
        )}
        <a href="/creditos">Créditos</a>
        {!me.isGuest && (
          <button type="button" onClick={() => setModal('create')}>
            Novo coworking
          </button>
        )}
        <span>{me.isGuest ? 'Convidado' : me.name}</span>
        <button type="button" onClick={logout}>
          Sair
        </button>
      </header>

      {state.notice && (
        <p className="notice-bar">
          {state.notice}{' '}
          <button type="button" onClick={() => setState((prev) => (prev.kind === 'ready' ? { ...prev, notice: '' } : prev))}>
            Ok
          </button>
        </p>
      )}

      {current ? (
        <GameView
          key={current.space.id}
          space={current.space}
          map={current.map}
          onStatus={(next) => {
            setStatus(next);
            if (next === 'removed') reload(me, null, `Você não faz mais parte de ${current.space.name}.`);
            if (next === 'ended') setState({ kind: 'login', error: 'Sua sessão terminou. Entre de novo.' });
          }}
          editor={editor}
          onEditorBaseVersion={(version) => setEditor((e) => (e ? { ...e, baseVersion: version } : e))}
          onEditorClose={() => setEditor(null)}
          onMapUpdated={() => {
            const request = ++openRequest.current;
            openSpace(current.space.id)
              .then((next) => {
                if (request !== openRequest.current) return;
                setState((prev) => (prev.kind === 'ready' ? { ...prev, current: next } : prev));
              })
              .catch((error: unknown) => {
                if (request === openRequest.current) warn(error);
              });
          }}
        />
      ) : (
        <main className="center">
          <p>Você não participa de nenhum coworking.</p>
          {me.isGuest ? (
            <p>Peça um convite a quem administra um coworking.</p>
          ) : (
            <button type="button" className="primary" onClick={() => setModal('create')}>
              Criar empresa e coworking
            </button>
          )}
        </main>
      )}

      {modal === 'create' && (
        <CreateSpaceModal
          spaces={spaces}
          onClose={() => setModal(null)}
          onCreated={(spaceId) => {
            setModal(null);
            reload(me, spaceId);
          }}
        />
      )}
      {modal === 'invite' && current && <InviteModal spaceId={current.space.id} onClose={() => setModal(null)} />}
      {modal === 'map' && current && (
        <MapModal spaceId={current.space.id} baseVersion={current.space.mapVersion} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
