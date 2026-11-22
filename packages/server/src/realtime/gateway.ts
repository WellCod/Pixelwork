import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { CLOSE_REMOVED, CLOSE_SESSION_ENDED, DeskDecor, compileMap, type DeskState } from '@pixelwork/shared';
import { deskAssignments, spaces, users } from '@pixelwork/shared/schema';
import { eq } from 'drizzle-orm';
import { WebSocketServer, type WebSocket } from 'ws';
import { SESSION_COOKIE, findSessionUser, hashToken } from '../auth/sessions.ts';
import { parseCookies } from '../cookies.ts';
import type { Db } from '../db.ts';
import { resolveMembership } from '../spaces/members.ts';
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
  /** Intervalo do ping de heartbeat e da varredura de sessões e runtimes ociosos. */
  heartbeatMs?: number;
  /** Tempo sem ninguém conectado até o runtime sair da memória. */
  idleUnloadMs?: number;
}

export interface Gateway {
  /** Conexões abertas em todos os coworkings; usado pelos testes para sincronizar. */
  connections(): number;
  /**
   * Runtime já carregado do coworking; não existe enquanto ninguém conectou. Chamado pelas rotas
   * depois de gravar: se o runtime estiver carregando, ele é recarregado para não nascer velho.
   */
  runtime(spaceId: string): SpaceRuntime | undefined;
  forEachRuntime(fn: (runtime: SpaceRuntime) => void): void;
  /** Fecha as conexões abertas com a sessão (logout). */
  closeSession(tokenHash: Buffer): void;
  /** Uma rodada de heartbeat e varredura; exposta para os testes. */
  sweep(): void;
  close(): void;
}

const MAX_PAYLOAD_BYTES = 4096;
/** Cliente que não lê o socket acumula ticks na memória do servidor; passou disso, cai. */
const MAX_BUFFERED_BYTES = 1024 * 1024;
const HEARTBEAT_MS = 30_000;
const IDLE_UNLOAD_MS = 10 * 60_000;

