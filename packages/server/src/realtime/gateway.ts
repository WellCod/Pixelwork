import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { DeskDecor, compileMap, type DeskState } from '@pixelwork/shared';
import { deskAssignments, spaces, users } from '@pixelwork/shared/schema';
import { eq } from 'drizzle-orm';
import { WebSocketServer, type WebSocket } from 'ws';
import { SESSION_COOKIE, findSessionUser } from '../auth/sessions.ts';
import { parseCookies } from '../cookies.ts';
import type { Db } from '../db.ts';
import { resolveMembership, type PlayerProfile } from '../spaces/members.ts';
import type { Clock, Scheduler } from './clock.ts';
import type { MediaService } from './media.ts';
import { SpaceRuntime, type Conn } from './space-runtime.ts';

export interface GatewayDeps {
  db: Db;
  publicUrl: string;
  clock: Clock;
  scheduler: Scheduler;
  media: MediaService;
  log: { error: (obj: unknown, msg: string) => void };
}

export interface Gateway {
  /** Conexões abertas em todos os coworkings; usado pelos testes para sincronizar. */
  connections(): number;
  /** Runtime já carregado do coworking; não existe enquanto ninguém conectou. */
  runtime(spaceId: string): SpaceRuntime | undefined;
  forEachRuntime(fn: (runtime: SpaceRuntime) => void): void;
  close(): void;
}

const MAX_PAYLOAD_BYTES = 4096;

function reject(socket: Duplex, status: number, text: string): void {
  socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

export function attachGateway(server: Server, deps: GatewayDeps): Gateway {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });
  const runtimes = new Map<string, Promise<SpaceRuntime | null>>();
  const loaded = new Map<string, SpaceRuntime>();
  const sockets = new Set<WebSocket>();
  const origin = new URL(deps.publicUrl).origin;

  async function loadRuntime(spaceId: string): Promise<SpaceRuntime | null> {
    const rows = await deps.db
      .select({ map: spaces.map, mapVersion: spaces.mapVersion })
      .from(spaces)
      .where(eq(spaces.id, spaceId));
    const row = rows[0];
    if (!row) return null;
    const compiled = compileMap(row.map);
    if (!compiled.ok) {
      deps.log.error({ spaceId, errors: compiled.errors }, 'mapa salvo não compila');
      return null;
    }
    const assignments = await deps.db
      .select({
        deskKey: deskAssignments.deskKey,
        userId: deskAssignments.userId,
        ownerName: users.displayName,
        decor: deskAssignments.decor,
      })
      .from(deskAssignments)
      .innerJoin(users, eq(users.id, deskAssignments.userId))
      .where(eq(deskAssignments.spaceId, spaceId));
    const desks = assignments.map(
      (a): DeskState => ({ ...a, decor: DeskDecor.safeParse(a.decor).data ?? null }),
    );
    const runtime = new SpaceRuntime(spaceId, compiled.map, row.mapVersion, deps, desks);
    loaded.set(spaceId, runtime);
    return runtime;
  }

  function runtimeFor(spaceId: string): Promise<SpaceRuntime | null> {
    let runtime = runtimes.get(spaceId);
    if (!runtime) {
      runtime = loadRuntime(spaceId);
      runtimes.set(spaceId, runtime);
      // Falha não fica em cache: a próxima conexão tenta de novo.
      void runtime.then((r) => {
        if (!r) runtimes.delete(spaceId);
      });
    }
    return runtime;
  }

  type Authorized =
    | { ok: true; userId: string; profile: PlayerProfile; runtime: SpaceRuntime }
    | { ok: false; status: number; text: string };
  const deny = (status: number, text: string): Authorized => ({ ok: false, status, text });

  async function authorize(req: IncomingMessage): Promise<Authorized> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/ws') return deny(404, 'Not Found');
    // Cross-site WebSocket hijacking: o cookie vai junto em qualquer origem.
    if (req.headers.origin !== origin) return deny(403, 'Forbidden');

    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    const user = await findSessionUser(deps.db, token, new Date(deps.clock.now()));
    if (!user) return deny(401, 'Unauthorized');

    const spaceId = url.searchParams.get('space');
    const membership = await resolveMembership(deps.db, spaceId, user.id);
    if (!membership || !spaceId) return deny(404, 'Not Found');

    const runtime = await runtimeFor(spaceId);
    if (!runtime) return deny(500, 'Internal Server Error');
    return { ok: true, userId: user.id, profile: membership.profile, runtime };
  }

  async function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const auth = await authorize(req);
    if (!auth.ok) {
      reject(socket, auth.status, auth.text);
      return;
    }
    const { userId, profile, runtime } = auth;

    wss.handleUpgrade(req, socket, head, (ws) => {
      sockets.add(ws);
      const conn: Conn = {
        send: (data) => {
          if (ws.readyState === ws.OPEN) ws.send(data);
        },
        close: (code, reason) => {
          ws.close(code, reason);
        },
      };
      ws.on('message', (data, isBinary) => {
        runtime.onMessage(userId, conn, !isBinary && Buffer.isBuffer(data) ? data.toString('utf8') : null);
      });
      ws.on('close', () => {
        sockets.delete(ws);
        runtime.onClose(userId, conn);
      });
      ws.on('error', () => {
        ws.terminate();
      });
      runtime.connect(profile, conn);
    });
  }

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    handleUpgrade(req, socket, head).catch((error: unknown) => {
      deps.log.error(error, 'falha no upgrade do websocket');
      reject(socket, 500, 'Internal Server Error');
    });
  });

  return {
    connections: () => sockets.size,
    runtime: (spaceId) => loaded.get(spaceId),
    forEachRuntime: (fn) => {
      for (const runtime of loaded.values()) fn(runtime);
    },
    close: () => {
      for (const runtime of runtimes.values()) {
        void runtime.then((r) => r?.close());
      }
      for (const ws of sockets) ws.terminate();
      wss.close();
    },
  };
}
