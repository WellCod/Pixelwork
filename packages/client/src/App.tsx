import { compileMap, type CompiledMap } from '@pixelwork/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, orgApi, type Me, type SpaceDetail, type SpaceSummary } from './api.ts';
import { GameView } from './GameView.tsx';
import { EditorController, demoDraftKey } from './editor/editor-controller.ts';
import type { TiledDoc } from '@pixelwork/shared/editor';
import type { ConnectionStatus } from './net/connection.ts';
import { CreateSpaceModal } from './ui/CreateSpaceModal.tsx';
import { CreditsPage } from './ui/CreditsPage.tsx';
import { EntryPage } from './ui/EntryPage.tsx';
import { InviteModal } from './ui/InviteModal.tsx';
import { InvitePage } from './ui/InvitePage.tsx';
import { MapModal } from './ui/MapModal.tsx';
import { ReceptionSettingsModal } from './ui/ReceptionSettingsModal.tsx';
import { errorMessage } from './ui/useWorld.ts';

/** Coworking aberto: o detalhe vindo da API e o mapa já compilado. */
type CurrentSpace = { space: SpaceDetail; map: CompiledMap };

/** Fase da tela: carregando, login (com erro opcional) ou dentro do app com a lista de coworkings. */
type State =
  | { kind: 'loading' }
  | { kind: 'login'; error?: string }
  | { kind: 'ready'; me: Me; spaces: SpaceSummary[]; current: CurrentSpace | null; notice: string };

/** Chave do localStorage com o último coworking aberto, para reabrir nele no próximo acesso. */
const STORAGE_KEY = 'pixelwork.space';
const ROOM_LINK_KEY = 'pixelwork.room-link';
type RoomLink = { spaceId: string; zoneKey: string };

function roomLink(): RoomLink | null {
  const params = new URLSearchParams(location.search);
  const spaceId = params.get('coworking');
  const zoneKey = params.get('sala');
  if (spaceId && /^[0-9a-f-]{36}$/i.test(spaceId) && zoneKey && /^[a-z0-9-]{1,80}$/.test(zoneKey)) return { spaceId, zoneKey };
  return null;
}

function clearRoomLink(): void {
  const current = new URL(location.href);
  current.searchParams.delete('coworking');
  current.searchParams.delete('sala');
  history.replaceState(null, '', current);
  try {
    sessionStorage.removeItem(ROOM_LINK_KEY);
  } catch {
    // O link já foi retirado da URL.
  }
}
const STATUS_TEXT: Record<ConnectionStatus, string> = {
  connecting: 'Conectando…',
  online: 'Online',
  reconnecting: 'Reconectando…',
  replaced: 'Aberto em outra aba',
  removed: 'Você saiu deste coworking',
  ended: 'Sessão encerrada',
};

