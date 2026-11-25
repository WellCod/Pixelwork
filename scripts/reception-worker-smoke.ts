// pnpm exec tsx scripts/reception-worker-smoke.ts <python> [repetições]
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { parseEnv } from 'node:util';
import { liveKitMedia, spaceRoom } from '../packages/server/src/realtime/media.ts';
import { LocalReceptionWorker } from '../packages/server/src/realtime/reception-worker.ts';

const [python, argument = '30'] = process.argv.slice(2);
const trials = Number(argument);
if (!python || !Number.isInteger(trials) || trials < 1 || trials > 40) throw new Error('Informe Python e 1–40 repetições.');
const { LIVEKIT_API_KEY: apiKey, LIVEKIT_API_SECRET: apiSecret } = parseEnv(readFileSync(existsSync('.env') ? '.env' : '.env.example', 'utf8'));
if (!apiKey || !apiSecret) throw new Error('Informe as chaves do LiveKit local no ambiente de desenvolvimento.');
const url = 'ws://127.0.0.1:7880';
const media = liveKitMedia({ url, apiKey, apiSecret });
const spaceId = `reception-worker-smoke-${randomUUID()}`;
const room = spaceRoom(spaceId);
const [alice, bob, worker] = await Promise.all(['alice', 'bob', 'reception-worker'].map((identity) => media.token(identity, room, ['microphone'])));
if (!alice || !bob || !worker) throw new Error('Tokens locais ausentes.');
const code = randomUUID();
const abort = new AbortController();
let toolCalls = 0;
const voice = new LocalReceptionWorker(python, url, (usage) => console.log(JSON.stringify(usage)));
const child = spawn(python, [join(import.meta.dirname, 'reception-rtc-smoke.py')], {
  stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
});
let errorTail = '';
child.stderr.on('data', (bytes: Buffer) => { errorTail = (errorTail + bytes.toString()).slice(-2500); });
const output = createInterface({ input: child.stdout });
child.stdin.end(`${JSON.stringify({ url, tokens: { alice, bob }, mode: 'worker', trials })}\n`);
const timer = setTimeout(() => child.kill(), 95_000);
try {
  const completion = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (exit) => exit === 0 ? resolve() : reject(new Error(`Prova de áudio: saída ${exit}\n${errorTail}`)));
    output.on('line', (line) => {
      if (line !== 'START_WORKER') {
        console.log(line);
        return;
      }
      void voice.start({
        id: code, spaceId, identity: 'reception-worker', visitorId: 'alice', token: worker,
        tool: () => { toolCalls++; return { rooms: [{ name: 'Aurora', locked: false }] }; },
        ended: () => undefined,
      }, abort.signal).catch((error: unknown) => { child.kill(); reject(error instanceof Error ? error : new Error(String(error))); });
    });
  });
  await completion;
  if (toolCalls !== trials) throw new Error(`Foram executadas ${toolCalls} ferramentas para ${trials} turnos.`);
} finally {
  abort.abort();
  await voice.stop(code);
  clearTimeout(timer);
  output.close();
  await media.deleteRoom(room);
}
