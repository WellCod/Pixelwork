import { useState } from 'react';

/** Chave do localStorage que marca o card de boas-vindas como visto. */
const KEY = 'pixelwork.welcome.v1';

function welcomeSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Primeira visita: os comandos que não dá para adivinhar olhando a tela. */
export function Welcome() {
  const [open, setOpen] = useState(() => !welcomeSeen());
  if (!open) return null;

  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // Navegação privada: o card volta na próxima visita.
    }
  };

  return (
    <section className="hud-card welcome" aria-label="Como usar">
      <h2>Como usar</h2>
      <ul>
        <li>
          <kbd>WASD</kbd> ou setas para andar. Clique no mapa se o teclado não responder.
        </li>
        <li>Chegue perto de alguém para ouvir e falar. Quanto mais perto, mais alto.</li>
        <li>
          <kbd>Enter</kbd> abre o chat com quem está por perto.
        </li>
        <li>Salas de reunião são privadas: quem está dentro pode trancar a porta.</li>
        <li>Sente na cadeira de uma mesa livre para ocupá-la, decorar e fazer chamadas.</li>
      </ul>
      <button type="button" className="primary" onClick={dismiss}>
        Entendi
      </button>
    </section>
  );
}
