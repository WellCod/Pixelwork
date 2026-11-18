// Gerado por scripts/gen-catalog.ts a partir de assets/manifest.json. Não editar.

export const TILESET_IDS = ['floors', 'walls', 'furniture', 'desk-decor'] as const;
export const BODY_IDS = ['base'] as const;
export const HAIR_IDS = ['short', 'long', 'spiky'] as const;
export const OUTFIT_IDS = ['basic', 'hoodie'] as const;
export const ACCESSORY_IDS = ['glasses', 'cap'] as const;
export const DESK_VARIANTS = ['basic', 'dark'] as const;
export const DECOR_ITEMS = ['mug', 'lamp', 'books'] as const;
export const WALL_ITEMS = ['poster', 'clock'] as const;
export const FLOOR_ITEMS = ['plant-small', 'bin'] as const;
export const SKIN_PALETTES = ['light', 'medium', 'dark'] as const;
export const HAIR_PALETTES = ['brown', 'black', 'blond'] as const;
export const OUTFIT_PALETTES = ['blue', 'red', 'green'] as const;

export const RAMPS = {
  "skin": {
    "light": [
      "#b86f50",
      "#c28569",
      "#e8b796",
      "#ead4aa"
    ],
    "medium": [
      "#733e39",
      "#b86f50",
      "#c28569",
      "#e4a672"
    ],
    "dark": [
      "#3e2731",
      "#733e39",
      "#b86f50",
      "#c28569"
    ]
  },
  "hair": {
    "brown": [
      "#3e2731",
      "#733e39",
      "#b86f50",
      "#d77643"
    ],
    "black": [
      "#181425",
      "#262b44",
      "#3a4466",
      "#5a6988"
    ],
    "blond": [
      "#b86f50",
      "#f77622",
      "#feae34",
      "#fee761"
    ]
  },
  "outfit": {
    "blue": [
      "#262b44",
      "#124e89",
      "#0099db",
      "#2ce8f5"
    ],
    "red": [
      "#3e2731",
      "#a22633",
      "#e43b44",
      "#f6757a"
    ],
    "green": [
      "#193c3e",
      "#265c42",
      "#3e8948",
      "#63c74d"
    ]
  }
} as const;

// Metadados dos .tsj: colisão e item_id por índice de tile.
export const TILESETS: Record<TilesetId, { columns: number; tilecount: number; collides: readonly number[]; items: Readonly<Record<number, string>> }> = {
  "floors": {
    "columns": 8,
    "tilecount": 8,
    "collides": [],
    "items": {}
  },
  "walls": {
    "columns": 8,
    "tilecount": 8,
    "collides": [],
    "items": {}
  },
  "furniture": {
    "columns": 8,
    "tilecount": 8,
    "collides": [
      0,
      2,
      3,
      4
    ],
    "items": {
      "0": "desk",
      "1": "chair",
      "2": "plant",
      "3": "sofa",
      "4": "meeting-table",
      "5": "door"
    }
  },
  "desk-decor": {
    "columns": 8,
    "tilecount": 16,
    "collides": [
      0,
      7
    ],
    "items": {
      "0": "basic",
      "1": "monitor-single",
      "2": "monitor-dual",
      "3": "monitor-laptop",
      "4": "mug",
      "5": "poster",
      "6": "plant-small",
      "7": "dark",
      "8": "lamp",
      "9": "books",
      "10": "clock",
      "11": "bin"
    }
  }
};

export const CREDITS = [
  {
    "kind": "tileset",
    "id": "floors",
    "license": "own",
    "author": "Pixelwork",
    "source": null
  },
  {
    "kind": "tileset",
    "id": "walls",
    "license": "own",
    "author": "Pixelwork",
    "source": null
  },
  {
    "kind": "tileset",
    "id": "furniture",
    "license": "own",
    "author": "Pixelwork",
    "source": null
  },
  {
    "kind": "tileset",
    "id": "desk-decor",
    "license": "own",
    "author": "Pixelwork",
    "source": null
  },
  {
    "kind": "character/body",
    "id": "base",
    "license": "own",
    "author": "Pixelwork",
    "source": null
  },
  {
    "kind": "character/hair",
    "id": "short",
    "license": "own",
    "author": "Pixelwork",
    "source": null
  },
  {
    "kind": "character/hair",
    "id": "long",
    "license": "own",
    "author": "Pixelwork",
    "source": null
  },
  {
    "kind": "character/hair",
    "id": "spiky",
    "license": "own",
    "author": "Pixelwork",
    "source": null
  },
  {
    "kind": "character/outfit",
    "id": "basic",
    "license": "own",
    "author": "Pixelwork",
    "source": null
  },
  {
    "kind": "character/outfit",
    "id": "hoodie",
    "license": "own",
    "author": "Pixelwork",
    "source": null
  },
  {
    "kind": "character/accessory",
    "id": "glasses",
    "license": "own",
    "author": "Pixelwork",
    "source": null
  },
  {
    "kind": "character/accessory",
    "id": "cap",
    "license": "own",
    "author": "Pixelwork",
    "source": null
  },
  {
    "kind": "desk/variants",
    "id": "basic",
    "license": "own",
    "author": "Pixelwork",
    "source": null
  },
  {
    "kind": "desk/variants",
    "id": "dark",
    "license": "own",
    "author": "Pixelwork",
    "source": null
  },
  {
    "kind": "desk/decorItems",
    "id": "mug",
    "license": "own",
    "author": "Pixelwork",
    "source": null
  },
  {
    "kind": "desk/decorItems",
    "id": "lamp",
    "license": "own",
    "author": "Pixelwork",
    "source": null
  },
  {
    "kind": "desk/decorItems",
    "id": "books",
    "license": "own",
    "author": "Pixelwork",
    "source": null
  },
  {
    "kind": "desk/wallItems",
    "id": "poster",
    "license": "own",
    "author": "Pixelwork",
    "source": null
  },
  {
    "kind": "desk/wallItems",
    "id": "clock",
    "license": "own",
    "author": "Pixelwork",
    "source": null
  },
  {
    "kind": "desk/floorItems",
    "id": "plant-small",
    "license": "own",
    "author": "Pixelwork",
    "source": null
  },
  {
    "kind": "desk/floorItems",
    "id": "bin",
    "license": "own",
    "author": "Pixelwork",
    "source": null
  }
] as const;

export type TilesetId = (typeof TILESET_IDS)[number];
export type BodyId = (typeof BODY_IDS)[number];
export type HairId = (typeof HAIR_IDS)[number];
export type OutfitId = (typeof OUTFIT_IDS)[number];
export type AccessoryId = (typeof ACCESSORY_IDS)[number];
