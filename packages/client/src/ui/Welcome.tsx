import { useState } from 'react';

/** Cada modo de entrada apresenta as próprias instruções na primeira visita. */
function storageKey(): string {
  return matchMedia('(pointer: coarse)').matches ? 'pixelwork.welcome.touch.v1' : 'pixelwork.welcome.v1';
}

function welcomeSeen(): boolean {
  try {
    return localStorage.getItem(storageKey()) === '1';
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
      localStorage.setItem(storageKey(), '1');
    } catch {
      // Navegação privada: o card volta na próxima visita.
    }
  };

  return (
    <section className="hud-card welcome" aria-label="Como usar">
      <h2>Como usar</h2>
      <ul>
        <li className="keyboard-only">
          Use <kbd>WASD</kbd> ou as setas para andar. Você também pode clicar no chão.
        </li>
        <li className="touch-only">
          Toque no chão para andar.<span className="welcome-map"> Use <strong>Mapa</strong> para escolher um destino.</span>
        </li>
        <li className="touch-only">Toque em um móvel interativo para se aproximar e ver as ações de sentar ou jogar.</li>
        <li>Chegue perto de alguém para ouvir e falar.</li>
        <li className="keyboard-only"><kbd>Enter</kbd> abre o chat com quem está por perto.</li>
        <li className="touch-only">Toque em <strong>Conversar</strong> para escrever a quem está perto.</li>
        <li className="keyboard-only">Salas de reunião são privadas. Quem está dentro pode trancar a porta.</li>
        <li className="keyboard-only">Sente na cadeira de uma mesa livre para ocupá-la, decorar e fazer chamadas.</li>
      </ul>
      <button type="button" className="primary" onClick={dismiss}>
        Entendi
      </button>
    </section>
  );
}
