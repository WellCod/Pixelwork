import { describe, expect, it } from 'vitest';
import { PROXIMITY_ENTER_TILES, PROXIMITY_EXIT_TILES } from './constants.ts';
import { compileMap, type CompiledMap } from './map.ts';
import { chatRecipients, nextProximity, selectBubbles, volumeAt } from './proximity.ts';
import { buildTestMap } from './testing.ts';

// 20x10, zonas abertas "a" (x 1..9) e "b" (x 10..14), sala "sala" (x 15..18).
function testMap(): CompiledMap {
  const result = compileMap(
    buildTestMap({
      width: 20,
      height: 10,
      zones: [
        { key: 'a', type: 'open', x: 1, y: 1, w: 9, h: 8 },
        { key: 'b', type: 'open', x: 10, y: 1, w: 5, h: 8 },
        { key: 'sala', type: 'meeting', x: 15, y: 1, w: 4, h: 8 },
      ],
    }),
  );
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.map;
}

const map = testMap();
const me = { id: 'eu', x: 2, y: 2 };
const at = (id: string, x: number, y: number) => ({ id, x, y });

describe('nextProximity', () => {
  it('entra no raio de entrada', () => {
    expect(nextProximity(map, me, [at('o', 2 + PROXIMITY_ENTER_TILES, 2)], new Set())).toEqual(new Set(['o']));
  });

  it('não entra entre os dois raios se não estava perto', () => {
    expect(nextProximity(map, me, [at('o', 2 + PROXIMITY_ENTER_TILES + 0.5, 2)], new Set()).size).toBe(0);
  });

  it('não sai entre os dois raios', () => {
    const between = at('o', 2 + PROXIMITY_EXIT_TILES, 2);
    expect(nextProximity(map, me, [between], new Set(['o']))).toEqual(new Set(['o']));
  });

  it('sai acima do raio de saída', () => {
    expect(nextProximity(map, me, [at('o', 3 + PROXIMITY_EXIT_TILES, 2)], new Set(['o'])).size).toBe(0);
  });

  it('sai ao trocar de zona mesmo estando perto', () => {
    const self = at('eu', 9, 2);
    expect(nextProximity(map, self, [at('o', 10, 2)], new Set(['o'])).size).toBe(0);
  });

  it('na sala de reunião ouve todos os ocupantes e ninguém de fora', () => {
    const self = at('eu', 15, 1);
    const result = nextProximity(map, self, [at('longe', 18, 8), at('fora', 14, 1)], new Set());
    expect(result).toEqual(new Set(['longe']));
  });
});

describe('volumeAt', () => {
  it('1 até um tile, 0,2 no raio de saída e linear no meio', () => {
    expect(volumeAt(0)).toBe(1);
    expect(volumeAt(1)).toBe(1);
    expect(volumeAt(PROXIMITY_EXIT_TILES)).toBeCloseTo(0.2);
    expect(volumeAt((1 + PROXIMITY_EXIT_TILES) / 2)).toBeCloseTo(0.6);
  });
});

describe('selectBubbles', () => {
  it('os mais próximos com câmera, limitados ao máximo', () => {
    const candidates = [
      { ...at('perto-sem-camera', 2, 3), hasCamera: false },
      { ...at('c', 5, 2), hasCamera: true },
      { ...at('a', 3, 2), hasCamera: true },
      { ...at('b', 4, 2), hasCamera: true },
    ];
    expect(selectBubbles(me, candidates, 2)).toEqual(['a', 'b']);
  });
});

describe('chatRecipients', () => {
  it('zona aberta: mesma zona e dentro do raio, incluindo o autor', () => {
    const players = [me, at('perto', 3, 3), at('longe', 8, 8), at('outra-zona', 10, 2)];
    expect(chatRecipients(map, me, players).sort()).toEqual(['eu', 'perto']);
  });

  it('sala de reunião: todos os ocupantes', () => {
    const author = at('eu', 15, 1);
    const players = [author, at('canto', 18, 8), at('porta', 14, 1)];
    expect(chatRecipients(map, author, players).sort()).toEqual(['canto', 'eu']);
  });
});
