import { DIR_DELTA, type Dir } from './protocol.ts';
import { isWalkable, type CompiledMap } from './map.ts';

export interface Tile {
  x: number;
  y: number;
}

/** Regra extra por passo (sala trancada), a mesma ideia do `canEnter` da simulação. */
export type PathRule = (from: Tile, x: number, y: number) => boolean;

const DIRS = Object.keys(DIR_DELTA) as Dir[];

/** Heap binário mínimo por prioridade; o mapa tem até 10 mil tiles. */
class MinHeap {
  private readonly items: { node: number; priority: number }[] = [];

  get size(): number {
    return this.items.length;
  }

  push(node: number, priority: number): void {
    const items = this.items;
    items.push({ node, priority });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const p = items[parent];
      const c = items[i];
      if (!p || !c || p.priority <= c.priority) break;
      items[parent] = c;
      items[i] = p;
      i = parent;
    }
  }

  pop(): number | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (!top || !last) return undefined;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if ((items[l]?.priority ?? Infinity) < (items[smallest]?.priority ?? Infinity)) smallest = l;
        if ((items[r]?.priority ?? Infinity) < (items[smallest]?.priority ?? Infinity)) smallest = r;
        if (smallest === i) break;
        const a = items[i];
        const b = items[smallest];
        if (!a || !b) break;
        items[i] = b;
        items[smallest] = a;
        i = smallest;
      }
    }
    return top.node;
  }
}

/**
 * Caminho mais curto em passos de 4 direções (A* com distância de Manhattan), como lista de
 * direções a mandar ao servidor. `stopAt` é a distância em que o caminho pode terminar antes do
 * alvo (1 para parar ao lado de alguém). Devolve null sem caminho, e lista vazia já no destino.
 * Função pura: o cliente usa para clicar para andar, e o servidor continua decidindo cada passo.
 */
export function findPath(
  map: CompiledMap,
  from: Tile,
  to: Tile,
  options: { canEnter?: PathRule; stopAt?: number } = {},
): Dir[] | null {
  const { canEnter, stopAt = 0 } = options;
  const width = map.width;
  const index = (x: number, y: number) => y * width + x;
  const distance = (x: number, y: number) => Math.abs(x - to.x) + Math.abs(y - to.y);
  if (distance(from.x, from.y) <= stopAt) return [];
  // Alvo intransitável só serve com stopAt (parar ao lado de uma mesa, por exemplo).
  if (stopAt === 0 && !isWalkable(map, to.x, to.y)) return null;

  const start = index(from.x, from.y);
  const cost = new Map<number, number>([[start, 0]]);
  const came = new Map<number, { prev: number; dir: Dir }>();
  const open = new MinHeap();
  open.push(start, distance(from.x, from.y));

  for (let node = open.pop(); node !== undefined; node = open.pop()) {
    const x = node % width;
    const y = Math.floor(node / width);
    if (distance(x, y) <= stopAt) {
      const path: Dir[] = [];
      for (let step = came.get(node); step; step = came.get(step.prev)) path.push(step.dir);
      return path.reverse();
    }
    const g = cost.get(node) ?? 0;
    for (const dir of DIRS) {
      const [dx, dy] = DIR_DELTA[dir];
      const nx = x + dx;
      const ny = y + dy;
      if (!isWalkable(map, nx, ny) || (canEnter && !canEnter({ x, y }, nx, ny))) continue;
      const next = index(nx, ny);
      const ng = g + 1;
      if (ng >= (cost.get(next) ?? Infinity)) continue;
      cost.set(next, ng);
      came.set(next, { prev: node, dir });
      open.push(next, ng + distance(nx, ny));
    }
  }
  return null;
}
