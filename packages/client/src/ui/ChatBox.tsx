import { CHAT_MAX_CHARS, chatRecipients, type ClientMsg } from '@pixelwork/shared';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { focusIsFree, isTyping } from '../input-focus.ts';
import type { ClientWorld } from '../net/client-world.ts';

/** Erros do servidor que dizem respeito ao chat, já com o texto para o usuário. */
const ERRORS: Record<string, string> = {
  chat_rate: 'Devagar: no máximo uma mensagem por segundo.',
  chat_invalid: `A mensagem precisa ter de 1 a ${CHAT_MAX_CHARS} caracteres.`,
};

/** Enter abre o campo; a mensagem vai para quem está perto e some do mapa em alguns segundos. */
export function ChatBox({ world, send }: { world: ClientWorld; send: (message: ClientMsg) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // Atalho global: Enter em qualquer lugar da página abre o campo do chat.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Com foco num botão, Enter é dele (Atender, Salvar, Deixar entrar…).
      if (event.key === 'Enter' && focusIsFree() && !isTyping()) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // O input só existe depois de aberto, então o foco vem num efeito após o render.
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  // Mostra o erro de chat que o servidor devolver (limite de taxa, tamanho inválido).
  useEffect(
    () =>
      world.subscribe((event) => {
        if (event.type === 'error' && event.code in ERRORS) setError(ERRORS[event.code] ?? null);
      }),
    [world],
  );

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (text.trim()) {
      send({ t: 'chat.say', text });
      // A mesma regra do servidor: avisa quando a mensagem não chega a ninguém além de você.
      // A posição própria vem de `world.self` (a prevista localmente), não da lista de jogadores.
      const self = world.selfId ? { id: world.selfId, ...world.self } : null;
      const players = [...world.players.values()].map((player) => (player.id === world.selfId && self ? self : player));
      if (self && chatRecipients(world.map, self, players).length <= 1) {
        setError('Ninguém por perto: só você vê esta mensagem. Chegue mais perto de alguém.');
      }
    }
    setText('');
    setOpen(false);
  };

  if (!open) {
    return (
      <div className="chat-hint">
        Enter para conversar com quem está perto
        {error && <span className="error"> · {error}</span>}
      </div>
    );
  }

  return (
    <form className="chat-box" onSubmit={submit}>
      <input
        ref={input}
        value={text}
        maxLength={CHAT_MAX_CHARS}
        placeholder="Mensagem para quem está perto"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setText('');
            setOpen(false);
            input.current?.blur();
          }
        }}
        onBlur={() => setOpen(false)}
      />
    </form>
  );
}
