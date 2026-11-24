import { tableAtSide, type ClientMsg } from '@pixelwork/shared';
import { useEffect, useState } from 'react';
import type { ClientWorld } from '../net/client-world.ts';
import { useWorld } from './useWorld.ts';

/** Erros de entrada na mesa de jogo, já com o texto para o usuário. */
const ERRORS: Record<string, string> = {
  table_side_taken: 'Esse lado da mesa já está ocupado.',
  table_busy: 'Saia da chamada para jogar.',
  table_not_at_side: 'Fique em um dos lados da mesa para jogar.',
  table_not_found: 'Essa mesa não existe mais.',
};

/** Botão de entrada no jogo para quem está em pé num dos lados da mesa e ainda não entrou nela. */
export function TableBar({ world, send }: { world: ClientWorld; send: (message: ClientMsg) => void }) {
  useWorld(world);
  const [error, setError] = useState<string | null>(null);

  // Mostra o erro que o servidor devolver ao tentar entrar; qualquer passo do avatar o apaga.
  useEffect(
    () =>
      world.subscribe((event) => {
        if (event.type === 'error' && event.code in ERRORS) setError(ERRORS[event.code] ?? null);
        if (event.type === 'selfStep' || event.type === 'selfCorrected') setError(null);
      }),
    [world],
  );

  const tableSpot = tableAtSide(world.map, world.self.x, world.self.y);
  if (!tableSpot || world.seat) return null;
  const gameName = tableSpot.table.game === 'foosball' ? 'pebolim' : 'pingpong';
  const tableState = world.tables.get(tableSpot.table.key);
  const busy = tableState && (tableState.phase === 'playing' || tableState.phase === 'ended');
  const opponent = tableSpot.side === 'left' ? tableState?.right : tableState?.left;
  // Texto conforme quem está do outro lado: uma pessoa esperando, o bot jogando ou ninguém.
  const tableLabel =
    opponent && opponent !== 'bot'
      ? `${world.players.get(opponent)?.name ?? 'Alguém'} está esperando do outro lado`
      : busy
        ? 'Partida contra o bot em andamento'
        : `Mesa de ${gameName}`;

  return (
    <div className="desk-bar">
      <span>{tableLabel}</span>
      <button type="button" className="primary" onClick={() => send({ t: 'game.join', tableKey: tableSpot.table.key })}>
        Jogar {gameName}
      </button>
      {error && <span className="error">{error}</span>}
    </div>
  );
}
