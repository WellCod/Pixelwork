import aurora from '../assets/office-preview/aurora.png';
import lounge from '../assets/office-preview/lounge.png';
import games from '../assets/office-preview/jogos.png';
import './entry-page.css';

const rooms = [
  { id: 'aurora', name: 'Sala Aurora', source: aurora, alt: 'Sala de reunião com mesa de dez lugares sobre um tapete coral' },
  { id: 'lounge', name: 'Lounge', source: lounge, alt: 'Sofás e mesa de centro sobre um tapete lavanda' },
  { id: 'games', name: 'Área de jogos', source: games, alt: 'Mesas de pingue-pongue e pebolim sobre um tapete verde' },
] as const;

export function EntryPage({ enterAsGuest, githubEnabled, invitePending, error }: {
  enterAsGuest: () => void;
  githubEnabled: boolean;
  invitePending: boolean;
  error: string | undefined;
}) {
  return (
    <div className="entry-page">
      <header className="entry-header">
        <a href="/" className="entry-brand"><span aria-hidden="true" />Pixelwork</a>
        <a className="entry-credits" href="/creditos">Créditos</a>
      </header>
      <main className="entry-layout">
        <div className="entry-intro">
          <h1>Seu escritório <span>em pixel art.</span></h1>
          <p>Explore o escritório, converse por voz e vídeo e jogue com quem estiver por perto.</p>
          {invitePending && <p className="entry-invite">Entre para aceitar o convite.</p>}
          <div className="entry-actions">
            <button type="button" className="primary" onClick={enterAsGuest}>Entrar como convidado</button>
            {githubEnabled && <a className="button entry-github" href="/auth/github">Entrar com GitHub</a>}
          </div>
          {error && <p className="error" role="alert">{error}</p>}
        </div>
        <section className="entry-preview" aria-label="Prévia do escritório">
          {rooms.map(({ id, name, source, alt }) => (
            <figure className={`entry-room entry-room-${id}`} key={id}>
              <img src={source} alt={alt} />
              <figcaption>{name}</figcaption>
            </figure>
          ))}
        </section>
      </main>
    </div>
  );
}
