// Resurrect 64 (lospec.com/palette-list/resurrect-64) por nome, agrupada em rampas do escuro ao
// claro, mais os tons extras (docs/art.md, seção 2). A arte usa estes nomes nas legendas dos
// sprites, nunca o hex direto.
export const RESURRECT = {
  ink: '#2e222f', shadow: '#3e3546', dusk: '#625565', rosewood: '#966c6c', taupe: '#ab947a',
  plum: '#694f62', mauve: '#7f708a', gray: '#9babb2', mist: '#c7dcd0', white: '#ffffff',
  maroon: '#6e2727', brick: '#b33831', vermilion: '#ea4f36', coral: '#f57d4a',
  crimson: '#ae2334', red: '#e83b3b', orange: '#fb6b1d', amber: '#f79617', gold: '#f9c22b',
  wine: '#7a3045', rust: '#9e4539', clay: '#cd683d', tan: '#e6904e', honey: '#fbb954',
  bark: '#4c3e24', olive: '#676633', moss: '#a2a947', lime: '#d5e04b', lemon: '#fbff86',
  pine: '#165a4c', green: '#239063', emerald: '#1ebc73', leaf: '#91db69', sprout: '#cddf6c',
  charcoal: '#313638', slate: '#374e4a', fern: '#547e64', sage: '#92a984', celery: '#b2ba90',
  deepteal: '#0b5e65', teal: '#0b8a8f', aqua: '#0eaf9b', mint: '#30e1b9', seafoam: '#8ff8e2',
  navy: '#323353', indigo: '#484a77', blue: '#4d65b4', sky: '#4d9be6', ice: '#8fd3ff',
  grape: '#45293f', violet: '#6b3e75', purple: '#905ea9', lavender: '#a884f3', lilac: '#eaaded',
  berry: '#753c54', magenta: '#a24b6f', rose: '#cf657f', pink: '#ed8099',
  raspberry: '#831c5d', cherry: '#c32454', hotpink: '#f04f78', salmon: '#f68181', peach: '#fca790',
  cream: '#fdcbb0',
} as const;

/** Madeira clara neutra: a Resurrect 64 não tem bege, e o creme dela (pêssego) deixava o piso rosado. */
export const EXTRAS = { oakLight: '#f3e2c7', oak: '#e6cba5', oakSeam: '#d2b086' } as const;

export const PALETTE = { ...RESURRECT, ...EXTRAS } as const;

export type ColorName = keyof typeof PALETTE;

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/** Cor da Resurrect 64 mais próxima em RGB; usada para levar a arte antiga para a paleta nova. */
export function nearest(hex: string): string {
  const [r, g, b] = rgb(hex.toLowerCase());
  let best: string = PALETTE.ink;
  let bestDistance = Infinity;
  for (const candidate of Object.values(RESURRECT)) {
    const [cr, cg, cb] = rgb(candidate);
    const distance = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}
