import { z } from 'zod';
import { normalizeHex } from './palette.ts';

// CC-BY-SA, GPL, NC e sem permissão de redistribuição ficam de fora (docs/art.md, seção 7).
const License = z.enum(['own', 'CC0', 'CC-BY']);

const Id = z.string().regex(/^[a-z0-9-]{1,40}$/, 'id deve ser [a-z0-9-]{1,40}');

const Asset = z.object({
  id: Id,
  license: License,
  author: z.string().min(1),
  source: z.url().nullable(),
});
type Asset = z.infer<typeof Asset>;

export const Manifest = z.object({
  tilesets: z.array(Asset),
  characters: z.object({
    body: z.array(Asset),
    hair: z.array(Asset),
    outfit: z.array(Asset),
    accessory: z.array(Asset),
  }),
  deskDecor: z.object({
    variants: z.array(Asset),
    decorItems: z.array(Asset),
    wallItems: z.array(Asset),
    floorItems: z.array(Asset),
  }),
});
export type Manifest = z.infer<typeof Manifest>;

const Ramps = z.record(Id, z.array(z.string()).length(4));
export type Ramps = z.infer<typeof Ramps>;

export interface CatalogInput {
  manifest: unknown;
  ramps: { skin: unknown; hair: unknown; outfit: unknown };
  palette: ReadonlySet<string>;
  /** Caminho relativo a `assets/`. */
  fileExists: (path: string) => boolean;
  /** Conteúdo do `.tsj` do tileset, já lido como JSON. */
  readTileset: (id: string) => unknown;
}

const Tsj = z.object({
  // Célula de 16 px (pisos, paredes, móveis pequenos) ou maior para móveis de várias células.
  tilewidth: z.union([z.literal(16), z.literal(32), z.literal(48)]),
  tileheight: z.union([z.literal(16), z.literal(32), z.literal(48)]),
  columns: z.number().int().positive(),
  tilecount: z.number().int().positive(),
  tiles: z
    .array(
      z.object({
        id: z.number().int().nonnegative(),
        properties: z
          .array(z.object({ name: z.string(), type: z.string(), value: z.unknown() }))
          .optional(),
      }),
    )
    .optional(),
});

interface TilesetMeta {
  tileWidth: number;
  tileHeight: number;
  columns: number;
  tilecount: number;
  collides: number[];
  items: Record<number, string>;
}

function tilesetMeta(tsj: z.infer<typeof Tsj>): TilesetMeta {
  const meta: TilesetMeta = {
    tileWidth: tsj.tilewidth,
    tileHeight: tsj.tileheight,
    columns: tsj.columns,
    tilecount: tsj.tilecount,
    collides: [],
    items: {},
  };
  for (const tile of tsj.tiles ?? []) {
    for (const prop of tile.properties ?? []) {
      if (prop.name === 'collides' && prop.value === true) meta.collides.push(tile.id);
      if (prop.name === 'item_id' && typeof prop.value === 'string') meta.items[tile.id] = prop.value;
    }
  }
  return meta;
}

export class CatalogError extends Error {
  constructor(readonly problems: string[]) {
    super(`catálogo inválido:\n${problems.map((p) => `- ${p}`).join('\n')}`);
  }
}

function zodProblems(prefix: string, error: z.ZodError): string[] {
  return error.issues.map((issue) => `${prefix}.${issue.path.join('.')}: ${issue.message}`);
}

function duplicates(prefix: string, assets: readonly Asset[]): string[] {
  const seen = new Set<string>();
  const problems: string[] = [];
  for (const { id } of assets) {
    if (seen.has(id)) problems.push(`${prefix}: id repetido "${id}"`);
    seen.add(id);
  }
  return problems;
}

function list(name: string, ids: readonly string[]): string {
  return `export const ${name} = [${ids.map((id) => `'${id}'`).join(', ')}] as const;\n`;
}

