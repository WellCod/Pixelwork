const THEMES = [
  { key: 'halloween', label: 'Halloween' },
  { key: 'christmas', label: 'Natal' },
  { key: 'grinch', label: 'Grinch' },
  { key: 'new-year', label: 'Ano Novo' },
] as const;

export const COLLECTIONS = [{ key: 'default', label: 'Padrão' }, ...THEMES] as const;
export type CustomizationCollection = (typeof COLLECTIONS)[number]['key'];

/** O prefixo do ID no catálogo indica a coleção. IDs sem prefixo temático são padrão. */
export function collectionItems<Item extends string>(items: readonly Item[], collection: CustomizationCollection): Item[] {
  return items.filter((item) => {
    const theme = THEMES.find(({ key }) => item.startsWith(`${key}-`));
    return (theme?.key ?? 'default') === collection;
  });
}
