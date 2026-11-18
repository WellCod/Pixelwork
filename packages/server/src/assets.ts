import { join } from 'node:path';

/** Pasta assets/ da raiz do repositório (tilesets, personagens, manifesto). */
export const ASSETS_DIR = join(import.meta.dirname, '../../../assets');
