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

/** Sorteia um item da lista com o gerador dado; lista vazia é catálogo quebrado. */
function pickRandom<T>(items: readonly T[], random: () => number): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error('lista vazia no catálogo');
  return item;
}

/**
 * Avatar sorteado para conta nova (convidado ou primeiro login). 90% têm cabelo e 30% um acessório.
 * `random` é injetável para os testes serem determinísticos.
 */
export function randomAvatar(random: () => number = Math.random): AvatarSpec {
  return {
    body: pickRandom(BODY_IDS, random),
    skin: pickRandom(SKIN_PALETTES, random),
    hair: random() < 0.9 ? pickRandom(HAIR_IDS, random) : null,
    hairColor: pickRandom(HAIR_PALETTES, random),
    outfit: pickRandom(OUTFIT_IDS, random),
    outfitColor: pickRandom(OUTFIT_PALETTES, random),
    accessory: random() < 0.3 ? pickRandom(ACCESSORY_IDS, random) : null,
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
