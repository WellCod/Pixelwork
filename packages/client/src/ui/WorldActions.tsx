import { TILE_PX, type ClientMsg, type Dir, type Tile } from '@pixelwork/shared';
import { useEffect, useRef } from 'react';
import { actionAt, nearbyActions, type WorldTargets } from '../game/world-actions.ts';
import type { ClientWorld } from '../net/client-world.ts';
import type { DoorKnock } from './useDoorKnock.ts';
import { useWorld } from './useWorld.ts';

type Project = (x: number, y: number) => Tile | null;

function ActionMarker({ x, y, project, label, name, disabled, onClick }: {
  x: number; y: number; project: Project; label: string; name: string; disabled: boolean; onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let frame: number;
    const position = () => {
      const button = ref.current;
      const layer = button?.parentElement;
      const point = project(x, y);
      if (button && layer) {
        const visible = point && point.x >= 0 && point.x <= layer.clientWidth && point.y >= 38 && point.y + button.offsetHeight <= layer.clientHeight;
        const visibility = visible ? 'visible' : 'hidden';
        if (button.style.visibility !== visibility) button.style.visibility = visibility;
        if (visible) {
          const half = button.offsetWidth / 2;
          const left = Math.max(half + 4, Math.min(layer.clientWidth - half - 4, point.x));
          const transform = `translate(${Math.round(left)}px, ${Math.round(point.y)}px) translateX(-50%)`;
          if (button.style.transform !== transform) button.style.transform = transform;
        }
      }
      frame = requestAnimationFrame(position);
    };
    position();
    return () => cancelAnimationFrame(frame);
  }, [project, x, y]);

  return <button ref={ref} type="button" className="world-action" aria-label={name} disabled={disabled} onClick={onClick}>{label}</button>;
}

export function WorldActions({ world, targets, project, followPath, send, knock, onAquariumOpen }: {
  world: ClientWorld;
  targets: WorldTargets;
  project: Project;
  followPath: (path: Dir[]) => boolean;
  send: (message: ClientMsg) => void;
  knock: DoorKnock;
  onAquariumOpen: () => void;
}) {
  useWorld(world);
  const actions = nearbyActions(world, targets);
  return (
    <div className="world-actions" role="group" aria-label="Ações no mapa">
      {!world.seat && targets.filter(({ kind }) => kind === 'aquarium').map(({ id, bounds, label }) => (
        <ActionMarker key={id} x={(bounds.x + bounds.width / 2) * TILE_PX} y={(bounds.y + bounds.height) * TILE_PX + 2}
          project={project} label={label} name={label} disabled={false} onClick={() => {
            if (followPath([])) onAquariumOpen();
          }} />
      ))}
      {actions.map(({ target, approach }) => {
        if (target.kind === 'aquarium') return null;
        const { bounds } = target;
        const ready = approach.path.length === 0;
        const pending = target.kind === 'door' && knock.pending === target.zoneKey;
        const destination = target.kind === 'seat' ? 'Ir até o assento' : target.kind === 'door' ? 'Ir até a porta'
          : target.kind === 'arcade' ? 'Ir ao fliperama' : target.table.game === 'foosball' ? 'Ir ao pebolim' : 'Ir ao pingue-pongue';
        const label = pending ? 'Aguardando…' : ready ? target.label : destination;
        return (
          <ActionMarker
            key={target.id}
            x={(bounds.x + bounds.width / 2) * TILE_PX}
            y={(bounds.y + bounds.height) * TILE_PX + 2}
            project={project}
            label={label}
            name={pending ? 'Aguardando resposta da sala' : ready ? `${target.name} pelo mapa` : `${label} · ${target.name}`}
            disabled={pending}
            onClick={() => {
              if (!ready) {
                followPath(approach.path);
                return;
              }
              const message = actionAt(world, target);
              if (!message || !followPath([])) return;
              if (message.t === 'zone.knock') knock.request(message.zoneKey);
              else send(message);
            }}
          />
        );
      })}
    </div>
  );
}
