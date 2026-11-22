import { z } from 'zod';
import {
  ACCESSORY_IDS,
  BODY_IDS,
  DECOR_ITEMS,
  DESK_VARIANTS,
  FLOOR_ITEMS,
  HAIR_IDS,
  HAIR_PALETTES,
  OUTFIT_IDS,
  OUTFIT_PALETTES,
  SKIN_PALETTES,
  WALL_ITEMS,
} from './catalog.generated.ts';
import { CHAT_MAX_CHARS } from './constants.ts';

export const DIRS = ['up', 'down', 'left', 'right'] as const;
export const Dir = z.enum(DIRS);
export type Dir = z.infer<typeof Dir>;

export const DIR_DELTA: Readonly<Record<Dir, readonly [dx: number, dy: number]>> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

export type Status = 'available' | 'focus' | 'away';
export type Activity = 'idle' | 'meeting' | 'call';

export const AvatarSpec = z.object({
  body: z.enum(BODY_IDS),
  skin: z.enum(SKIN_PALETTES),
  hair: z.enum(HAIR_IDS).nullable(),
  hairColor: z.enum(HAIR_PALETTES),
  outfit: z.enum(OUTFIT_IDS),
  outfitColor: z.enum(OUTFIT_PALETTES),
  accessory: z.enum(ACCESSORY_IDS).nullable(),
});
export type AvatarSpec = z.infer<typeof AvatarSpec>;

export const DeskDecor = z.object({
  variant: z.enum(DESK_VARIANTS),
  monitor: z.enum(['single', 'dual', 'laptop']),
  slots: z.object({
    left: z.enum(DECOR_ITEMS).nullable(),
    right: z.enum(DECOR_ITEMS).nullable(),
    back: z.enum(WALL_ITEMS).nullable(),
    floor: z.enum(FLOOR_ITEMS).nullable(),
  }),
});
export type DeskDecor = z.infer<typeof DeskDecor>;

export interface Player {
  id: string;
  name: string;
  title: string | null;
  avatar: AvatarSpec;
  x: number;
  y: number;
  dir: Dir;
  status: Status;
  statusText: string | null;
  statusEmoji: string | null;
  activity: Activity;
}

export interface ZoneState {
  zoneKey: string;
  locked: boolean;
  occupants: string[];
}

export interface DeskState {
  deskKey: string;
  userId: string | null;
  ownerName: string | null;
  decor: DeskDecor | null;
}

const Seq = z.number().int().nonnegative();
const Key = z.string().min(1).max(40);

export const ClientMsg = z.discriminatedUnion('t', [
  z.object({ t: z.literal('move'), seq: Seq, dir: Dir }),
  z.object({ t: z.literal('zone.lock'), zoneKey: Key, locked: z.boolean() }),
  z.object({ t: z.literal('zone.knock'), zoneKey: Key }),
  z.object({ t: z.literal('zone.knockReply'), requestId: z.string().min(1), allow: z.boolean() }),
  z.object({ t: z.literal('call.invite'), userId: z.string().min(1) }),
  z.object({ t: z.literal('call.reply'), callId: z.string().min(1), accept: z.boolean() }),
  z.object({ t: z.literal('call.leave') }),
  z.object({ t: z.literal('chat.say'), text: z.string().max(CHAT_MAX_CHARS * 4) }),
]);
export type ClientMsg = z.infer<typeof ClientMsg>;

export type TickMove = [id: string, x: number, y: number, dir: Dir];

export type ServerMsg =
  | {
      t: 'welcome';
      selfId: string;
      mapVersion: number;
      players: Player[];
      zones: ZoneState[];
      desks: DeskState[];
    }
  /** `ts`: hora do servidor no envio (ms), usada para medir a latência do tick. */
  | { t: 'tick'; ack: number; moves: TickMove[]; ts?: number }
  | { t: 'player.join'; player: Player }
  | { t: 'player.leave'; id: string }
  | {
      t: 'player.update';
      id: string;
      patch: Partial<
        Pick<Player, 'name' | 'avatar' | 'title' | 'status' | 'statusText' | 'statusEmoji' | 'activity'>
      >;
    }
  | { t: 'zone.state'; zone: ZoneState }
  | { t: 'zone.knockRequest'; requestId: string; zoneKey: string; from: string }
  | { t: 'zone.knockResult'; zoneKey: string; allowed: boolean }
  | { t: 'media.join'; room: string; token: string; url: string }
  | { t: 'call.incoming'; callId: string; from: string }
  | { t: 'call.ended'; callId: string; reason: 'declined' | 'left' | 'timeout' | 'busy' }
  | { t: 'chat.said'; from: string; text: string }
  | { t: 'desk.updated'; desk: DeskState }
  | { t: 'map.updated'; version: number }
  | { t: 'session.replaced' }
  | { t: 'error'; code: string };

/** Fechamento da conexão anterior quando o mesmo usuário abre outra no mesmo coworking. */
export const CLOSE_SESSION_REPLACED = 4001;
/** Política violada: mensagens inválidas ou taxa acima do limite. */
export const CLOSE_POLICY = 1008;
/** Removido do coworking por um admin ou por ter saído: o cliente não reconecta. */
export const CLOSE_REMOVED = 4003;
/** Sessão encerrada (logout ou expiração): o cliente volta para o login sem reconectar. */
export const CLOSE_SESSION_ENDED = 4004;
