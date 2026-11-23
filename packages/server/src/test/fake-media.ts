import type { MediaService, MediaSource } from '../realtime/media.ts';

/** Dublê do LiveKit: registra cada token emitido e cada remoção de participante. */
export class FakeMedia implements MediaService {
  readonly url = 'ws://livekit.test';
  readonly tokens: { identity: string; room: string; sources: readonly MediaSource[] }[] = [];
  readonly removed: { room: string; identity: string }[] = [];
  readonly deletedRooms: string[] = [];

  token(identity: string, room: string, sources: readonly MediaSource[]): Promise<string> {
    this.tokens.push({ identity, room, sources });
    return Promise.resolve(`token:${room}:${identity}`);
  }

  removeParticipant(room: string, identity: string): Promise<void> {
    this.removed.push({ room, identity });
    return Promise.resolve();
  }

  deleteRoom(room: string): Promise<void> {
    this.deletedRooms.push(room);
    return Promise.resolve();
  }

  /** Salas para as quais a pessoa recebeu token, em ordem. */
  roomsFor(identity: string): string[] {
    return this.tokens.filter((token) => token.identity === identity).map((token) => token.room);
  }
}
