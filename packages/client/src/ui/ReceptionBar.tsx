import { nextProximity, type ClientMsg } from '@pixelwork/shared';
import { useState } from 'react';
import type { MediaManager } from '../media/media-manager.ts';
import type { ClientWorld } from '../net/client-world.ts';
import { Modal } from './Modal.tsx';
import { useMedia } from './MediaControls.tsx';
import { useWorld } from './useWorld.ts';

export function ReceptionRoute({ world }: { world: ClientWorld }) {
  useWorld(world);
  const destination = world.receptionDestination;
  if (!destination) return null;
  return <section className="hud-card" aria-label="Trajeto da recepção">
    <span role="status">Destino · {destination.label}</span>
    <button type="button" onClick={() => world.clearReceptionDestination()}>Limpar trajeto</button>
  </section>;
}

export function ReceptionBar({ world, media, send }: { world: ClientWorld; media: MediaManager; send: (message: ClientMsg) => void }) {
  useWorld(world);
  useMedia(media);
  const [textOpen, setTextOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const { reception, receptionSession, self, selfId } = world;
  const localVoice = reception?.voice === 'local';
  if (receptionSession?.state === 'starting' || receptionSession?.state === 'active') {
    return <section className="hud-card" aria-label="Atendimento da recepção">
      <span>{receptionSession.state === 'starting' ? 'Conectando à recepção…' : 'Recepção · IA local'}</span>
      <button type="button" onClick={() => send({ t: 'reception.stop' })}>Encerrar</button>
    </section>;
  }
  if (!reception || !selfId || world.seat) return null;
  const npc = { ...reception, id: 'recepcao' };
  if (!nextProximity(world.map, { ...self, id: selfId }, [npc], new Set()).has(npc.id)) return null;

  return <section className="hud-card" aria-label="Recepção de IA">
    <strong>Recepção · IA</strong>
    {reception.status === 'available' && <>
      <span>{localVoice ? 'Ao iniciar, a IA processa seu microfone localmente durante o atendimento.'
        : 'Modo de teste com áudio sintético. Ao iniciar, seu microfone será processado durante o atendimento.'}</span>
      {media.micOn
        ? <button type="button" className="primary" disabled={!media.connected} onClick={() => send({ t: 'reception.start', consent: true })}>Conversar com IA</button>
        : <button type="button" disabled={!media.connected} onClick={() => void media.setMic(true)}>Ativar microfone para conversar</button>}
    </>}
    {reception.status === 'busy' && <span>Voz em atendimento</span>}
    {reception.status === 'unavailable' && <span>Voz indisponível</span>}
    {reception.status === 'available' && receptionSession?.state === 'ended' && receptionSession.reason === 'busy'
      && <span role="status">Limite de atendimentos atingido. Tente novamente.</span>}
    {receptionSession?.state === 'ended' && receptionSession.reason === 'quota'
      && <span role="status">Limite diário de voz atingido. A recepção por texto está disponível.</span>}
    {receptionSession?.state === 'ended' && receptionSession.reason === 'unavailable'
      && <span role="status">A voz da recepção falhou. Tente por texto.</span>}
    <button type="button" aria-haspopup="dialog" onClick={() => setTextOpen(true)}>Perguntar por texto</button>
    {textOpen && <Modal title="Recepção por texto" onClose={() => setTextOpen(false)}>
      <form className="fields" onSubmit={(event) => {
        event.preventDefault();
        const text = question.trim();
        if (!text) return;
        send({ t: 'reception.ask', text });
      }}>
        <label>Sua pergunta<input value={question} maxLength={160} onChange={(event) => setQuestion(event.target.value)} placeholder="Onde fica a Sala Aurora?" /></label>
        <button type="submit" className="primary" disabled={!question.trim()}>Perguntar</button>
      </form>
      <p className="reception-answer" role="status">{world.receptionAnswer}</p>
      {world.receptionDestination && <button type="button" onClick={() => setTextOpen(false)}>Ver trajeto no mapa</button>}
      <button type="button" onClick={() => setTextOpen(false)}>Fechar</button>
    </Modal>}
  </section>;
}
