import { isSingleEmoji, type Player, type Status } from '@pixelwork/shared';
import { useState, type SubmitEvent } from 'react';
import { orgApi, profileApi } from '../api.ts';
import { seatedFacing } from '../game/presence.ts';
import type { CallStore } from '../net/call-store.ts';
import type { ClientWorld } from '../net/client-world.ts';
import { useCalls } from './CallUi.tsx';
import { AvatarEditor } from './AvatarEditor.tsx';
import { AvatarPreview } from './AvatarPreview.tsx';
import { PhoneIcon, MicIcon } from './icons.tsx';
import { useMedia } from './MediaControls.tsx';
import { errorMessage, useWorld } from './useWorld.ts';
import type { MediaManager } from '../media/media-manager.ts';

const STATUS_LABEL: Record<Status, string> = {
  available: 'Disponível',
  focus: 'Focado',
  away: 'Ausente',
};

interface SidebarProps {
  world: ClientWorld;
  media: MediaManager;
  spaceId: string;
  calls: CallStore;
  isAdmin: boolean;
}

export function Sidebar({ world, media, spaceId, calls, isAdmin }: SidebarProps) {
  useWorld(world);
  useCalls(calls);
  useMedia(media);
  const [error, setError] = useState<string | null>(null);
  // Chamada só sai da própria mesa (o servidor confere de novo).
  const seated =
    world.selfId !== null && seatedFacing(world.map, world.desks, world.selfId, world.self.x, world.self.y) !== null;
  const callable = (p: Player) => p.id !== world.selfId && p.activity !== 'call' && calls.state.kind === 'idle';
  const me = world.selfId ? world.players.get(world.selfId) : undefined;
  const people = [...world.players.values()].sort(
    (a, b) => Number(b.id === world.selfId) - Number(a.id === world.selfId) || a.name.localeCompare(b.name),
  );

  const remove = (p: Player) => {
    if (!confirm(`Remover ${p.name} deste coworking? A mesa dele fica livre.`)) return;
    setError(null);
    orgApi.removeMember(spaceId, p.id).catch((e: unknown) => setError(errorMessage(e)));
  };

  return (
    <aside className="sidebar">
      <section>
        <h3>Pessoas ({people.length})</h3>
        {error && <p className="error">{error}</p>}
        <ul className="people">
          {people.map((p) => {
            const speaking = media.speaking.has(p.id);
            return (
              <li key={p.id} className={speaking ? 'speaking' : undefined}>
                <span className={`dot dot-${p.status}`} role="img" aria-label={STATUS_LABEL[p.status]} />
                <div className="person">
                  <div className="person-name">
                    {p.name}
                    {p.statusEmoji && <span className="emoji"> {p.statusEmoji}</span>}
                    {p.id === world.selfId && <span className="you"> (você)</span>}
                    {speaking && (
                      <span className="speaking-badge" title="Falando">
                        <MicIcon />
                        <span className="visually-hidden">falando</span>
                      </span>
                    )}
                  </div>
                  {p.title && <div className="person-title">{p.title}</div>}
                  <div className="person-status">
                    {[
                      p.status !== 'available' ? STATUS_LABEL[p.status] : null,
                      p.activity === 'call' ? 'Em chamada' : p.activity === 'meeting' ? 'Em reunião' : p.activity === 'game' ? 'Jogando' : null,
                      p.statusText,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                <div className="person-actions">
                  {callable(p) && (
                    <button
                      type="button"
                      className="call-button"
                      disabled={!seated}
                      title={seated ? `Ligar para ${p.name}` : 'Sente na sua mesa para ligar'}
                      onClick={() => calls.call(p.id)}
                    >
                      <PhoneIcon />
                      <span>Ligar</span>
                    </button>
                  )}
                  {isAdmin && p.id !== world.selfId && (
                    <button type="button" className="call-button subtle" onClick={() => remove(p)}>
                      Remover
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {!seated && people.length > 1 && <p className="muted">Para ligar, sente na cadeira da sua mesa.</p>}
      </section>
      {me && (
        <details className="me-details">
          <summary>
            <AvatarPreview spec={me.avatar} scale={1} />
            <span>Seu perfil e status</span>
          </summary>
          <MePanel key={me.id} me={me} spaceId={spaceId} />
        </details>
      )}
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
