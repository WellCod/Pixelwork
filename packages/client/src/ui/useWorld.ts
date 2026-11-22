import { useSyncExternalStore } from 'react';
import type { ClientWorld } from '../net/client-world.ts';

/** Re-renderiza o componente a cada evento do mundo. */
export function useWorld(world: ClientWorld): ClientWorld {
  useSyncExternalStore(
    (onChange) => world.subscribe(onChange),
    () => world.version,
  );
  return world;
}

const MESSAGES: Record<string, string> = {
  not_on_chair: 'Vá até a cadeira da mesa para ocupá-la.',
  desk_taken: 'Esta mesa já tem dono.',
  already_has_desk: 'Você já tem uma mesa neste coworking. Libere a sua antes.',
  not_owner: 'Só o dono da mesa (ou um admin) pode fazer isso.',
  admin_only: 'Só admins podem fazer isso.',
  last_admin: 'O coworking precisa de pelo menos um admin. Promova outra pessoa antes de sair.',
  rate_limited: 'Muitas tentativas seguidas. Espere um minuto e tente de novo.',
  invalid_body: 'Confira os campos: algum valor não é aceito.',
};

export function errorMessage(error: unknown): string {
  const code = (error as { code?: unknown }).code;
  return (typeof code === 'string' && MESSAGES[code]) || 'Não deu certo. Tente de novo.';
}
