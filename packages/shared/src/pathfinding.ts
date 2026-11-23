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
    // Sobe o item novo enquanto ele tiver prioridade menor que a do pai (filhos de i: 2i+1 e 2i+2).
    let i = items.length - 1;
    while (i > 0) {
      const parentIndex = (i - 1) >> 1;
      const parent = items[parentIndex];
      const child = items[i];
      if (!parent || !child || parent.priority <= child.priority) break;
      items[parentIndex] = child;
      items[i] = parent;
      i = parentIndex;
    }
  }

  pop(): number | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (!top || !last) return undefined;
    if (items.length > 0) {
      // O último vai para a raiz e desce trocando com o menor filho até a ordem do heap voltar.
      items[0] = last;
      let i = 0;
      for (;;) {
        const leftIndex = 2 * i + 1;
        const rightIndex = leftIndex + 1;
        let smallest = i;
        if ((items[leftIndex]?.priority ?? Infinity) < (items[smallest]?.priority ?? Infinity)) smallest = leftIndex;
        if ((items[rightIndex]?.priority ?? Infinity) < (items[smallest]?.priority ?? Infinity)) smallest = rightIndex;
        if (smallest === i) break;
        const current = items[i];
        const smallestChild = items[smallest];
        if (!current || !smallestChild) break;
        items[i] = smallestChild;
        items[smallest] = current;
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
  // Cada tile vira um número (y * width + x) para caber em Map e no heap sem alocar objeto.
  const index = (x: number, y: number) => y * width + x;
  // Manhattan até o alvo: heurística admissível com passos de 4 direções e custo 1.
  const distance = (x: number, y: number) => Math.abs(x - to.x) + Math.abs(y - to.y);
  if (distance(from.x, from.y) <= stopAt) return [];
  // Alvo intransitável só serve com stopAt (parar ao lado de uma mesa, por exemplo).
  if (stopAt === 0 && !isWalkable(map, to.x, to.y)) return null;

  const start = index(from.x, from.y);
  /** Custo conhecido (passos desde a origem) de cada tile já alcançado: o `g` do A*. */
  const cost = new Map<number, number>([[start, 0]]);
  /** De onde se chegou a cada tile e com que direção, para remontar o caminho no fim. */
  const came = new Map<number, { prev: number; dir: Dir }>();
  const open = new MinHeap();
  open.push(start, distance(from.x, from.y));

  for (let node = open.pop(); node !== undefined; node = open.pop()) {
    const x = node % width;
    const y = Math.floor(node / width);
    if (distance(x, y) <= stopAt) {
      // Volta pelos predecessores até a origem e inverte para ter a ordem de andar.
      const path: Dir[] = [];
      for (let cameFrom = came.get(node); cameFrom; cameFrom = came.get(cameFrom.prev)) path.push(cameFrom.dir);
      return path.reverse();
    }
    const nodeCost = cost.get(node) ?? 0;
    for (const dir of DIRS) {
      const [dx, dy] = DIR_DELTA[dir];
      const neighborX = x + dx;
      const neighborY = y + dy;
      if (!isWalkable(map, neighborX, neighborY) || (canEnter && !canEnter({ x, y }, neighborX, neighborY))) continue;
      const neighbor = index(neighborX, neighborY);
      const neighborCost = nodeCost + 1;
      // Só reabre o vizinho quando este caminho é mais curto que o já conhecido.
      if (neighborCost >= (cost.get(neighbor) ?? Infinity)) continue;
      cost.set(neighbor, neighborCost);
      came.set(neighbor, { prev: node, dir });
      open.push(neighbor, neighborCost + distance(neighborX, neighborY));
    }
  }
  return null;
}
