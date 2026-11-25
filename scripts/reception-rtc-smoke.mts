// Rode com pnpm exec tsx scripts/reception-rtc-smoke.mts <python> [worker.py].
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

const [python, probe = join(import.meta.dirname, 'reception-rtc-smoke.py')] = process.argv.slice(2);
if (!python) throw new Error('Informe o executável do Python com livekit instalado.');
const config = parseEnv(readFileSync(existsSync('.env') ? '.env' : '.env.example', 'utf8'));
const { LIVEKIT_API_KEY: apiKey, LIVEKIT_API_SECRET: apiSecret } = config;
if (!apiKey || !apiSecret) throw new Error('O .env de desenvolvimento precisa ter as chaves locais do LiveKit.');
const { liveKitMedia, spaceRoom } = await import(pathToFileURL(join(process.cwd(), 'packages/server/src/realtime/media.ts')).href) as typeof import('../packages/server/src/realtime/media.ts');
const url = 'ws://127.0.0.1:7880';
const media = liveKitMedia({ url, apiKey, apiSecret });
const room = spaceRoom(`reception-smoke-${randomUUID()}`);
const identities = ['alice', 'bob', 'reception-first', 'reception-next'];
const tokens = Object.fromEntries(await Promise.all(identities.map(async (identity) => [identity, await media.token(identity, room, ['microphone'])])));

try {
  const child = spawn(python, [probe], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  let diagnostics = '';
  child.stderr.on('data', (chunk: Buffer) => { diagnostics = (diagnostics + chunk.toString()).slice(-3200); });
  const output = createInterface({ input: child.stdout });
  child.stdin.write(`${JSON.stringify({ url, tokens })}\n`);
  const timeout = setTimeout(() => child.kill(), 65_000);
  const completion = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`RTC: saída ${code}\n${diagnostics}`)));
  });
  output.on('line', (line) => {
    if (line !== 'REMOVE_FIRST') {
      console.log(line);
      return;
    }
    void media.removeParticipant(room, 'reception-first').then(
      () => child.stdin.end('REMOVED\n'),
      () => child.stdin.end('REMOVE_FAILED\n'),
    );
  });
  try {
    await completion;
  } finally {
    clearTimeout(timeout);
    output.close();
  }
} finally {
  await media.deleteRoom(room);
}
