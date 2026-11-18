import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';

export type MediaSource = 'camera' | 'microphone' | 'screen_share' | 'screen_share_audio';

const SOURCES: Record<MediaSource, TrackSource> = {
  camera: TrackSource.CAMERA,
  microphone: TrackSource.MICROPHONE,
  screen_share: TrackSource.SCREEN_SHARE,
  screen_share_audio: TrackSource.SCREEN_SHARE_AUDIO,
};

/** O que o tempo real precisa do LiveKit; os testes de autorização trocam por um dublê. */
export interface MediaService {
  /** URL que o cliente usa para conectar (vai no `media.join`). */
  readonly url: string;
  token(identity: string, room: string, sources: readonly MediaSource[]): Promise<string>;
  /** Tira o participante da sala pelo servidor: cobre o cliente que ignora o `media.join`. */
  removeParticipant(room: string, identity: string): Promise<void>;
  /** Encerra a sala inteira (zona que saiu do mapa). */
  deleteRoom(room: string): Promise<void>;
}

export interface LiveKitConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
}

export const spaceRoom = (spaceId: string) => `space:${spaceId}`;
export const zoneRoom = (spaceId: string, zoneKey: string) => `zone:${spaceId}:${zoneKey}`;
export const callRoom = (callId: string) => `call:${callId}`;

/** Na sala aberta só câmera e microfone: o token já impede compartilhar tela. */
export const SPACE_SOURCES: readonly MediaSource[] = ['camera', 'microphone'];
/** Sala de reunião e chamada: tela liberada. */
export const PRIVATE_SOURCES: readonly MediaSource[] = ['camera', 'microphone', 'screen_share', 'screen_share_audio'];

const TOKEN_TTL = '6h';

export function liveKitMedia(config: LiveKitConfig): MediaService {
  // O cliente aceita a URL ws:// e troca para http por conta própria.
  const rooms = new RoomServiceClient(config.url, config.apiKey, config.apiSecret);
  return {
    url: config.url,
    token: async (identity, room, sources) => {
      const token = new AccessToken(config.apiKey, config.apiSecret, { identity, ttl: TOKEN_TTL });
      token.addGrant({
        room,
        roomJoin: true,
        canSubscribe: true,
        canPublishData: false,
        canPublishSources: sources.map((s) => SOURCES[s]),
      });
      return token.toJwt();
    },
    removeParticipant: (room, identity) => rooms.removeParticipant(room, identity),
    deleteRoom: (room) => rooms.deleteRoom(room),
  };
}
