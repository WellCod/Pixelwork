import { ACCESSORY_IDS, DECOR_ITEMS, DESK_VARIANTS, FLOOR_ITEMS, OUTFIT_IDS, WALL_ITEMS } from '@pixelwork/shared';
import { describe, expect, it } from 'vitest';
import { deskDecorFrame } from '../game/presence.ts';
import { COLLECTIONS, collectionItems } from './customization-collections.ts';

describe('coleções de personalização', () => {
  it('separa os itens padrão e os itens temáticos pelo prefixo do ID', () => {
    const items = ['basic', 'halloween-skull', 'christmas-gift', 'grinch-heart', 'new-year-clock', 'clock'] as const;

    expect(collectionItems(items, 'default')).toEqual(['basic', 'clock']);
    expect(collectionItems(items, 'halloween')).toEqual(['halloween-skull']);
    expect(collectionItems(items, 'christmas')).toEqual(['christmas-gift']);
    expect(collectionItems(items, 'grinch')).toEqual(['grinch-heart']);
    expect(collectionItems(items, 'new-year')).toEqual(['new-year-clock']);
  });

  it.each(COLLECTIONS)('$label oferece opções de avatar e sprites de decoração válidos', ({ key }) => {
    expect(collectionItems(OUTFIT_IDS, key).length).toBeGreaterThan(0);
    expect(collectionItems(ACCESSORY_IDS, key).length).toBeGreaterThan(0);
    const deskItems = collectionItems([...DESK_VARIANTS, ...DECOR_ITEMS, ...WALL_ITEMS, ...FLOOR_ITEMS], key);
    expect(deskItems.length).toBeGreaterThan(0);
    expect(deskItems.every((item) => deskDecorFrame(item) !== undefined)).toBe(true);
  });
});
