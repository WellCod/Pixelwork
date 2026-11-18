import { CHAT_MAX_CHARS, type ClientMsg } from '@pixelwork/shared';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import type { ClientWorld } from '../net/client-world.ts';

const ERRORS: Record<string, string> = {
  chat_rate: 'Devagar: no máximo uma mensagem por segundo.',
  chat_invalid: `A mensagem precisa ter de 1 a ${CHAT_MAX_CHARS} caracteres.`,
};

/** Enter abre o campo; a mensagem vai para quem está perto e some do mapa em alguns segundos. */
export function ChatBox({ world, send }: { world: ClientWorld; send: (msg: ClientMsg) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement;
      if (e.key === 'Enter' && !typing) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  useEffect(
    () =>
      world.subscribe((event) => {
        if (event.type === 'error' && event.code in ERRORS) setError(ERRORS[event.code] ?? null);
      }),
    [world],
  );

  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (text.trim()) send({ t: 'chat.say', text });
    setText('');
    setError(null);
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
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
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
