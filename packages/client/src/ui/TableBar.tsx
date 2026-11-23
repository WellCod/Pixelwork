import { tableAtSide, type ClientMsg } from '@pixelwork/shared';
import { useEffect, useState } from 'react';
import type { ClientWorld } from '../net/client-world.ts';
import { useWorld } from './useWorld.ts';

const ERRORS: Record<string, string> = {
  table_side_taken: 'Esse lado da mesa já está ocupado.',
  table_busy: 'Saia da chamada para jogar.',
  table_not_at_side: 'Fique em um dos lados da mesa para jogar.',
  table_not_found: 'Essa mesa não existe mais.',
};

/** Botão "Jogar pingpong" para quem está em pé num dos lados da mesa e ainda não entrou nela. */
export function TableBar({ world, send }: { world: ClientWorld; send: (msg: ClientMsg) => void }) {
  useWorld(world);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      world.subscribe((event) => {
        if (event.type === 'error' && event.code in ERRORS) setError(ERRORS[event.code] ?? null);
        if (event.type === 'selfStep' || event.type === 'selfCorrected') setError(null);
      }),
    [world],
  );

  const spot = tableAtSide(world.map, world.self.x, world.self.y);
  if (!spot || world.seat) return null;
  const state = world.tables.get(spot.table.key);
  const busy = state && (state.phase === 'playing' || state.phase === 'ended');
  const opponent = spot.side === 'left' ? state?.right : state?.left;
  const label =
    opponent && opponent !== 'bot'
      ? `${world.players.get(opponent)?.name ?? 'Alguém'} está esperando do outro lado`
      : busy
        ? 'Partida contra o bot em andamento'
        : 'Mesa de pingpong';

  return (
    <div className="desk-bar">
      <span>{label}</span>
      <button type="button" className="primary" onClick={() => send({ t: 'game.join', tableKey: spot.table.key })}>
        Jogar pingpong
      </button>
      {error && <span className="error">{error}</span>}
    </div>
  );
}