function rememberedSpaceId(): string | null {
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

/** Token do convite quando a página foi aberta pelo link `/invite/<token>`. */
function inviteTokenFromPath(): string | null {
  const match = /^\/invite\/([\w-]+)$/.exec(location.pathname);
  return match?.[1] ?? null;
}

/** Busca o coworking, compila o mapa e guarda a escolha para o próximo acesso. */
async function openSpace(spaceId: string): Promise<CurrentSpace> {
  const space = await api.space(spaceId);
  const compiled = compileMap(space.map);
  if (!compiled.ok) throw new Error('O mapa deste coworking não pôde ser carregado.');
  remember(spaceId);
  return { space, map: compiled.map };
}

function openEditor(space: SpaceDetail): EditorController {
  if (space.role !== 'admin') {
    try {
      const saved = sessionStorage.getItem(demoDraftKey(space.id));
      if (saved) {
        const draft: unknown = JSON.parse(saved);
        if (compileMap(draft).ok) return new EditorController(draft as TiledDoc);
      }
    } catch {
      // O editor ainda abre com o mapa compartilhado se o rascunho estiver inacessível.
    }
  }
  return new EditorController(structuredClone(space.map) as TiledDoc);
}

/**
 * Monta o estado `ready` depois do login. O coworking aberto segue a ordem: o pedido
 * explicitamente (`preferred`), o último lembrado e, por fim, o primeiro da lista.
 */
async function loadReady(me: Me, preferred: string | null = null, notice = '', linked = preferred === null ? roomLink() : null): Promise<State> {
  const spaces = await api.spaces();
  if (linked && !spaces.some((space) => space.id === linked.spaceId)) {
    notice = 'Este link de sala requer acesso ao coworking.';
    clearRoomLink();
  }
  const chosenSpace =
    spaces.find((space) => space.id === (preferred ?? linked?.spaceId)) ??
    spaces.find((space) => space.id === rememberedSpaceId()) ??
    spaces[0];
  const current = chosenSpace ? await openSpace(chosenSpace.id) : null;
  return { kind: 'ready', me, spaces, current, notice };
}

/**
 * Raiz do app: decide entre carregando, login, aceite de convite e o coworking aberto,
 * e cuida da troca de coworking, dos modais da barra e do modo de edição do mapa.
 */
export function App() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [githubLoginEnabled, setGithubLoginEnabled] = useState(false);
  const [inviteToken, setInviteToken] = useState(inviteTokenFromPath);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [openModal, setOpenModal] = useState<'create' | 'invite' | 'map' | 'reception' | null>(null);
  const [switchingSpace, setSwitchingSpace] = useState(false);
  const [editor, setEditor] = useState<{ controller: EditorController; baseVersion: number } | null>(null);

  // Só a resposta do pedido mais recente vale: trocas rápidas de coworking chegam fora de ordem.
  const openRequest = useRef(0);
  /** Erro passageiro com a sessão ainda válida vira aviso; não manda para o login. */
  const warn = useCallback((error: unknown) => {
    const text = error instanceof Error ? error.message : 'Não deu para abrir o coworking.';
    setState((previous) =>
      previous.kind === 'ready' ? { ...previous, notice: text } : { kind: 'login', error: text },
    );
  }, []);

  /** Erro que impede entrar: volta para o login mostrando o motivo. */
  const fail = useCallback((error: unknown) => {
    const text = error instanceof ApiError ? errorMessage(error) : error instanceof Error ? error.message : 'Falha ao entrar.';
    setState({ kind: 'login', error: text });
  }, []);

  // Na montagem: descobre se o login pelo GitHub está ligado e tenta retomar a sessão.
  // Sem sessão (401) cai no login; `?erro` na URL é o retorno de um OAuth do GitHub que falhou.
  useEffect(() => {
    try {
      const link = roomLink();
      if (link) sessionStorage.setItem(ROOM_LINK_KEY, location.search);
      else if (location.pathname === '/' && !location.search) {
        const saved = sessionStorage.getItem(ROOM_LINK_KEY);
        if (saved?.startsWith('?coworking=') || saved?.startsWith('?sala=')) history.replaceState(null, '', '/' + saved);
      }
    } catch {
      // O link continua funcionando para quem já entrou, mesmo sem armazenamento.
    }
    orgApi
      .providers()
      .then((providers) => setGithubLoginEnabled(providers.github))
      .catch(() => setGithubLoginEnabled(false));
    const githubError = new URLSearchParams(location.search).has('erro');
    const linked = roomLink();
    if (githubError) history.replaceState(null, '', location.pathname);
    api
      .me()
      .then((me) => loadReady(me, null, '', linked))
      .then(setState)
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          setState(githubError ? { kind: 'login', error: 'Não deu para entrar com o GitHub.' } : { kind: 'login' });
        } else fail(error);
      });
  }, [fail]);

  /** Recarrega a lista de coworkings e abre `preferred` (ou o lembrado), com aviso opcional. */
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
  if (state.kind === 'loading') {
    return (
      <main className="center">
        <div className="loading" role="status">
          Carregando…
        </div>
      </main>
    );
  }

  if (state.kind === 'login') {
    return (
      <EntryPage
        enterAsGuest={enterAsGuest}
        githubEnabled={githubLoginEnabled}
        invitePending={Boolean(inviteToken)}
        error={state.error}
      />
    );
  }

  const { me, spaces, current } = state;
  const linked = roomLink();

  // Aberto por link de convite: aceita primeiro e só depois entra no coworking do convite.
  if (inviteToken) {
    return (
      <InvitePage
        token={inviteToken}
        onDone={(spaceId) => {
          history.replaceState(null, '', '/');
          setInviteToken(null);
          // Sem isto o coworking anterior aparece por um instante antes do novo.
          setState({ kind: 'loading' });
          reload(me, spaceId);
        }}
      />
    );
  }

  /**
   * Troca de coworking pelo seletor da barra. Pede confirmação se o editor tem mudanças não salvas
   * e descarta respostas de pedidos antigos (ver `openRequest`).
   */
  const selectSpace = (spaceId: string) => {
    if (editor?.controller.dirty && !confirm('Trocar de coworking descarta as mudanças do editor. Continuar?')) return;
    const request = ++openRequest.current;
    setSwitchingSpace(true);
    openSpace(spaceId)
      .finally(() => {
        if (request === openRequest.current) setSwitchingSpace(false);
      })
      .then((openedSpace) => {
        if (request !== openRequest.current) return;
        setEditor(null);
        setState((previous) =>
          previous.kind === 'ready' ? { ...previous, current: openedSpace, notice: '' } : previous,
        );
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
          <select
            aria-label="Coworking"
            aria-busy={switchingSpace}
            value={current?.space.id ?? ''}
            onChange={(event) => selectSpace(event.target.value)}
          >
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.orgName} · {space.name}
              </option>
            ))}
          </select>
        )}
        {current && (
          <span className={`status status-${connectionStatus}`} role="status">
            {switchingSpace ? 'Abrindo…' : STATUS_TEXT[connectionStatus]}
          </span>
        )}
        <span className="spacer" />
        {current?.space.canEditMap && (
          <button
            type="button"
            disabled={editor !== null}
            onClick={() =>
              setEditor({
                controller: openEditor(current.space),
                baseVersion: current.space.mapVersion,
              })
            }
          >
            Editar mapa
          </button>
        )}
        {current?.space.role === 'admin' && (
          <>
            <button type="button" onClick={() => setOpenModal('map')}>
              Gerenciar mapa
            </button>
            <button type="button" onClick={() => setOpenModal('reception')}>
              Recepção
            </button>
            <button type="button" onClick={() => setOpenModal('invite')}>
              Convidar
            </button>
          </>
        )}
        <a href="/creditos">Créditos</a>
        {!me.isGuest && (
          <button type="button" onClick={() => setOpenModal('create')}>
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
          <button
            type="button"
            onClick={() => setState((previous) => (previous.kind === 'ready' ? { ...previous, notice: '' } : previous))}
          >
            Ok
          </button>
        </p>
      )}

      {current ? (
        <GameView
          key={current.space.id}
          space={current.space}
          map={current.map}
          linkedZone={linked?.spaceId === current.space.id ? linked.zoneKey : null}
          onLinkHandled={(notice) => {
            clearRoomLink();
            if (notice) setState((previous) => previous.kind === 'ready' ? { ...previous, notice } : previous);
          }}
          // Removido do coworking: recarrega a lista com aviso. Sessão encerrada: volta ao login.
          onStatus={(nextStatus) => {
            setConnectionStatus(nextStatus);
            if (nextStatus === 'removed') reload(me, null, `Você não faz mais parte de ${current.space.name}.`);
            if (nextStatus === 'ended') setState({ kind: 'login', error: 'Sua sessão terminou. Entre de novo.' });
          }}
          editor={editor}
          onEditorBaseVersion={(version) =>
            setEditor((currentEditor) => (currentEditor ? { ...currentEditor, baseVersion: version } : currentEditor))
          }
          onEditorClose={() => setEditor(null)}
          // O mapa mudou no servidor (`map.updated`): rebusca o coworking e troca o mapa sem mexer no resto.
          onMapUpdated={() => {
            const request = ++openRequest.current;
            openSpace(current.space.id)
              .then((reopenedSpace) => {
                if (request !== openRequest.current) return;
                setState((previous) => (previous.kind === 'ready' ? { ...previous, current: reopenedSpace } : previous));
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
            <button type="button" className="primary" onClick={() => setOpenModal('create')}>
              Criar empresa e coworking
            </button>
          )}
        </main>
      )}

      {openModal === 'create' && (
        <CreateSpaceModal
          spaces={spaces}
          onClose={() => setOpenModal(null)}
          onCreated={(spaceId) => {
            setOpenModal(null);
            reload(me, spaceId);
          }}
        />
      )}
      {openModal === 'invite' && current && <InviteModal spaceId={current.space.id} onClose={() => setOpenModal(null)} />}
      {openModal === 'reception' && current?.space.role === 'admin' && (
        <ReceptionSettingsModal key={current.space.id} spaceId={current.space.id} onClose={() => setOpenModal(null)} />
      )}
      {openModal === 'map' && current && (
        <MapModal spaceId={current.space.id} baseVersion={current.space.mapVersion} onClose={() => setOpenModal(null)} />
      )}
    </div>
  );
}
