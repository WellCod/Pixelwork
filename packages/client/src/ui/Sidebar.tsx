import { isSingleEmoji, type Player, type Status } from '@pixelwork/shared';
import { useState, type SubmitEvent } from 'react';
import { orgApi, profileApi } from '../api.ts';
import { seatedFacing } from '../game/presence.ts';
import type { CallStore } from '../net/call-store.ts';
import type { ClientWorld } from '../net/client-world.ts';
import { useCalls } from './CallUi.tsx';
import { AvatarEditor } from './AvatarEditor.tsx';
import { AvatarPreview } from './AvatarPreview.tsx';
import { errorMessage, useWorld } from './useWorld.ts';

const STATUS_LABEL: Record<Status, string> = {
  available: 'Disponível',
  focus: 'Focado',
  away: 'Ausente',
};

interface SidebarProps {
  world: ClientWorld;
  spaceId: string;
  calls: CallStore;
  isAdmin: boolean;
}

export function Sidebar({ world, spaceId, calls, isAdmin }: SidebarProps) {
  useWorld(world);
  useCalls(calls);
  // Chamada só sai da própria mesa (o servidor confere de novo).
  const seated =
    world.selfId !== null && seatedFacing(world.map, world.desks, world.selfId, world.self.x, world.self.y) !== null;
  const canCall = (p: Player) =>
    seated && p.id !== world.selfId && p.activity !== 'call' && calls.state.kind === 'idle';
  const me = world.selfId ? world.players.get(world.selfId) : undefined;
  const people = [...world.players.values()].sort(
    (a, b) => Number(b.id === world.selfId) - Number(a.id === world.selfId) || a.name.localeCompare(b.name),
  );

  return (
    <aside className="sidebar">
      {me && <MePanel key={me.id} me={me} spaceId={spaceId} />}
      <section>
        <h3>Pessoas ({people.length})</h3>
        <ul className="people">
          {people.map((p) => (
            <li key={p.id}>
              <span className={`dot dot-${p.status}`} title={STATUS_LABEL[p.status]} />
              <div>
                <div className="person-name">
                  {p.name}
                  {p.statusEmoji && <span className="emoji"> {p.statusEmoji}</span>}
                  {p.id === world.selfId && <span className="you"> (você)</span>}
                </div>
                {p.title && <div className="person-title">{p.title}</div>}
                {p.statusText && <div className="person-status">{p.statusText}</div>}
                {p.activity !== 'idle' && (
                  <div className="person-status">{p.activity === 'call' ? 'Em chamada' : 'Em reunião'}</div>
                )}
              </div>
              {isAdmin && p.id !== world.selfId && (
                <button
                  type="button"
                  className="call-button"
                  onClick={() => {
                    if (confirm(`Remover ${p.name} deste coworking?`)) void orgApi.removeMember(spaceId, p.id);
                  }}
                >
                  Remover
                </button>
              )}
              {canCall(p) && (
                <button type="button" className="call-button" onClick={() => calls.call(p.id)}>
                  Ligar
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

function MePanel({ me, spaceId }: { me: Player; spaceId: string }) {
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [name, setName] = useState(me.name);
  const [title, setTitle] = useState(me.title ?? '');
  const [status, setStatus] = useState<Status>(me.status);
  const [text, setText] = useState(me.statusText ?? '');
  const [emoji, setEmoji] = useState(me.statusEmoji ?? '');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const emojiInvalid = emoji !== '' && !isSingleEmoji(emoji);

  const run = (task: Promise<unknown>, ok: string) => {
    task
      .then(() => setMessage({ kind: 'ok', text: ok }))
      .catch((e: unknown) => setMessage({ kind: 'error', text: errorMessage(e) }));
  };

  const saveProfile = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const tasks: Promise<unknown>[] = [];
    if (name.trim() !== me.name) tasks.push(profileApi.setName(name));
    if ((title.trim() || null) !== me.title) tasks.push(profileApi.setTitle(spaceId, title));
    run(Promise.all(tasks), 'Perfil salvo.');
  };

  const saveStatus = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (emojiInvalid) return;
    run(profileApi.setStatus(spaceId, { status, text, emoji }), 'Status salvo.');
  };

  return (
    <section className="me">
      <div className="me-header">
        <AvatarPreview spec={me.avatar} scale={2} />
        <button type="button" onClick={() => setEditingAvatar(true)}>
          Editar avatar
        </button>
      </div>

      <form onSubmit={saveProfile} className="fields">
        <label>
          Nome
          <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Cargo neste coworking
          <input value={title} maxLength={40} placeholder="ex.: Designer" onChange={(e) => setTitle(e.target.value)} />
        </label>
        <button type="submit">Salvar perfil</button>
      </form>

      <form onSubmit={saveStatus} className="fields">
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <div className="row">
          <label className="emoji-field">
            Emoji
            <input
              value={emoji}
              placeholder="🙂"
              aria-invalid={emojiInvalid}
              onChange={(e) => setEmoji(e.target.value)}
            />
          </label>
          <label className="grow">
            Texto
            <input value={text} maxLength={80} placeholder="Em reunião até 15h" onChange={(e) => setText(e.target.value)} />
          </label>
        </div>
        {emojiInvalid && <p className="error">Use um emoji só.</p>}
        <button type="submit" disabled={emojiInvalid}>
          Salvar status
        </button>
      </form>

      {message && <p className={message.kind === 'ok' ? 'ok' : 'error'}>{message.text}</p>}
      <button
        type="button"
        className="link-button"
        onClick={() => {
          // A saída chega pelo tempo real (conexão fechada com o código de removido).
          if (confirm('Sair deste coworking? Sua mesa fica livre.')) run(orgApi.removeMember(spaceId, me.id), '');
        }}
      >
        Sair do coworking
      </button>
      {editingAvatar && <AvatarEditor initial={me.avatar} onClose={() => setEditingAvatar(false)} />}
    </section>
  );
}
