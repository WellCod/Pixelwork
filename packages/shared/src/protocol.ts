import type { FoosballState } from './foosball.ts';
import type { PongEvent, PongPhase, PongSide, PongState } from './pong.ts';
import { z } from 'zod';
import {
  ACCESSORY_IDS,
  BACKPACK_IDS,
  BODY_IDS,
  DECOR_ITEMS,
  DESK_VARIANTS,
  FLOOR_ITEMS,
  HAIR_IDS,
  HAIR_PALETTES,
  HEADWEAR_IDS,
  OUTFIT_IDS,
  OUTFIT_PALETTES,
  SKIN_PALETTES,
  WALL_ITEMS,
} from './catalog.generated.ts';
import { CHAT_MAX_CHARS } from './constants.ts';

export const DIRS = ['up', 'down', 'left', 'right'] as const;
export const Dir = z.enum(DIRS);
export type Dir = z.infer<typeof Dir>;

/** Deslocamento em tiles de um passo em cada direção (y cresce para baixo). */
export const DIR_DELTA: Readonly<Record<Dir, readonly [dx: number, dy: number]>> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

export type Status = 'available' | 'focus' | 'away';
/** O que o jogador está fazendo, mostrado aos outros (reunião, chamada, jogo). */
export type Activity = 'idle' | 'meeting' | 'call' | 'game';

/** Avatar montado por camadas do catálogo. */
export const AvatarSpec = z.object({
  body: z.enum(BODY_IDS),
  skin: z.enum(SKIN_PALETTES),
  hair: z.enum(HAIR_IDS).nullable(),
  hairColor: z.enum(HAIR_PALETTES),
  outfit: z.enum(OUTFIT_IDS),
  outfitColor: z.enum(OUTFIT_PALETTES),
  accessory: z.enum(ACCESSORY_IDS).nullable(),
  headwear: z.enum(HEADWEAR_IDS).nullable().optional(),
  backpack: z.enum(BACKPACK_IDS).nullable().optional(),
});
export type AvatarSpec = z.infer<typeof AvatarSpec>;

/** Decoração da mesa atribuída: variante, monitor e um item por espaço. */
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
  /** Id curto (u16) deste jogador no runtime, usado no tick binário. */
  shortId: number;
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
  /** Vaga num sofá, cadeira de mesa redonda ou banqueta. */
  seatedAt?: string | null;
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

/** Mesa de jogo vista por todos (plaquinha com o placar). `left`/`right`: id do jogador ou 'bot'. */
export interface TableState {
  tableKey: string;
  phase: 'free' | 'waiting' | 'playing' | 'ended';
  left: string | null;
  right: string | null;
  score: { left: number; right: number };
}

/** Mesa e lado do próprio jogador. */
export interface GameSeat {
  tableKey: string;
  side: PongSide;
}

/** Número de sequência do cliente, ecoado no `ack` para a reconciliação. */
const Seq = z.number().int().nonnegative();
/** Chave de zona ou de mesa de jogo, com teto de 40 caracteres como as chaves do mapa. */
const Key = z.string().min(1).max(40);

/** Mensagens do cliente para o servidor no WebSocket, validadas na chegada. */
export const ClientMsg = z.discriminatedUnion('t', [
  z.object({ t: z.literal('move'), seq: Seq, dir: Dir }),
  z.object({ t: z.literal('zone.lock'), zoneKey: Key, locked: z.boolean() }),
  z.object({ t: z.literal('zone.knock'), zoneKey: Key }),
  z.object({ t: z.literal('zone.knockReply'), requestId: z.string().min(1), allow: z.boolean() }),
  z.object({ t: z.literal('call.invite'), userId: z.string().min(1) }),
  z.object({ t: z.literal('call.reply'), callId: z.string().min(1), accept: z.boolean() }),
  z.object({ t: z.literal('call.leave') }),
  z.strictObject({ t: z.literal('reception.start'), consent: z.literal(true) }),
  z.strictObject({ t: z.literal('reception.stop') }),
  // Teto folgado em unidades UTF-16 só contra abuso; o limite real (em code points, depois do trim) é conferido no servidor.
  z.object({ t: z.literal('chat.say'), text: z.string().max(CHAT_MAX_CHARS * 4) }),
  z.object({ t: z.literal('ping'), id: z.number().int().nonnegative() }),
  z.object({ t: z.literal('furniture.sit'), seatKey: Key }),
  z.object({ t: z.literal('furniture.stand') }),
  z.object({ t: z.literal('game.join'), tableKey: Key }),
  z.object({ t: z.literal('game.bot') }),
  z.object({ t: z.literal('game.rematch') }),
  z.object({ t: z.literal('game.leave') }),
  z.object({ t: z.literal('game.kick') }),
  z.object({ t: z.literal('game.input'), seq: Seq, dir: z.union([z.literal(-1), z.literal(0), z.literal(1)]) }),
]);
export type ClientMsg = z.infer<typeof ClientMsg>;