/** Valida manifesto e rampas e devolve o código de `catalog.generated.ts`. */
export function buildCatalog(input: CatalogInput): string {
  const problems: string[] = [];

  const manifest = Manifest.safeParse(input.manifest);
  if (!manifest.success) problems.push(...zodProblems('manifest', manifest.error));

  const ramps: Record<string, Ramps> = {};
  for (const [kind, raw] of Object.entries(input.ramps)) {
    const parsed = Ramps.safeParse(raw);
    if (!parsed.success) {
      problems.push(...zodProblems(`palettes/${kind}.json`, parsed.error));
      continue;
    }
    if (Object.keys(parsed.data).length === 0) problems.push(`palettes/${kind}.json: nenhuma rampa`);
    for (const [id, colors] of Object.entries(parsed.data)) {
      colors.forEach((color, i) => {
        let hex: string;
        try {
          hex = normalizeHex(color);
        } catch {
          problems.push(`palettes/${kind}.json: ${id}[${i}] cor inválida "${color}"`);
          return;
        }
        if (!input.palette.has(hex)) {
          problems.push(`palettes/${kind}.json: ${id}[${i}] ${hex} fora da paleta`);
        }
        colors[i] = hex;
      });
    }
    ramps[kind] = parsed.data;
  }

  if (!manifest.success) throw new CatalogError(problems);
  const { tilesets, characters, deskDecor } = manifest.data;

  problems.push(...duplicates('tilesets', tilesets));
  const tilesetMetas: Record<string, TilesetMeta> = {};
  for (const t of tilesets) {
    const missing = [`tilesets/${t.id}.png`, `tilesets/${t.id}.tsj`].filter(
      (file) => !input.fileExists(file),
    );
    for (const file of missing) problems.push(`tilesets: arquivo ausente ${file}`);
    if (missing.length > 0) continue;
    const tsj = Tsj.safeParse(input.readTileset(t.id));
    if (tsj.success) tilesetMetas[t.id] = tilesetMeta(tsj.data);
    else problems.push(...zodProblems(`tilesets/${t.id}.tsj`, tsj.error));
  }
  for (const [layer, assets] of Object.entries(characters)) {
    problems.push(...duplicates(`characters.${layer}`, assets));
    for (const a of assets) {
      const file = `characters/${layer}/${a.id}.png`;
      if (!input.fileExists(file)) problems.push(`characters.${layer}: arquivo ausente ${file}`);
    }
  }
  for (const [group, assets] of Object.entries(deskDecor)) {
    problems.push(...duplicates(`deskDecor.${group}`, assets));
  }
  if (characters.body.length === 0) problems.push('characters.body: nenhum corpo');
  if (characters.outfit.length === 0) problems.push('characters.outfit: nenhuma roupa');

  if (problems.length > 0) throw new CatalogError(problems);

  const ids = (assets: readonly Asset[]) => assets.map((a) => a.id);
  const rampIds = (kind: string) => Object.keys(ramps[kind] ?? {});
  const credits = [
    ...tilesets.map((a) => ({ kind: 'tileset', ...a })),
    ...Object.entries(characters).flatMap(([layer, assets]) =>
      assets.map((a) => ({ kind: `character/${layer}`, ...a })),
    ),
    ...Object.entries(deskDecor).flatMap(([group, assets]) =>
      assets.map((a) => ({ kind: `desk/${group}`, ...a })),
    ),
  ];

  return [
    '// Gerado por scripts/gen-catalog.ts a partir de assets/manifest.json. Não editar.\n\n',
    list('TILESET_IDS', ids(tilesets)),
    list('BODY_IDS', ids(characters.body)),
    list('HAIR_IDS', ids(characters.hair)),
    list('OUTFIT_IDS', ids(characters.outfit)),
    list('ACCESSORY_IDS', ids(characters.accessory)),
    list('DESK_VARIANTS', ids(deskDecor.variants)),
    list('DECOR_ITEMS', ids(deskDecor.decorItems)),
    list('WALL_ITEMS', ids(deskDecor.wallItems)),
    list('FLOOR_ITEMS', ids(deskDecor.floorItems)),
    list('SKIN_PALETTES', rampIds('skin')),
    list('HAIR_PALETTES', rampIds('hair')),
    list('OUTFIT_PALETTES', rampIds('outfit')),
    '\n',
    `export const RAMPS = ${JSON.stringify(ramps, null, 2)} as const;\n\n`,
    '// Metadados dos .tsj: tamanho da célula, colisão e item_id por índice de tile.\n',
    `export const TILESETS: Record<TilesetId, { tileWidth: number; tileHeight: number; columns: number; tilecount: number; collides: readonly number[]; items: Readonly<Record<number, string>> }> = ${JSON.stringify(tilesetMetas, null, 2)};\n\n`,
    "export interface Credit {\n  kind: string;\n  id: string;\n  license: 'own' | 'CC0' | 'CC-BY';\n  author: string;\n  source: string | null;\n}\n\n",
    `export const CREDITS: readonly Credit[] = ${JSON.stringify(credits, null, 2)};\n\n`,
    'export type TilesetId = (typeof TILESET_IDS)[number];\n',
    'export type BodyId = (typeof BODY_IDS)[number];\n',
    'export type HairId = (typeof HAIR_IDS)[number];\n',
    'export type OutfitId = (typeof OUTFIT_IDS)[number];\n',
    'export type AccessoryId = (typeof ACCESSORY_IDS)[number];\n',
  ].join('');
}
