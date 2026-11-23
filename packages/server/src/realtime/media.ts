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
  /** Endereço que o navegador usa (vai no `media.join`). */
  url: string;
  /** Endereço da API para o servidor; pode ser o interno da rede do compose. */
  apiUrl?: string;
  apiKey: string;
  apiSecret: string;
}

// Nomes das salas no LiveKit: uma aberta por coworking, uma por zona de reunião e uma por chamada.
export const spaceRoom = (spaceId: string) => `space:${spaceId}`;
export const zoneRoom = (spaceId: string, zoneKey: string) => `zone:${spaceId}:${zoneKey}`;
export const callRoom = (callId: string) => `call:${callId}`;

/** Na sala aberta só câmera e microfone: o token já impede compartilhar tela. */
export const SPACE_SOURCES: readonly MediaSource[] = ['camera', 'microphone'];
/** Sala de reunião e chamada: tela liberada. */
export const PRIVATE_SOURCES: readonly MediaSource[] = ['camera', 'microphone', 'screen_share', 'screen_share_audio'];

/**
 * O LiveKit só confere o token na entrada e renova sozinho o de quem continua conectado. Com
 * validade curta, um token guardado não serve para voltar a uma sala depois de sair dela
 * (reunião trancada, chamada encerrada, membro removido).
 */
const TOKEN_TTL = '2m';

/** MediaService de verdade, falando com o LiveKit pela API de servidor. */
export function liveKitMedia(config: LiveKitConfig): MediaService {
  // O cliente aceita a URL ws:// e troca para http por conta própria.
  const roomService = new RoomServiceClient(config.apiUrl ?? config.url, config.apiKey, config.apiSecret);
  return {
    url: config.url,
    token: async (identity, room, sources) => {
      const token = new AccessToken(config.apiKey, config.apiSecret, { identity, ttl: TOKEN_TTL });
      token.addGrant({
        room,
        roomJoin: true,
        canSubscribe: true,
        canPublishData: false,
        canPublishSources: sources.map((source) => SOURCES[source]),
      });
      return token.toJwt();
    },
    removeParticipant: (room, identity) => roomService.removeParticipant(room, identity),
    deleteRoom: (room) => roomService.deleteRoom(room),
  };
}
