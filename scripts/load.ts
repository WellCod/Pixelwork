// Teste de carga: `pnpm load --bots 50 [--seconds 30] [--port 3100]`.
// Sobe o servidor num processo filho com LOAD_TEST=true, entra N convidados no coworking de demo,
// faz cada um andar aleatoriamente e mede a latência tick -> recebimento (pelo `ts` do tick),
// o tamanho médio das mensagens e a CPU do processo do servidor. Fora do CI.
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { DIRS, STEP_MS, decodeTick, type Dir, type ServerMsg } from '@pixelwork/shared';
import WebSocket from 'ws';

const { values: cliArgs } = parseArgs({
  options: {
    bots: { type: 'string', default: '10' },
    seconds: { type: 'string', default: '30' },
    warmup: { type: 'string', default: '5' },
    port: { type: 'string', default: '3100' },
    'env-file': { type: 'string', default: '.env' },
  },
});
const BOT_COUNT = Number(cliArgs.bots);
const MEASURE_SECONDS = Number(cliArgs.seconds);
const WARMUP_SECONDS = Number(cliArgs.warmup);
const PORT = Number(cliArgs.port);
const BASE_URL = `http://127.0.0.1:${PORT}`;
// O servidor confere o Origin contra o PUBLIC_URL, então os bots se apresentam com o mesmo valor.
const ORIGIN = `http://localhost:${PORT}`;
const root = join(import.meta.dirname, '..');

const sleep = (durationMs: number) => new Promise((resolve) => setTimeout(resolve, durationMs));

/**
 * Percentil pelo método do posto mais próximo: o valor na posição `percent`% da lista ordenada,
 * limitado ao último elemento (p100 e listas curtas). NaN quando não há amostra.
 */
function percentile(sorted: number[], percent: number): number {
  if (sorted.length === 0) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor((percent / 100) * sorted.length))] ?? NaN;
}

const server = spawn(process.execPath, ['--import', 'tsx', `--env-file=${cliArgs['env-file']}`, 'packages/server/src/index.ts'], {
  cwd: root,
  env: { ...process.env, PORT: String(PORT), PUBLIC_URL: ORIGIN, LOAD_TEST: 'true' },
  stdio: ['ignore', 'ignore', 'inherit'],
});

/** Espera o /health responder, tentando a cada 200 ms por até 20 s. */
async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(`${BASE_URL}/health`)).ok) return;
    } catch {
      // ainda subindo
    }
    await sleep(200);
  }
  throw new Error('servidor não subiu');
}

interface CpuSample {
  cpu: { user: number; system: number };
  memory: { rss: number };
  uptimeMs: number;
}

const fetchStats = async (): Promise<CpuSample> =>
  (await (await fetch(`${BASE_URL}/internal/stats`)).json()) as CpuSample;

// Acumuladores da janela de medição; só contam enquanto `measuring` está ligado (fora do aquecimento).
let measuring = false;
const latenciesMs: number[] = [];
let tickBytes = 0;
let tickCount = 0;
let totalBytes = 0;
let totalMessages = 0;

/** Entra um convidado, conecta no WebSocket do primeiro coworking e começa a andar após o `welcome`. */
async function startBot(index: number): Promise<WebSocket> {
  const login = await fetch(`${BASE_URL}/auth/guest`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    body: '{}',
  });
  if (login.status !== 201) throw new Error(`login do bot ${index} falhou: ${login.status}`);
  // Só o par nome=valor do cookie de sessão, sem os atributos.
  const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const spaces = (await (await fetch(`${BASE_URL}/spaces`, { headers: { cookie } })).json()) as { id: string }[];
  const spaceId = spaces[0]?.id;
  if (!spaceId) throw new Error('bot sem coworking');

  const socket = new WebSocket(`ws://127.0.0.1:${PORT}/ws?space=${spaceId}`, { headers: { cookie, origin: ORIGIN } });
  let moveSeq = 0;
  let direction: Dir = 'down';
  let moveTimer: NodeJS.Timeout | null = null;
  socket.on('message', (payload: Buffer, isBinary: boolean) => {
    const receivedAt = Date.now();
    // O tick vem em binário; o resto em JSON.
    const tick = isBinary ? decodeTick(payload) : null;
    const message = tick
      ? ({ t: 'tick', ack: tick.ack, ts: tick.ts, moves: [] } satisfies ServerMsg)
      : (JSON.parse(payload.toString('utf8')) as ServerMsg);
    if (message.t === 'welcome' && !moveTimer) {
      // Passo a cada STEP_MS com um pouco de variação; troca de direção de vez em quando.
      moveTimer = setInterval(() => {
        if (Math.random() < 0.25) direction = DIRS[Math.floor(Math.random() * DIRS.length)] ?? 'down';
        socket.send(JSON.stringify({ t: 'move', seq: ++moveSeq, dir: direction }));
      }, STEP_MS + Math.floor(Math.random() * 40));
    }
    if (!measuring) return;
    totalBytes += payload.length;
    totalMessages++;
    if (message.t === 'tick') {
      tickBytes += payload.length;
      tickCount++;
      // Latência do envio do tick pelo servidor até a chegada aqui; vale porque os dois rodam na
      // mesma máquina e leem o mesmo relógio.
      if (message.ts !== undefined) latenciesMs.push(receivedAt - message.ts);
    }
  });
  socket.on('close', () => {
    if (moveTimer) clearInterval(moveTimer);
  });
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });
  return socket;
}

try {
  await waitForServer();
  const sockets: WebSocket[] = [];
  for (let i = 0; i < BOT_COUNT; i++) sockets.push(await startBot(i));
  console.log(`${BOT_COUNT} bots conectados; aquecendo ${WARMUP_SECONDS}s, medindo ${MEASURE_SECONDS}s`);
  await sleep(WARMUP_SECONDS * 1000);

  const statsBefore = await fetchStats();
  measuring = true;
  await sleep(MEASURE_SECONDS * 1000);
  measuring = false;
  const statsAfter = await fetchStats();

  // CPU do servidor na janela: tempo de CPU gasto (µs, user + system) sobre o tempo de parede (ms)
  // da mesma janela. Passa de 100% se o processo usar mais de um núcleo.
  const cpuMicros = statsAfter.cpu.user + statsAfter.cpu.system - (statsBefore.cpu.user + statsBefore.cpu.system);
  const wallMs = statsAfter.uptimeMs - statsBefore.uptimeMs;
  const sortedLatencies = [...latenciesMs].sort((latencyA, latencyB) => latencyA - latencyB);
  const result = {
    bots: BOT_COUNT,
    segundos: MEASURE_SECONDS,
    ticksRecebidos: tickCount,
    latenciaP50ms: percentile(sortedLatencies, 50),
    latenciaP95ms: percentile(sortedLatencies, 95),
    latenciaP99ms: percentile(sortedLatencies, 99),
    tickMedioBytes: Math.round(tickBytes / Math.max(1, tickCount)),
    mensagemMediaBytes: Math.round(totalBytes / Math.max(1, totalMessages)),
    mensagensPorBotPorSegundo: Number((totalMessages / BOT_COUNT / MEASURE_SECONDS).toFixed(1)),
    cpuServidorPercent: Number(((cpuMicros / 1000 / wallMs) * 100).toFixed(1)),
    rssServidorMB: Math.round(statsAfter.memory.rss / 1024 / 1024),
  };
  console.log(JSON.stringify(result, null, 2));
  for (const socket of sockets) socket.close();
} finally {
  server.kill();
}
