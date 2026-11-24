import { AvatarSpec, avatarKey } from '@pixelwork/shared';
import { describe, expect, it } from 'vitest';
import { layersOf } from './avatar-compose.ts';

const original: AvatarSpec = {
  body: 'base', skin: 'medium', hair: 'long', hairColor: 'brown',
  outfit: 'hoodie', outfitColor: 'green', accessory: 'cap',
};

describe('camadas do avatar', () => {
  it('mantém a composição e o cache de avatares sem gorro e mochila', () => {
    expect(AvatarSpec.parse(original)).toEqual(original);
    expect(layersOf(original)).toEqual([
      ['body', 'base'], ['outfit', 'hoodie'], ['hair', 'long'], ['accessory', 'cap'],
    ]);
    expect(avatarKey(original)).toBe(avatarKey({ ...original, headwear: null, backpack: null }));
  });

  it('compõe a máscara, o gorro e o saco juntos e diferencia as texturas', () => {
    const grinch = AvatarSpec.parse({
      ...original, outfit: 'grinch-fur', accessory: 'grinch-mask',
      headwear: 'grinch-santa-hat', backpack: 'grinch-present-sack',
    });
    expect(layersOf(grinch)).toEqual([
      ['body', 'base'], ['outfit', 'grinch-fur'], ['backpack', 'grinch-present-sack'],
      ['accessory', 'grinch-mask'], ['headwear', 'grinch-santa-hat'],
    ]);
    expect(avatarKey(grinch)).not.toBe(avatarKey({ ...grinch, headwear: null }));
    expect(avatarKey(grinch)).not.toBe(avatarKey({ ...grinch, backpack: null }));
    expect(AvatarSpec.safeParse({ ...grinch, backpack: 'grinch-santa-hat' }).success).toBe(false);
  });
});
