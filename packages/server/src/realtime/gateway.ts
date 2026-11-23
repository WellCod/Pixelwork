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
import type { Metrics } from '../metrics.ts';
import type { MediaService } from './media.ts';
import { SpaceRuntime, type Conn } from './space-runtime.ts';

export interface GatewayDeps {
  db: Db;
  publicUrl: string;
  clock: Clock;
  scheduler: Scheduler;
  media: MediaService;
  log: { error: (details: unknown, message: string) => void };
  metrics?: Metrics;
  /** Intervalo do ping de heartbeat e da varredura de sessões e runtimes ociosos. */
  heartbeatMs?: number;
  /** Tempo sem ninguém conectado até o runtime sair da memória. */
  idleUnloadMs?: number;
}

/** O que o resto do servidor enxerga do tempo real: rotas e jobs empurram mudanças por aqui. */
export interface Gateway {
  /** Conexões abertas em todos os coworkings; usado pelos testes para sincronizar. */
  connections(): number;
  /** Jogadores em todos os runtimes carregados (inclui a tolerância de reconexão). */
  players(): number;
  /** Partidas de pingpong em andamento em todos os runtimes. */
  games(): number;
  /** Coworkings com runtime em memória. */
  runtimesLoaded(): number;
  /**
   * Runtime já carregado do coworking; não existe enquanto ninguém conectou. Chamado pelas rotas
   * depois de gravar: se o runtime estiver carregando, ele é recarregado para não nascer velho.
   */
  runtime(spaceId: string): SpaceRuntime | undefined;
  forEachRuntime(callback: (runtime: SpaceRuntime) => void): void;
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

/** Recusa o upgrade respondendo HTTP cru no socket, antes de virar WebSocket. */
function rejectUpgrade(rawSocket: Duplex, status: number, statusText: string): void {
  if (rawSocket.destroyed) return;
  rawSocket.end(`HTTP/1.1 ${status} ${statusText}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

/** O que o gateway guarda de cada WebSocket aberto para o heartbeat e o logout. */
interface SocketInfo {
  spaceId: string;
  tokenHash: Buffer;
  expiresAt: number;
  /** Respondeu ao último ping; quem passa uma rodada inteira sem responder é derrubado. */
  alive: boolean;
}

/**
 * Liga o WebSocket ao servidor HTTP: autoriza o upgrade em /ws, carrega o runtime do coworking
 * sob demanda, repassa as mensagens e descarrega runtimes ociosos.
 */
export function attachGateway(server: Server, deps: GatewayDeps): Gateway {
  const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });
  /** Carga do runtime por coworking, em andamento ou concluída; conexões simultâneas esperam a mesma. */
  const runtimeLoads = new Map<string, Promise<SpaceRuntime | null>>();
  /** Runtimes já prontos, os únicos que as rotas e a varredura enxergam. */
  const loadedRuntimes = new Map<string, SpaceRuntime>();
  /** Coworkings que mudaram no banco enquanto o runtime carregava. */
  const staleSpaceIds = new Set<string>();
  /** Upgrades em andamento por coworking: o runtime não é descarregado no meio de um. */
  const upgradesInProgress = new Map<string, number>();
  /** Desde quando cada runtime carregado está sem ninguém, para o descarregamento por ociosidade. */
  const emptySince = new Map<string, number>();
  const sockets = new Map<WebSocket, SocketInfo>();
  const origin = new URL(deps.publicUrl).origin;
  const idleUnloadMs = deps.idleUnloadMs ?? IDLE_UNLOAD_MS;

  /** Lê mapa e mesas do banco e monta o runtime; null se o coworking sumiu ou o mapa salvo não compila. */
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
    // Decoração gravada que não passa mais no schema vira mesa sem decoração em vez de derrubar a carga.
    const desks = assignments.map(
      (assignment): DeskState => ({ ...assignment, decor: DeskDecor.safeParse(assignment.decor).data ?? null }),
    );
    return new SpaceRuntime(spaceId, compiled.map, row.mapVersion, deps, desks);
  }

  async function loadRuntime(spaceId: string): Promise<SpaceRuntime | null> {
    // Mapa ou mesa gravados durante a carga marcam o coworking; carrega de novo até estabilizar.
    for (;;) {
      staleSpaceIds.delete(spaceId);
      const runtime = await buildRuntime(spaceId);
      if (!staleSpaceIds.has(spaceId)) {
        if (runtime) loadedRuntimes.set(spaceId, runtime);
        return runtime;
      }
      runtime?.close();
    }
  }

  /** Runtime do coworking, reaproveitando a carga em andamento ou já feita. */
  function runtimeFor(spaceId: string): Promise<SpaceRuntime | null> {
    let runtimeLoad = runtimeLoads.get(spaceId);
    if (!runtimeLoad) {
      runtimeLoad = loadRuntime(spaceId);
      runtimeLoads.set(spaceId, runtimeLoad);
      // Falha não fica em cache: a próxima conexão tenta de novo.
      const loading = runtimeLoad;
      loading.then(
        (loadedRuntime) => {
          if (!loadedRuntime && runtimeLoads.get(spaceId) === loading) runtimeLoads.delete(spaceId);
        },
        () => {
          if (runtimeLoads.get(spaceId) === loading) runtimeLoads.delete(spaceId);
        },
      );
    }
    return runtimeLoad;
  }

  function unload(spaceId: string): void {
    loadedRuntimes.get(spaceId)?.close();
    loadedRuntimes.delete(spaceId);
    runtimeLoads.delete(spaceId);
    emptySince.delete(spaceId);
  }

  /** Resultado da autorização do upgrade: o necessário para abrir a conexão, ou o status da recusa. */
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
  const deny = (status: number, statusText: string): Authorized => ({ ok: false, status, text: statusText });

  /**
   * Mesma checagem das rotas HTTP, feita antes de aceitar o upgrade: caminho, origem, sessão e
   * participação no coworking pedido em `?space=`. Não membro recebe 404, como nas rotas.
   */
  async function authorize(request: IncomingMessage): Promise<Authorized> {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname !== '/ws') return deny(404, 'Not Found');
    // Cross-site WebSocket hijacking: o cookie vai junto em qualquer origem.
    if (request.headers.origin !== origin) return deny(403, 'Forbidden');

    const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];
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

  async function handleUpgrade(request: IncomingMessage, rawSocket: Duplex, head: Buffer): Promise<void> {
    // O `upgrade` tira o listener de erro do socket; sem este, um ECONNRESET durante as consultas
    // abaixo vira exceção não tratada e derruba o processo.
    rawSocket.on('error', () => rawSocket.destroy());
    const authorization = await authorize(request);
    if (!authorization.ok) {
      rejectUpgrade(rawSocket, authorization.status, authorization.text);
      return;
    }
    // O cliente pode ter desistido durante as consultas da autorização.
    if (rawSocket.destroyed) return;
    const { userId, spaceId, runtime } = authorization;

    webSocketServer.handleUpgrade(request, rawSocket, head, (socket) => {
      upgradesInProgress.set(spaceId, (upgradesInProgress.get(spaceId) ?? 0) + 1);
      const socketInfo: SocketInfo = { spaceId, tokenHash: authorization.tokenHash, expiresAt: authorization.expiresAt, alive: true };
      sockets.set(socket, socketInfo);
      socket.on('pong', () => {
        socketInfo.alive = true;
      });
      socket.on('error', () => {
        socket.terminate();
      });
      // A conexão como o runtime a vê: só enviar e fechar, com o teto de buffer e as métricas aqui.
      const connection: Conn = {
        send: (payload) => {
          if (socket.readyState !== socket.OPEN) return;
          if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
            socket.terminate();
            return;
          }
          if (deps.metrics) {
            deps.metrics.messagesOut++;
            deps.metrics.bytesOut += typeof payload === 'string' ? Buffer.byteLength(payload) : payload.byteLength;
          }
          socket.send(payload);
        },
        close: (code, reason) => {
          socket.close(code, reason);
        },
      };
      // A participação é conferida de novo já com o socket aberto: uma remoção gravada durante
      // a carga do runtime não chegou a ele, e o `connect` recolocaria a pessoa no mapa.
      void resolveMembership(deps.db, spaceId, userId)
        .then((membership) => {
          if (socket.readyState !== socket.OPEN) return;
          if (!membership) {
            socket.close(CLOSE_REMOVED, 'removed');
            return;
          }
          if (deps.metrics) deps.metrics.connectionsOpened++;
          // Mensagem binária ou fragmentada chega ao runtime como null e é tratada como inválida.
          socket.on('message', (rawMessage, isBinary) => {
            if (deps.metrics) deps.metrics.messagesIn++;
            runtime.onMessage(userId, connection, !isBinary && Buffer.isBuffer(rawMessage) ? rawMessage.toString('utf8') : null);
          });
          socket.on('close', () => {
            runtime.onClose(userId, connection);
          });
          emptySince.delete(spaceId);
          runtime.connect(membership.profile, connection);
        })
        .catch((error: unknown) => {
          deps.log.error(error, 'falha ao conferir participação na conexão');
          socket.close(1011, 'internal error');
        })
        .finally(() => {
          upgradesInProgress.set(spaceId, (upgradesInProgress.get(spaceId) ?? 1) - 1);
        });
      socket.on('close', () => {
        sockets.delete(socket);
      });
    });
  }

  server.on('upgrade', (request: IncomingMessage, rawSocket: Duplex, head: Buffer) => {
    handleUpgrade(request, rawSocket, head).catch((error: unknown) => {
      deps.log.error(error, 'falha no upgrade do websocket');
      rejectUpgrade(rawSocket, 500, 'Internal Server Error');
    });
  });

  /**
   * Rodada periódica: fecha conexões de sessão vencida, derruba as que não responderam ao último
   * ping e descarrega o runtime que ficou vazio por `idleUnloadMs`.
   */
  function sweep(): void {
    const now = deps.clock.now();
    for (const [socket, socketInfo] of sockets) {
      if (socketInfo.expiresAt <= now) {
        socket.close(CLOSE_SESSION_ENDED, 'session ended');
        continue;
      }
      // Conexão meio aberta (Wi-Fi caiu, notebook dormiu) não dispara close sozinha.
      if (!socketInfo.alive) {
        socket.terminate();
        continue;
      }
      socketInfo.alive = false;
      socket.ping();
    }
    // Upgrade em andamento conta como gente: o runtime não sai da memória no meio da entrada.
    for (const [spaceId, runtime] of loadedRuntimes) {
      if (runtime.memberCount() > 0 || (upgradesInProgress.get(spaceId) ?? 0) > 0) {
        emptySince.delete(spaceId);
        continue;
      }
      const emptySinceAt = emptySince.get(spaceId);
      if (emptySinceAt === undefined) emptySince.set(spaceId, now);
      else if (now - emptySinceAt >= idleUnloadMs) unload(spaceId);
    }
  }
  const heartbeat = setInterval(sweep, deps.heartbeatMs ?? HEARTBEAT_MS);
  heartbeat.unref();

  return {
    connections: () => sockets.size,
    players: () => [...loadedRuntimes.values()].reduce((sum, runtime) => sum + runtime.memberCount(), 0),
    games: () => [...loadedRuntimes.values()].reduce((sum, runtime) => sum + runtime.activeGames(), 0),
    runtimesLoaded: () => loadedRuntimes.size,
    runtime: (spaceId) => {
      const runtime = loadedRuntimes.get(spaceId);
      // Ainda carregando: a gravação que a rota acabou de fazer pode não ter entrado na leitura.
      if (!runtime && runtimeLoads.has(spaceId)) staleSpaceIds.add(spaceId);
      return runtime;
    },
    forEachRuntime: (callback) => {
      for (const runtime of loadedRuntimes.values()) callback(runtime);
    },
    closeSession: (tokenHash) => {
      for (const [socket, socketInfo] of sockets) {
        if (socketInfo.tokenHash.equals(tokenHash)) socket.close(CLOSE_SESSION_ENDED, 'session ended');
      }
    },
    sweep,
    close: () => {
      clearInterval(heartbeat);
      for (const runtimeLoad of runtimeLoads.values()) {
        runtimeLoad.then((loadedRuntime) => loadedRuntime?.close(), () => undefined);
      }
      for (const socket of sockets.keys()) socket.terminate();
      webSocketServer.close();
    },
  };
}