/** Movimento do tick já decodificado, com o id completo do jogador. */
export type TickMove = [id: string, x: number, y: number, dir: Dir];

export interface ReceptionPresence {
  voice?: 'local';
  x: number;
  y: number;
  status: 'available' | 'busy' | 'unavailable';
}

export type ReceptionDestination = {
  label: string;
} & ({ kind: 'room' | 'desk'; key: string } | { kind: 'person'; id: string });

/** Mensagens do servidor para o cliente; só o `tick` vai em binário na rede. */
export type ServerMsg =
  | {
      t: 'welcome';
      selfId: string;
      mapVersion: number;
      players: Player[];
      zones: ZoneState[];
      desks: DeskState[];
      tables: TableState[];
      /** Mesa em que o próprio jogador está (reabre a janela do jogo ao reconectar). */
      game: GameSeat | null;
      reception?: ReceptionPresence;
    }
  /**
   * `ts`: hora do servidor no envio (ms), usada para medir a latência do tick. Na rede o tick vai
   * em binário (`binary.ts`); o cliente decodifica para este formato, com os ids completos.
   */
  | { t: 'tick'; ack: number; moves: TickMove[]; ts?: number }
  | { t: 'player.join'; player: Player }
  | { t: 'player.leave'; id: string }
  | {
      t: 'player.update';
      id: string;
      patch: Partial<
        Pick<Player, 'name' | 'avatar' | 'title' | 'status' | 'statusText' | 'statusEmoji' | 'activity' | 'seatedAt'>
      >;
    }
  | { t: 'zone.state'; zone: ZoneState }
  | { t: 'reception.state'; reception: ReceptionPresence | null }
  | { t: 'reception.destination'; destination: ReceptionDestination | null }
  | { t: 'reception.session'; state: 'starting' }
  | { t: 'reception.session'; state: 'active'; identity: string }
  | { t: 'reception.session'; state: 'ended'; reason: 'finished' | 'left' | 'timeout' | 'busy' | 'unavailable' }
  | { t: 'zone.knockRequest'; requestId: string; zoneKey: string; from: string }
  | { t: 'zone.knockResult'; zoneKey: string; allowed: boolean }
  | { t: 'media.join'; room: string; token: string; url: string }
  | { t: 'call.incoming'; callId: string; from: string }
  | { t: 'call.ended'; callId: string; reason: 'declined' | 'left' | 'timeout' | 'busy' }
  | { t: 'chat.said'; from: string; text: string }
  | { t: 'desk.updated'; desk: DeskState }
  | { t: 'map.updated'; version: number }
  | { t: 'session.replaced' }
  /** Resposta ao `ping`; `ts` é a hora do servidor, para estimar a diferença de relógio. */
  | { t: 'pong'; id: number; ts: number }
  | { t: 'error'; code: string }
  /** Estado da partida, 30 vezes por segundo, só para os jogadores. `ack`: último `seq` de input do destinatário. */
  | ({
      t: 'game.state';
      tableKey: string;
      ack: number;
      phase: PongPhase;
      serveAt: number;
      ball: PongState['ball'];
      score: PongState['score'];
      serverTs: number;
    } & (
      | { paddles: PongState['paddles']; foosball?: never }
      | { foosball: Pick<FoosballState, 'rods' | 'kickAt'>; paddles?: never }
    ))
  | { t: 'game.events'; tableKey: string; events: PongEvent[] }
  | { t: 'table.state'; table: TableState };

/** Fechamento da conexão anterior quando o mesmo usuário abre outra no mesmo coworking. */
export const CLOSE_SESSION_REPLACED = 4001;
/** Política violada: mensagens inválidas ou taxa acima do limite. */
export const CLOSE_POLICY = 1008;
/** Removido do coworking por um admin ou por ter saído: o cliente não reconecta. */
export const CLOSE_REMOVED = 4003;
/** Sessão encerrada (logout ou expiração): o cliente volta para o login sem reconectar. */
export const CLOSE_SESSION_ENDED = 4004;
