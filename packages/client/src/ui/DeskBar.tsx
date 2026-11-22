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

  const editor = decorating && (
    <DecorEditor
      spaceId={spaceId}
      desk={decorating.desk}
      initial={decorating.decor}
      onClose={() => setDecorating(null)}
    />
  );
  const desk = deskAtChair(world.map, world.self.x, world.self.y);
  const state = desk ? world.desks.get(desk.key) : undefined;
  if (!desk || !state) return editor || null;

  const mine = state.userId === world.selfId;
  const run = (task: Promise<unknown>) => {
    setError(null);
    task.catch((e: unknown) => setError(errorMessage(e)));
  };

  let content;
  if (!state.userId) {
    content = (
      <>
        <span>Mesa livre</span>
        <button type="button" className="primary" onClick={() => run(profileApi.claimDesk(spaceId, desk.key))}>
          Ocupar esta mesa
        </button>
      </>
    );
  } else if (mine) {
    content = (
      <>
        <span>Sua mesa</span>
        <button
          type="button"
          disabled={!state.decor}
          onClick={() => state.decor && setDecorating({ desk, decor: state.decor })}
        >
          Decorar
        </button>
        <button type="button" onClick={() => run(profileApi.releaseDesk(spaceId, desk.key))}>
          Liberar
        </button>
      </>
    );
  } else {
    content = (
      <>
        <span>Mesa de {state.ownerName}</span>
        {isAdmin && (
          <button type="button" onClick={() => run(profileApi.releaseDesk(spaceId, desk.key))}>
            Liberar mesa
          </button>
        )}
      </>
    );
  }

  return (
    <div className="desk-bar">
      {content}
      {error && <span className="error">{error}</span>}
      {editor}
    </div>
  );
}
