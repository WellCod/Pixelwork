import { useState } from 'react';
import type { CompiledDesk, DeskDecor } from '@pixelwork/shared';
import { profileApi } from '../api.ts';
import { deskAtChair } from '../game/presence.ts';
import type { ClientWorld } from '../net/client-world.ts';
import { DecorEditor } from './DecorEditor.tsx';
import { errorMessage, useWorld } from './useWorld.ts';

interface Props {
  world: ClientWorld;
  spaceId: string;
  isAdmin: boolean;
}

/** Ações da mesa cuja cadeira está sob o próprio avatar. */
export function DeskBar({ world, spaceId, isAdmin }: Props) {
  useWorld(world);
  // Fica fora da condição da cadeira: levantar com o editor aberto não perde a edição.
  const [decorating, setDecorating] = useState<{ desk: CompiledDesk; decor: DeskDecor } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decorEditor = decorating && (
    <DecorEditor
      spaceId={spaceId}
      desk={decorating.desk}
      initial={decorating.decor}
      onClose={() => setDecorating(null)}
    />
  );
  const desk = deskAtChair(world.map, world.self.x, world.self.y);
  const deskState = desk ? world.desks.get(desk.key) : undefined;
  // Fora de uma cadeira de mesa a barra some, mas o editor de decoração continua se estiver aberto.
  if (!desk || !deskState) return decorEditor || null;

  const isMyDesk = deskState.userId === world.selfId;
  /** Roda uma ação REST da mesa e mostra o erro; o estado novo chega depois pelo WebSocket. */
  const runDeskAction = (task: Promise<unknown>) => {
    setError(null);
    task.catch((actionError: unknown) => setError(errorMessage(actionError)));
  };

  // As ações dependem de quem ocupa a mesa: ninguém, você ou outra pessoa (só admin libera a dos outros).
  let deskActions;
  if (!deskState.userId) {
    deskActions = (
      <>
        <span>Mesa livre</span>
        <button type="button" className="primary" onClick={() => runDeskAction(profileApi.claimDesk(spaceId, desk.key))}>
          Ocupar esta mesa
        </button>
      </>
    );
  } else if (isMyDesk) {
    deskActions = (
      <>
        <span>Sua mesa</span>
        <button
          type="button"
          disabled={!deskState.decor}
          onClick={() => deskState.decor && setDecorating({ desk, decor: deskState.decor })}
        >
          Decorar
        </button>
        <button type="button" onClick={() => runDeskAction(profileApi.releaseDesk(spaceId, desk.key))}>
          Liberar
        </button>
      </>
    );
  } else {
    deskActions = (
      <>
        <span>Mesa de {deskState.ownerName}</span>
        {isAdmin && (
          <button type="button" onClick={() => runDeskAction(profileApi.releaseDesk(spaceId, desk.key))}>
            Liberar mesa
          </button>
        )}
      </>
    );
  }

  return (
    <div className="desk-bar">
      {deskActions}
      {error && <span className="error">{error}</span>}
      {decorEditor}
    </div>
  );
}