function reject(socket: Duplex, status: number, text: string): void {
  if (socket.destroyed) return;
  socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

interface SocketInfo {
  spaceId: string;
  tokenHash: Buffer;
  expiresAt: number;
  alive: boolean;
}

export function attachGateway(server: Server, deps: GatewayDeps): Gateway {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });
  const runtimes = new Map<string, Promise<SpaceRuntime | null>>();
  const loaded = new Map<string, SpaceRuntime>();
  /** Coworkings que mudaram no banco enquanto o runtime carregava. */
  const stale = new Set<string>();
  /** Upgrades em andamento por coworking: o runtime não é descarregado no meio de um. */
  const connecting = new Map<string, number>();
  const emptySince = new Map<string, number>();
  const sockets = new Map<WebSocket, SocketInfo>();
  const origin = new URL(deps.publicUrl).origin;
  const idleUnloadMs = deps.idleUnloadMs ?? IDLE_UNLOAD_MS;

  async function buildRuntime(spaceId: string): Promise<SpaceRuntime | null> {
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
    return new SpaceRuntime(spaceId, compiled.map, row.mapVersion, deps, desks);
  }

  async function loadRuntime(spaceId: string): Promise<SpaceRuntime | null> {
    // Mapa ou mesa gravados durante a carga marcam o coworking; carrega de novo até estabilizar.
    for (;;) {
      stale.delete(spaceId);
      const runtime = await buildRuntime(spaceId);
      if (!stale.has(spaceId)) {
        if (runtime) loaded.set(spaceId, runtime);
        return runtime;
      }
      runtime?.close();
    }
  }

  function runtimeFor(spaceId: string): Promise<SpaceRuntime | null> {
    let runtime = runtimes.get(spaceId);
    if (!runtime) {
      runtime = loadRuntime(spaceId);
      runtimes.set(spaceId, runtime);
      // Falha não fica em cache: a próxima conexão tenta de novo.
      const loading = runtime;
      loading.then(
        (r) => {
          if (!r && runtimes.get(spaceId) === loading) runtimes.delete(spaceId);
        },
        () => {
          if (runtimes.get(spaceId) === loading) runtimes.delete(spaceId);
        },
      );
    }
    return runtime;
  }

  function unload(spaceId: string): void {
    loaded.get(spaceId)?.close();
    loaded.delete(spaceId);
    runtimes.delete(spaceId);
    emptySince.delete(spaceId);
  }

  type Authorized =
    | {
        ok: true;
        userId: string;
        spaceId: string;
        tokenHash: Buffer;
        expiresAt: number;
        runtime: SpaceRuntime;
      }
    | { ok: false; status: number; text: string };
  const deny = (status: number, text: string): Authorized => ({ ok: false, status, text });

  async function authorize(req: IncomingMessage): Promise<Authorized> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/ws') return deny(404, 'Not Found');
    // Cross-site WebSocket hijacking: o cookie vai junto em qualquer origem.
    if (req.headers.origin !== origin) return deny(403, 'Forbidden');

    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    const user = await findSessionUser(deps.db, token, new Date(deps.clock.now()));
    if (!user || !token) return deny(401, 'Unauthorized');

    const membership = await resolveMembership(deps.db, url.searchParams.get('space'), user.id);
    if (!membership) return deny(404, 'Not Found');
    const { spaceId } = membership;

    const runtime = await runtimeFor(spaceId);
    if (!runtime) return deny(500, 'Internal Server Error');
    return {
      ok: true,
      userId: user.id,
      spaceId,
      tokenHash: hashToken(token),
      expiresAt: user.expiresAt.getTime(),
      runtime,
    };
  }

  async function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    // O `upgrade` tira o listener de erro do socket; sem este, um ECONNRESET durante as consultas
    // abaixo vira exceção não tratada e derruba o processo.
    socket.on('error', () => socket.destroy());
    const auth = await authorize(req);
    if (!auth.ok) {
      reject(socket, auth.status, auth.text);
      return;
    }
    if (socket.destroyed) return;
    const { userId, spaceId, runtime } = auth;

    wss.handleUpgrade(req, socket, head, (ws) => {
      connecting.set(spaceId, (connecting.get(spaceId) ?? 0) + 1);
      const info: SocketInfo = { spaceId, tokenHash: auth.tokenHash, expiresAt: auth.expiresAt, alive: true };
      sockets.set(ws, info);
      ws.on('pong', () => {
        info.alive = true;
      });
      ws.on('error', () => {
        ws.terminate();
      });
      const conn: Conn = {
        send: (data) => {
          if (ws.readyState !== ws.OPEN) return;
          if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
            ws.terminate();
            return;
          }
          ws.send(data);
        },
        close: (code, reason) => {
          ws.close(code, reason);
        },
      };
      // A participação é conferida de novo já com o socket aberto: uma remoção gravada durante
      // a carga do runtime não chegou a ele, e o `connect` recolocaria a pessoa no mapa.
      void resolveMembership(deps.db, spaceId, userId)
        .then((membership) => {
          if (ws.readyState !== ws.OPEN) return;
          if (!membership) {
            ws.close(CLOSE_REMOVED, 'removed');
            return;
          }
          ws.on('message', (data, isBinary) => {
            runtime.onMessage(userId, conn, !isBinary && Buffer.isBuffer(data) ? data.toString('utf8') : null);
          });
          ws.on('close', () => {
            runtime.onClose(userId, conn);
          });
          emptySince.delete(spaceId);
          runtime.connect(membership.profile, conn);
        })
        .catch((error: unknown) => {
          deps.log.error(error, 'falha ao conferir participação na conexão');
          ws.close(1011, 'internal error');
        })
        .finally(() => {
          connecting.set(spaceId, (connecting.get(spaceId) ?? 1) - 1);
        });
      ws.on('close', () => {
        sockets.delete(ws);
      });
    });
  }

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    handleUpgrade(req, socket, head).catch((error: unknown) => {
      deps.log.error(error, 'falha no upgrade do websocket');
      reject(socket, 500, 'Internal Server Error');
    });
  });

  function sweep(): void {
    const now = deps.clock.now();
    for (const [ws, info] of sockets) {
      if (info.expiresAt <= now) {
        ws.close(CLOSE_SESSION_ENDED, 'session ended');
        continue;
      }
      // Conexão meio aberta (Wi-Fi caiu, notebook dormiu) não dispara close sozinha.
      if (!info.alive) {
        ws.terminate();
        continue;
      }
      info.alive = false;
      ws.ping();
    }
    for (const [spaceId, runtime] of loaded) {
      if (runtime.memberCount() > 0 || (connecting.get(spaceId) ?? 0) > 0) {
        emptySince.delete(spaceId);
        continue;
      }
      const since = emptySince.get(spaceId);
      if (since === undefined) emptySince.set(spaceId, now);
      else if (now - since >= idleUnloadMs) unload(spaceId);
    }
  }
  const heartbeat = setInterval(sweep, deps.heartbeatMs ?? HEARTBEAT_MS);
  heartbeat.unref();

  return {
    connections: () => sockets.size,
    runtime: (spaceId) => {
      const runtime = loaded.get(spaceId);
      if (!runtime && runtimes.has(spaceId)) stale.add(spaceId);
      return runtime;
    },
    forEachRuntime: (fn) => {
      for (const runtime of loaded.values()) fn(runtime);
    },
    closeSession: (tokenHash) => {
      for (const [ws, info] of sockets) {
        if (info.tokenHash.equals(tokenHash)) ws.close(CLOSE_SESSION_ENDED, 'session ended');
      }
    },
    sweep,
    close: () => {
      clearInterval(heartbeat);
      for (const runtime of runtimes.values()) {
        runtime.then((r) => r?.close(), () => undefined);
      }
      for (const ws of sockets.keys()) ws.terminate();
      wss.close();
    },
  };
}
