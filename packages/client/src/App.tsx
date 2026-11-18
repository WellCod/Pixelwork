import { compileMap, type CompiledMap } from '@pixelwork/shared';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, type Me, type SpaceDetail } from './api.ts';
import { GameView } from './GameView.tsx';

type State =
  | { kind: 'loading' }
  | { kind: 'login'; error?: string }
  | { kind: 'ready'; me: Me; space: SpaceDetail; map: CompiledMap };

async function loadSpace(me: Me): Promise<State> {
  const spaces = await api.spaces();
  const first = spaces[0];
  if (!first) throw new Error('Você não participa de nenhum coworking.');
  const space = await api.space(first.id);
  const compiled = compileMap(space.map);
  if (!compiled.ok) throw new Error('O mapa deste coworking não pôde ser carregado.');
  return { kind: 'ready', me, space, map: compiled.map };
}

export function App() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const fail = useCallback((error: unknown) => {
    setState({ kind: 'login', error: error instanceof Error ? error.message : 'Falha ao entrar.' });
  }, []);

  useEffect(() => {
    api
      .me()
      .then(loadSpace)
      .then(setState)
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) setState({ kind: 'login' });
        else fail(error);
      });
  }, [fail]);

  const enterAsGuest = () => {
    setState({ kind: 'loading' });
    api.guest().then(loadSpace).then(setState).catch(fail);
  };

  const logout = () => {
    void api.logout().finally(() => setState({ kind: 'login' }));
  };

  if (state.kind === 'loading') return <main className="center">Carregando…</main>;

  if (state.kind === 'login') {
    return (
      <main className="center">
        <h1>Pixelwork</h1>
        <p>Coworking virtual em pixel art.</p>
        <button type="button" onClick={enterAsGuest}>
          Entrar como convidado
        </button>
        {state.error && <p className="error">{state.error}</p>}
      </main>
    );
  }

  return <GameView me={state.me} space={state.space} map={state.map} onLogout={logout} />;
}
