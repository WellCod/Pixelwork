import { TILESETS } from '@pixelwork/shared';
import { describe, expect, it } from 'vitest';
import { FLOOR_OPTIONS, WALL_OPTIONS } from './editor-controller.ts';

describe('opções de piso e parede do editor', () => {
  it('cada opção aponta para o frame do seu item no catálogo, sem repetir', () => {
    for (const [tileset, options] of [['floors', FLOOR_OPTIONS], ['walls', WALL_OPTIONS]] as const) {
      for (const o of options) {
        expect(o.item).toMatch(/^[a-z-]+$/);
        expect(TILESETS[tileset].items[o.frame]).toBe(o.item);
      }
      expect(new Set(options.map((o) => o.frame)).size).toBe(options.length);
    }
  });
});
