import { AccessToken, TrackSource } from 'livekit-server-sdk';

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
}

export interface LiveKitConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
}

export const spaceRoom = (spaceId: string) => `space:${spaceId}`;

/** Na sala aberta só câmera e microfone: o token já impede compartilhar tela. */
export const SPACE_SOURCES: readonly MediaSource[] = ['camera', 'microphone'];

const TOKEN_TTL = '6h';

export function liveKitMedia(config: LiveKitConfig): MediaService {
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
  };
}
