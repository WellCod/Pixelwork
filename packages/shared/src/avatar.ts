import {
  ACCESSORY_IDS,
  BODY_IDS,
  HAIR_IDS,
  HAIR_PALETTES,
  OUTFIT_IDS,
  OUTFIT_PALETTES,
  SKIN_PALETTES,
} from './catalog.generated.ts';
import type { AvatarSpec } from './protocol.ts';

function pick<T>(items: readonly T[], random: () => number): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error('lista vazia no catálogo');
  return item;
}

export function randomAvatar(random: () => number = Math.random): AvatarSpec {
  return {
    body: pick(BODY_IDS, random),
    skin: pick(SKIN_PALETTES, random),
    hair: random() < 0.9 ? pick(HAIR_IDS, random) : null,
    hairColor: pick(HAIR_PALETTES, random),
    outfit: pick(OUTFIT_IDS, random),
    outfitColor: pick(OUTFIT_PALETTES, random),
    accessory: random() < 0.3 ? pick(ACCESSORY_IDS, random) : null,
  };
}

/** Chave estável do avatar, usada no cache de texturas. */
export function avatarKey(spec: AvatarSpec): string {
  return [
    spec.body,
    spec.skin,
    spec.hair ?? '-',
    spec.hairColor,
    spec.outfit,
    spec.outfitColor,
    spec.accessory ?? '-',
  ].join('.');
}
