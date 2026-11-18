import { useEffect, useRef } from 'react';
import { createGame } from './game/createGame.ts';

export function App() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    const game = createGame(container.current);
    return () => {
      game.destroy(true);
    };
  }, []);

  return (
    <main className="app">
      <div ref={container} className="game" />
    </main>
  );
}
