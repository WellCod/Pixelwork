// Teste de carga: `pnpm load --bots 50 [--seconds 30] [--port 3100]`.
// Sobe o servidor num processo filho com LOAD_TEST=true, entra N convidados no coworking de demo,
// faz cada um andar aleatoriamente e mede a latência tick -> recebimento (pelo `ts` do tick),
// o tamanho médio das mensagens e a CPU do processo do servidor. Fora do CI.
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { DIRS, STEP_MS, type Dir, type ServerMsg } from '@pixelwork/shared';
import WebSocket from 'ws';

const { values } = parseArgs({
  options: {
    bots: { type: 'string', default: '10' },
    seconds: { type: 'string', default: '30' },
    warmup: { type: 'string', default: '5' },
    port: { type: 'string', default: '3100' },
  },
});
const BOTS = Number(values.bots);
const SECONDS = Number(values.seconds);
const WARMUP = Number(values.warmup);
const PORT = Number(values.port);
const BASE = `http://127.0.0.1:${PORT}`;
const ORIGIN = `http://localhost:${PORT}`;
const root = join(import.meta.dirname, '..');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? NaN;
}

const server = spawn(process.execPath, ['--import', 'tsx', '--env-file=.env', 'packages/server/src/index.ts'], {
  cwd: root,
  env: { ...process.env, PORT: String(PORT), PUBLIC_URL: ORIGIN, LOAD_TEST: 'true' },
  stdio: ['ignore', 'ignore', 'inherit'],
});

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
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

const stats = async (): Promise<CpuSample> => (await (await fetch(`${BASE}/internal/stats`)).json()) as CpuSample;

let measuring = false;
const latencies: number[] = [];
let tickBytes = 0;
let tickCount = 0;
let totalBytes = 0;
let totalMessages = 0;

async function startBot(index: number): Promise<WebSocket> {
  const login = await fetch(`${BASE}/auth/guest`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    body: '{}',
  });
  if (login.status !== 201) throw new Error(`login do bot ${index} falhou: ${login.status}`);
  const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const spaces = (await (await fetch(`${BASE}/spaces`, { headers: { cookie } })).json()) as { id: string }[];
  const spaceId = spaces[0]?.id;
  if (!spaceId) throw new Error('bot sem coworking');

  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?space=${spaceId}`, { headers: { cookie, origin: ORIGIN } });
  let seq = 0;
  let dir: Dir = 'down';
  let timer: NodeJS.Timeout | null = null;
  ws.on('message', (data: Buffer) => {
    const received = Date.now();
    const msg = JSON.parse(data.toString('utf8')) as ServerMsg;
    if (msg.t === 'welcome' && !timer) {
      // Passo a cada STEP_MS com um pouco de variação; troca de direção de vez em quando.
      timer = setInterval(() => {
        if (Math.random() < 0.25) dir = DIRS[Math.floor(Math.random() * DIRS.length)] ?? 'down';
        ws.send(JSON.stringify({ t: 'move', seq: ++seq, dir }));
      }, STEP_MS + Math.floor(Math.random() * 40));
    }
    if (!measuring) return;
    totalBytes += data.length;
    totalMessages++;
    if (msg.t === 'tick') {
      tickBytes += data.length;
      tickCount++;
      if (msg.ts !== undefined) latencies.push(received - msg.ts);
    }
  });
  ws.on('close', () => {
    if (timer) clearInterval(timer);
  });
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  return ws;
}

try {
  await waitForServer();
  const sockets: WebSocket[] = [];
  for (let i = 0; i < BOTS; i++) sockets.push(await startBot(i));
  console.log(`${BOTS} bots conectados; aquecendo ${WARMUP}s, medindo ${SECONDS}s`);
  await sleep(WARMUP * 1000);

  const before = await stats();
  measuring = true;
  await sleep(SECONDS * 1000);
  measuring = false;
  const after = await stats();

  const cpuMicros = after.cpu.user + after.cpu.system - (before.cpu.user + before.cpu.system);
  const wallMs = after.uptimeMs - before.uptimeMs;
  const sorted = [...latencies].sort((a, b) => a - b);
  const result = {
    bots: BOTS,
    segundos: SECONDS,
    ticksRecebidos: tickCount,
    latenciaP50ms: percentile(sorted, 50),
    latenciaP95ms: percentile(sorted, 95),
    latenciaP99ms: percentile(sorted, 99),
    tickMedioBytes: Math.round(tickBytes / Math.max(1, tickCount)),
    mensagemMediaBytes: Math.round(totalBytes / Math.max(1, totalMessages)),
    mensagensPorBotPorSegundo: Number((totalMessages / BOTS / SECONDS).toFixed(1)),
    cpuServidorPercent: Number(((cpuMicros / 1000 / wallMs) * 100).toFixed(1)),
    rssServidorMB: Math.round(after.memory.rss / 1024 / 1024),
  };
  console.log(JSON.stringify(result, null, 2));
  for (const ws of sockets) ws.close();
} finally {
  server.kill();
}
