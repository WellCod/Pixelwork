import { canReachFurnitureSeat, type ClientMsg, type FurnitureSeatKind } from '@pixelwork/shared';
import { useEffect, useState } from 'react';
import type { ClientWorld } from '../net/client-world.ts';
import { useWorld } from './useWorld.ts';

const SIT_LABEL: Record<FurnitureSeatKind, string> = {
  sofa: 'Sentar no sofá',
  table: 'Sentar à mesa',
  stool: 'Sentar na banqueta',
};

export function FurnitureSeatBar({ world, send }: { world: ClientWorld; send: (message: ClientMsg) => void }) {
  useWorld(world);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => world.subscribe((event) => {
    if (event.type === 'selfStep' || event.type === 'selfCorrected' || event.type === 'reset') setError(null);
    if (event.type !== 'error') return;
    if (event.code === 'furniture_seat_taken') setError('Este assento já está ocupado.');
    if (event.code === 'furniture_seat_unavailable') setError('Aproxime-se de um assento livre.');
  }), [world]);

  if (!world.selfId || world.seat) return null;
  if (world.players.get(world.selfId)?.seatedAt) {
    return <div className="desk-bar"><button type="button" onClick={() => send({ t: 'furniture.stand' })}>Levantar</button></div>;
  }

  const nearby = world.map.furnitureSeats.filter((seat) => canReachFurnitureSeat(seat, world.self.x, world.self.y));
  if (nearby.length === 0) return null;
  const occupied = new Set([...world.players.values()].map((player) => player.seatedAt));
  const kinds = [...new Set(nearby.map((seat) => seat.kind))];
  return (
    <div className="desk-bar">
      {kinds.map((kind) => {
        const seat = nearby.find((candidate) => candidate.kind === kind && !occupied.has(candidate.key));
        return (
          <button type="button" key={kind} disabled={!seat} onClick={() => {
            if (!seat) return;
            setError(null);
            send({ t: 'furniture.sit', seatKey: seat.key });
          }}>
            {seat ? SIT_LABEL[kind] : 'Assento ocupado'}
          </button>
        );
      })}
      {error && <span role="status" className="error">{error}</span>}
    </div>
  );
}
