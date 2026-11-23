import { PROXIMITY_ENTER_TILES, PROXIMITY_EXIT_TILES } from './constants.ts';
import { zoneAt, type CompiledMap } from './map.ts';

export interface Positioned {
  id: string;
  x: number;
  y: number;
}

/** Euclidiana em tiles, entre centros de tile. */
export function tileDistance(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return Math.hypot(from.x - to.x, from.y - to.y);
}

/**
 * Quem o cliente deve ouvir e ver na sala `space:`. Na zona aberta, entra a até
 * PROXIMITY_ENTER_TILES na mesma zona e só sai acima de PROXIMITY_EXIT_TILES (histerese) ou
 * ao trocar de zona. Numa sala de reunião, todos os ocupantes da mesma sala. `forced`: quem conta
 * como perto em qualquer distância (o adversário de uma partida de pingpong).
 */
export function nextProximity(
  map: CompiledMap,
  self: Positioned,
  others: readonly Positioned[],
  current: ReadonlySet<string>,
  forced: ReadonlySet<string> = new Set(),
): Set<string> {
  const zone = zoneAt(map, self.x, self.y);
  const result = new Set<string>();
  for (const other of others) {
    if (other.id === self.id) continue;
    if (forced.has(other.id)) {
      result.add(other.id);
      continue;
    }
    if (zoneAt(map, other.x, other.y) !== zone) continue;
    if (zone.type === 'meeting') {
      result.add(other.id);
      continue;
    }
    // Histerese: quem já estava perto usa o raio maior, para não piscar na fronteira.
    const limit = current.has(other.id) ? PROXIMITY_EXIT_TILES : PROXIMITY_ENTER_TILES;
    if (tileDistance(self, other) <= limit) result.add(other.id);
  }
  return result;
}

/** 1,0 até 1 tile, caindo linearmente até 0,2 no raio de saída. */
export function volumeAt(distance: number): number {
  if (distance <= 1) return 1;
  if (distance >= PROXIMITY_EXIT_TILES) return 0.2;
  // Reta de (1 tile, volume 1,0) até (PROXIMITY_EXIT_TILES, volume 0,2).
  return 1 - (0.8 * (distance - 1)) / (PROXIMITY_EXIT_TILES - 1);
}

/** Os mais próximos com câmera ligada, até o máximo de balões; empate desfeito pelo id. */
export function selectBubbles(
  self: { x: number; y: number },
  candidates: readonly (Positioned & { hasCamera: boolean })[],
  max: number,
): string[] {
  return candidates
    .filter((candidate) => candidate.hasCamera)
    .map((candidate) => ({ id: candidate.id, distance: tileDistance(self, candidate) }))
    .sort((left, right) => left.distance - right.distance || left.id.localeCompare(right.id))
    .slice(0, max)
    .map((candidate) => candidate.id);
}

/**
 * Quem recebe uma mensagem de chat: na zona aberta, a mesma zona e até PROXIMITY_ENTER_TILES;
 * numa sala de reunião, todos os ocupantes. O autor sempre recebe.
 */
export function chatRecipients(map: CompiledMap, author: Positioned, players: readonly Positioned[]): string[] {
  const zone = zoneAt(map, author.x, author.y);
  return players
    .filter(
      (player) =>
        player.id === author.id ||
        (zoneAt(map, player.x, player.y) === zone &&
          (zone.type === 'meeting' || tileDistance(author, player) <= PROXIMITY_ENTER_TILES)),
    )
    .map((player) => player.id);
}
