import { isSingleEmoji, type Player, type Status } from '@pixelwork/shared';
import { useState, type SubmitEvent } from 'react';
import { orgApi, profileApi } from '../api.ts';
import { seatedPose } from '../game/presence.ts';
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

/**
 * Barra lateral: lista de pessoas do coworking (status, fala, ligar, remover) e, embaixo, o
 * painel recolhível com o próprio perfil e status.
 */
export function Sidebar({ world, media, spaceId, calls, isAdmin }: SidebarProps) {
  useWorld(world);
  useCalls(calls);
  useMedia(media);
  const [error, setError] = useState<string | null>(null);
  // Chamada só sai da própria mesa (o servidor confere de novo).
  const seatedAtOwnDesk =
    world.selfId !== null && seatedPose(world.map, world.desks, world.selfId, world.self.x, world.self.y) !== null;
  // Dá para ligar para outra pessoa que não está em chamada, e só sem chamada própria em curso.
  const canCall = (player: Player) =>
    player.id !== world.selfId && player.activity !== 'call' && calls.state.kind === 'idle';
  const selfPlayer = world.selfId ? world.players.get(world.selfId) : undefined;
  // Você primeiro, depois os outros em ordem alfabética.
  const people = [...world.players.values()].sort(
    (playerA, playerB) =>
      Number(playerB.id === world.selfId) - Number(playerA.id === world.selfId) || playerA.name.localeCompare(playerB.name),
  );

  const removeMember = (player: Player) => {
    if (!confirm(`Remover ${player.name} deste coworking? A mesa dele fica livre.`)) return;
    setError(null);
    orgApi.removeMember(spaceId, player.id).catch((removeError: unknown) => setError(errorMessage(removeError)));
  };

  return (
    <aside className="sidebar">
      <section>
        <h3>Pessoas ({people.length})</h3>
        {error && <p className="error">{error}</p>}
        <ul className="people">
          {people.map((player) => {
            const speaking = media.speaking.has(player.id);
            return (
              <li key={player.id} className={speaking ? 'speaking' : undefined}>
                <span className={`dot dot-${player.status}`} role="img" aria-label={STATUS_LABEL[player.status]} />
                <div className="person">
                  <div className="person-name">
                    {player.name}
                    {player.statusEmoji && <span className="emoji"> {player.statusEmoji}</span>}
                    {player.id === world.selfId && <span className="you"> (você)</span>}
                    {speaking && (
                      <span className="speaking-badge" title="Falando">
                        <MicIcon />
                        <span className="visually-hidden">falando</span>
                      </span>
                    )}
                  </div>
                  {player.title && <div className="person-title">{player.title}</div>}
                  {/* Linha de detalhes: status (se não for disponível), atividade e texto livre. */}
                  <div className="person-status">
                    {[
                      player.status !== 'available' ? STATUS_LABEL[player.status] : null,
                      player.activity === 'call'
                        ? 'Em chamada'
                        : player.activity === 'meeting'
                          ? 'Em reunião'
                          : player.activity === 'game'
                            ? 'Jogando'
                            : null,
                      player.statusText,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                <div className="person-actions">
                  {canCall(player) && (
                    <button
                      type="button"
                      className="call-button"
                      disabled={!seatedAtOwnDesk}
                      title={seatedAtOwnDesk ? `Ligar para ${player.name}` : 'Sente na sua mesa para ligar'}
                      onClick={() => calls.call(player.id)}
                    >
                      <PhoneIcon />
                      <span>Ligar</span>
                    </button>
                  )}
                  {/* Admin remove qualquer outra pessoa; a própria saída fica no painel de perfil. */}
                  {isAdmin && player.id !== world.selfId && (
                    <button type="button" className="call-button subtle" onClick={() => removeMember(player)}>
                      Remover
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {!seatedAtOwnDesk && people.length > 1 && <p className="muted">Para ligar, sente na cadeira da sua mesa.</p>}
      </section>
      {selfPlayer && (
        <details className="me-details">
          <summary>
            <AvatarPreview spec={selfPlayer.avatar} scale={1} />
            <span>Seu perfil e status</span>
          </summary>
          <MePanel key={selfPlayer.id} me={selfPlayer} spaceId={spaceId} />
        </details>
      )}
    </aside>
  );
}

/**
 * Formulários do próprio perfil (nome, cargo, avatar) e status. Os campos começam com os valores
 * de `me`; o `key` no pai remonta o painel se o jogador mudar.
 */
function MePanel({ me, spaceId }: { me: Player; spaceId: string }) {
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [name, setName] = useState(me.name);
  const [title, setTitle] = useState(me.title ?? '');
  const [status, setStatus] = useState<Status>(me.status);
  const [statusText, setStatusText] = useState(me.statusText ?? '');
  const [statusEmoji, setStatusEmoji] = useState(me.statusEmoji ?? '');
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const emojiInvalid = statusEmoji !== '' && !isSingleEmoji(statusEmoji);

  /** Roda a gravação e mostra `successText` ou o erro abaixo dos formulários. */
  const runAndReport = (task: Promise<unknown>, successText: string) => {
    task
      .then(() => setFeedback({ kind: 'ok', text: successText }))
      .catch((saveError: unknown) => setFeedback({ kind: 'error', text: errorMessage(saveError) }));
  };

  // Só manda o que mudou: o nome é global, o cargo vale só neste coworking.
  const saveProfile = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const profileUpdates: Promise<unknown>[] = [];
    if (name.trim() !== me.name) profileUpdates.push(profileApi.setName(name));
    if ((title.trim() || null) !== me.title) profileUpdates.push(profileApi.setTitle(spaceId, title));
    runAndReport(Promise.all(profileUpdates), 'Perfil salvo.');
  };

  const saveStatus = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (emojiInvalid) return;
    runAndReport(profileApi.setStatus(spaceId, { status, text: statusText, emoji: statusEmoji }), 'Status salvo.');
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
          <input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Cargo neste coworking
          <input value={title} maxLength={40} placeholder="ex.: Designer" onChange={(event) => setTitle(event.target.value)} />
        </label>
        <button type="submit">Salvar perfil</button>
      </form>

      <form onSubmit={saveStatus} className="fields">
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value as Status)}>
            {(Object.keys(STATUS_LABEL) as Status[]).map((statusOption) => (
              <option key={statusOption} value={statusOption}>
                {STATUS_LABEL[statusOption]}
              </option>
            ))}
          </select>
        </label>
        <div className="row">
          <label className="emoji-field">
            Emoji
            <input
              value={statusEmoji}
              placeholder="🙂"
              aria-invalid={emojiInvalid}
              onChange={(event) => setStatusEmoji(event.target.value)}
            />
          </label>
          <label className="grow">
            Texto
            <input
              value={statusText}
              maxLength={80}
              placeholder="Em reunião até 15h"
              onChange={(event) => setStatusText(event.target.value)}
            />
          </label>
        </div>
        {emojiInvalid && <p className="error">Use um emoji só.</p>}
        <button type="submit" disabled={emojiInvalid}>
          Salvar status
        </button>
      </form>

      {feedback && <p className={feedback.kind === 'ok' ? 'ok' : 'error'}>{feedback.text}</p>}
      <button
        type="button"
        className="link-button"
        onClick={() => {
          // A saída chega pelo tempo real (conexão fechada com o código de removido).
          if (confirm('Sair deste coworking? Sua mesa fica livre.')) runAndReport(orgApi.removeMember(spaceId, me.id), '');
        }}
      >
        Sair do coworking
      </button>
      {editingAvatar && <AvatarEditor initial={me.avatar} onClose={() => setEditingAvatar(false)} />}
    </section>
  );
}
