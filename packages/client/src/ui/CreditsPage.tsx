import { CREDITS } from '@pixelwork/shared';

const KIND_LABEL: Record<string, string> = {
  tileset: 'Tilesets',
  'character/body': 'Personagem: corpo',
  'character/hair': 'Personagem: cabelo',
  'character/outfit': 'Personagem: roupa',
  'character/accessory': 'Personagem: acessório',
  'desk/variants': 'Mesa: variações',
  'desk/decorItems': 'Mesa: itens',
  'desk/wallItems': 'Mesa: parede',
  'desk/floorItems': 'Mesa: chão',
};

/** Gerada do catálogo, a mesma fonte do CREDITS.txt do export. */
export function CreditsPage() {
  const groups = new Map<string, (typeof CREDITS)[number][]>();
  for (const credit of CREDITS) groups.set(credit.kind, [...(groups.get(credit.kind) ?? []), credit]);

  return (
    <main className="credits">
      <h1>Créditos</h1>
      <p>
        Arte usada no Pixelwork. Só entram no projeto assets próprios, CC0 ou CC-BY, que podem ser
        redistribuídos.
      </p>
      {[...groups].map(([kind, credits]) => (
        <section key={kind}>
          <h2>{KIND_LABEL[kind] ?? kind}</h2>
          <ul>
            {credits.map((c) => (
              <li key={c.id}>
                <strong>{c.id}</strong>: {c.author}, {c.license}
                {c.source && (
                  <>
                    {' '}
                    (<a href={c.source}>origem</a>)
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <a href="/">Voltar</a>
    </main>
  );
}
