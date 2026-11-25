import { nextProximity, type ClientMsg } from '@pixelwork/shared';
import type { ClientWorld } from '../net/client-world.ts';
import { useWorld } from './useWorld.ts';

export function ReceptionBar({ world, send }: { world: ClientWorld; send: (message: ClientMsg) => void }) {
  useWorld(world);
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
      <button type="button" className="primary" onClick={() => send({ t: 'reception.start', consent: true })}>Conversar com IA</button>
    </>}
    {reception.status === 'busy' && <span>Em atendimento</span>}
    {reception.status === 'unavailable' && <span>Indisponível</span>}
    {reception.status === 'available' && receptionSession?.state === 'ended' && receptionSession.reason === 'busy'
      && <span role="status">Limite de atendimentos atingido. Tente novamente.</span>}
  </section>;
}
