import { compileMap, findPath, frameOf, isWalkable, zoneAt } from '@pixelwork/shared';
import { apply, placeFurniture, type TiledDoc } from '@pixelwork/shared/editor';
import { describe, expect, it } from 'vitest';
import { withAuroraConferenceTable } from './demo-aurora.ts';
import { loadDemoTemplate, loadTemplate } from './demo.ts';

describe('sala Aurora na demo', () => {
  it('tem dez lugares distintos e acessíveis ao redor de uma mesa que bloqueia movimento', () => {
    const doc = loadDemoTemplate();
    const compiled = compileMap(doc);
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.errors));
    const { map } = compiled;
    const seats = map.furnitureSeats.filter(({ key }) => key.startsWith('meeting-table-conference@'));
    expect(seats).toHaveLength(10);
    expect(seats.filter(({ facing }) => facing === 'up')).toHaveLength(5);
    expect(new Set(seats.flatMap(({ approaches }) => approaches.map(([x, y]) => `${x},${y}`))).size).toBe(10);
    for (const seat of seats) {
      expect(seat.approaches).toHaveLength(1);
      for (const [x, y] of seat.approaches) {
        expect(zoneAt(map, x, y).key).toBe('sala-aurora');
        expect(findPath(map, map.spawn, { x, y })).not.toBeNull();
      }
    }
    for (let x = 30; x <= 34; x++) {
      expect(isWalkable(map, x, 6)).toBe(false);
      expect(isWalkable(map, x, 7)).toBe(false);
    }
    expect(withAuroraConferenceTable(doc)).toBe(doc);
  });

  it('mantém o mapa e os seis assentos da mesa anterior se a ampliação estiver ocupada', () => {
    const doc = loadTemplate('small-office') as TiledDoc;
    const obstacle = placeFurniture(doc, 'furniture', frameOf('furniture', 'plant'), 30, 6);
    if (!obstacle) throw new Error('obstáculo fora do mapa');
    const blocked = apply(doc, obstacle).doc;
    expect(withAuroraConferenceTable(blocked)).toBe(blocked);
    const compiled = compileMap(blocked);
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.errors));
    expect(compiled.map.furnitureSeats.filter(({ key }) => key.startsWith('meeting-table-long@'))).toHaveLength(6);
  });
});
