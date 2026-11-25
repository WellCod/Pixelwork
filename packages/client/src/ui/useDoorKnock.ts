import { KNOCK_TIMEOUT_MS, type ClientMsg } from '@pixelwork/shared';
import { useEffect, useRef, useState } from 'react';
import type { ClientWorld } from '../net/client-world.ts';

/** Compartilha a batida e a resposta entre o botão no mapa e o painel da sala. */
export function useDoorKnock(world: ClientWorld, send: (message: ClientMsg) => void) {
  const [pending, setPending] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = world.subscribe((event) => {
      if (event.type === 'reset' || event.type === 'knockResult') {
        clearTimeout(timer.current);
        setPending(null);
        setResult(event.type === 'reset' ? null : event.allowed ? 'Pode entrar.' : 'Não liberaram a entrada.');
        if (event.type === 'knockResult') timer.current = setTimeout(() => setResult(null), 5_000);
      }
    });
    return () => {
      unsubscribe();
      clearTimeout(timer.current);
    };
  }, [world]);

  function request(zoneKey: string): void {
    if (pending === zoneKey) return;
    clearTimeout(timer.current);
    setResult(null);
    setPending(zoneKey);
    send({ t: 'zone.knock', zoneKey });
    timer.current = setTimeout(() => setPending(null), KNOCK_TIMEOUT_MS + 2_000);
  }

  return { pending, result, request };
}

export type DoorKnock = ReturnType<typeof useDoorKnock>;
