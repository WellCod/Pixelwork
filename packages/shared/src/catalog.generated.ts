// Gerado por scripts/gen-catalog.ts a partir de assets/manifest.json. Não editar.

export const TILESET_IDS = ['floors', 'walls', 'furniture', 'desk-decor', 'furniture-2x1'] as const;
export const BODY_IDS = ['base'] as const;
export const HAIR_IDS = ['short', 'long', 'spiky'] as const;
export const OUTFIT_IDS = ['basic', 'hoodie'] as const;
export const ACCESSORY_IDS = ['glasses', 'cap'] as const;
export const DESK_VARIANTS = ['basic', 'dark'] as const;
export const DECOR_ITEMS = ['mug', 'lamp', 'books'] as const;
export const WALL_ITEMS = ['poster', 'clock'] as const;
export const FLOOR_ITEMS = ['plant-small', 'bin'] as const;
export const SKIN_PALETTES = ['light', 'medium', 'dark', 'pale', 'tan', 'deep'] as const;
export const HAIR_PALETTES = ['brown', 'black', 'blond', 'red', 'gray', 'pink', 'blue', 'green'] as const;
export const OUTFIT_PALETTES = ['blue', 'red', 'green', 'purple', 'yellow', 'gray', 'black', 'cream'] as const;

export const RAMPS = {
  "skin": {
    "light": [
      "#9e4539",
      "#cd683d",
      "#fca790",
      "#fdcbb0"
    ],
    "medium": [
      "#7a3045",
      "#9e4539",
      "#cd683d",
      "#e6904e"
    ],
    "dark": [
      "#45293f",
      "#6e2727",
      "#9e4539",
      "#cd683d"
    ],
    "pale": [
      "#966c6c",
      "#fca790",
      "#fdcbb0",
      "#ffffff"
    ],
    "tan": [
      "#9e4539",
      "#cd683d",
      "#e6904e",
      "#fbb954"
    ],
    "deep": [
      "#2e222f",
      "#45293f",
      "#6e2727",
      "#9e4539"
    ]
  },
  "hair": {
    "brown": [
      "#3e3546",
      "#4c3e24",
      "#9e4539",
      "#cd683d"
    ],
    "black": [
      "#2e222f",
      "#3e3546",
      "#625565",
      "#7f708a"
    ],
    "blond": [
      "#cd683d",
      "#e6904e",
      "#fbb954",
      "#fbff86"
    ],
    "red": [
      "#6e2727",
      "#b33831",
      "#ea4f36",
      "#f57d4a"
    ],
    "gray": [
      "#625565",
      "#9babb2",
      "#c7dcd0",
      "#ffffff"
    ],
    "pink": [
      "#a24b6f",
      "#cf657f",
      "#ed8099",
      "#fca790"
    ],
    "blue": [
      "#323353",
      "#484a77",
      "#4d65b4",
      "#4d9be6"
    ],
    "green": [
      "#165a4c",
      "#239063",
      "#1ebc73",
      "#91db69"
    ]
  },
  "outfit": {
    "blue": [
      "#323353",
      "#4d65b4",
      "#4d9be6",
      "#8fd3ff"
    ],
    "red": [
      "#6e2727",
      "#ae2334",
      "#e83b3b",
      "#f68181"
    ],
    "green": [
      "#165a4c",
      "#239063",
      "#91db69",
      "#cddf6c"
    ],
    "purple": [
      "#45293f",
      "#6b3e75",
      "#905ea9",
      "#a884f3"
    ],
    "yellow": [
      "#9e4539",
      "#f79617",
      "#f9c22b",
      "#fbff86"
    ],
    "gray": [
      "#3e3546",
      "#625565",
      "#9babb2",
      "#c7dcd0"
    ],
    "black": [
      "#2e222f",
      "#313638",
      "#3e3546",
      "#625565"
    ],
    "cream": [
      "#966c6c",
      "#ab947a",
      "#fdcbb0",
      "#ffffff"
    ]
  }
} as const;

// Metadados dos .tsj: tamanho da célula, colisão e item_id por índice de tile.
export const TILESETS: Record<TilesetId, { tileWidth: number; tileHeight: number; columns: number; tilecount: number; collides: readonly number[]; items: Readonly<Record<number, string>> }> = {
  "floors": {
    "tileWidth": 16,
    "tileHeight": 16,
    "columns": 8,
    "tilecount": 64,
    "collides": [],
    "items": {}
  },
  "walls": {
    "tileWidth": 16,
    "tileHeight": 16,
    "columns": 8,
    "tilecount": 16,
    "collides": [],
    "items": {}
  },
  "furniture": {
    "tileWidth": 16,
    "tileHeight": 16,
    "columns": 8,
    "tilecount": 40,
    "collides": [
      0,
      2,
      3,
      4,
      6,
      7,
      8,
      9,
      11,
      16,
      17,
      18,
      19,
      20,
      21,
      22,
      23,
      24,
      25,
      26,
      27,
      28,
      29,
      30,
      32
    ],
    "items": {
      "0": "desk",
      "1": "chair",
      "2": "plant",
      "3": "sofa",
      "4": "meeting-table",
      "5": "door",
      "6": "bookshelf",
      "7": "water-cooler",
      "8": "coffee-machine",
      "9": "armchair",
      "10": "rug",
      "11": "plant-tall",
      "12": "chair-back",
      "13": "chair-left",
      "14": "chair-right",
      "15": "kitchen-chair",
      "16": "beanbag-blue",
      "17": "beanbag-pink",
      "18": "beanbag-yellow",
      "19": "cactus",
      "20": "monstera",
      "21": "snake-plant",
      "22": "flowers",
      "23": "ficus",
      "24": "succulent",
      "25": "floor-lamp",
      "26": "trash-bin",
      "27": "printer",
      "28": "coat-rack",
      "29": "fire-extinguisher",
      "30": "cardboard-box",
      "31": "bar-stool",
      "32": "side-table"
    }
  },
  "desk-decor": {
    "tileWidth": 16,
    "tileHeight": 16,
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
  },
  "furniture-2x1": {
    "tileWidth": 32,
    "tileHeight": 16,
    "columns": 8,
    "tilecount": 8,
    "collides": [
      0,
      1
    ],
    "items": {
      "0": "sofa-peach",
      "1": "sofa-sage"
    }
  }
};

export interface Credit {
  kind: string;
  id: string;
  license: 'own' | 'CC0' | 'CC-BY';
  author: string;
  source: string | null;
}

export const CREDITS: readonly Credit[] = [
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
    "kind": "tileset",
    "id": "furniture-2x1",
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
];

export type TilesetId = (typeof TILESET_IDS)[number];
export type BodyId = (typeof BODY_IDS)[number];
export type HairId = (typeof HAIR_IDS)[number];
export type OutfitId = (typeof OUTFIT_IDS)[number];
export type AccessoryId = (typeof ACCESSORY_IDS)[number];
