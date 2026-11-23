import { CREDITS } from '@pixelwork/shared';

/** Título de cada seção pelo tipo de asset do catálogo; tipo sem rótulo aparece cru. */
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
  // Agrupa os créditos por tipo, mantendo a ordem em que aparecem no catálogo.
  const creditsByKind = new Map<string, (typeof CREDITS)[number][]>();
  for (const credit of CREDITS) creditsByKind.set(credit.kind, [...(creditsByKind.get(credit.kind) ?? []), credit]);

  return (
    <main className="credits">
      <h1>Créditos</h1>
      <p>
        Arte usada no Pixelwork. Só entram no projeto assets próprios, CC0 ou CC-BY, que podem ser
        redistribuídos.
      </p>
      {[...creditsByKind].map(([kind, credits]) => (
        <section key={kind}>
          <h2>{KIND_LABEL[kind] ?? kind}</h2>
          <ul>
            {credits.map((credit) => (
              <li key={credit.id}>
                <strong>{credit.id}</strong>: {credit.author}, {credit.license}
                {credit.source && (
                  <>
                    {' '}
                    (<a href={credit.source}>origem</a>)
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section>
        <h2>Fonte</h2>
        <ul>
          <li>
            {/* Não é asset do catálogo (vem por dependência), mas a licença pede o crédito. */}
            <strong>Inter</strong>: Rasmus Andersson, SIL Open Font License 1.1 (
            <a href="https://github.com/rsms/inter">origem</a>)
          </li>
        </ul>
      </section>
      <a href="/">Voltar</a>
    </main>
  );
}
