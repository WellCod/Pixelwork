import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { ReceptionVoice, ReceptionVoiceRequest } from './reception-runtime.ts';

const MAX_LINE = 12_288;
const Output = z.discriminatedUnion('t', [
  z.strictObject({ t: z.literal('ready') }),
  z.strictObject({ t: z.literal('tool'), input: z.unknown() }),
  z.strictObject({ t: z.literal('usage'), inputMs: z.number().int().nonnegative(), outputMs: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative().optional(), outputTokens: z.number().int().nonnegative().optional() }),
]);

interface Running {
  process: ChildProcessWithoutNullStreams;
  closed: Promise<void>;
}

/** Processo por lease. O token RTC viaja pelo stdin. */
export class LocalReceptionWorker implements ReceptionVoice {
  private readonly jobs = new Map<string, Running>();
  private readonly script = join(import.meta.dirname, 'reception_worker.py');

  constructor(private readonly python: string, private readonly rtcUrl: string, private readonly usage: (counts: {
    sessionId: string; spaceId: string; inputMs: number; outputMs: number; inputTokens: number; outputTokens: number;
  }) => void, private readonly local?: { modelsDir: string; llmUrl: string }) {}

  get mode(): 'local' | undefined { return this.local ? 'local' : undefined; }

  ready(): boolean {
    const local = this.local;
    return existsSync(this.python) && existsSync(this.script) && (!local ||
      ['whisper-small/model.bin', 'whisper-small/tokenizer.json', 'pt_BR-faber-medium.onnx', 'pt_BR-faber-medium.onnx.json']
        .every((file) => existsSync(join(local.modelsDir, file))));
  }

  start(request: ReceptionVoiceRequest, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const child = spawn(this.python, ['-u', this.script], {
      windowsHide: true,
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        PYTHONIOENCODING: 'utf-8',
        PYTHONDONTWRITEBYTECODE: '1',
      },
    });
    // O SDK escreve diagnósticos no stderr. O supervisor registra a falha operacional por lease.
    child.stderr.resume();
    child.stdin.on('error', () => undefined);
    const stop = () => { child.kill(); };
    signal.addEventListener('abort', stop, { once: true });
    let inputMs = 0;
    let outputMs = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    const closed = new Promise<void>((resolve) => {
      child.once('close', () => {
        signal.removeEventListener('abort', stop);
        this.jobs.delete(request.id);
        this.usage({ sessionId: request.id, spaceId: request.spaceId, inputMs, outputMs, inputTokens, outputTokens });
        resolve();
      });
    });
    this.jobs.set(request.id, { process: child, closed });

    return new Promise<void>((resolve, reject) => {
      let buffer = '';
      let ready = false;
      const deadline = setTimeout(() => { stop(); reject(new Error('tempo de conexão da recepção excedido')); }, this.local ? 25_000 : 8_000);
      child.once('error', () => { clearTimeout(deadline); reject(new Error('processo da recepção indisponível')); });
      child.once('close', () => {
        clearTimeout(deadline);
        if (!ready) reject(new Error('a recepção encerrou antes de conectar'));
        else if (!signal.aborted) request.ended();
      });
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
        buffer += chunk;
        if (buffer.length > MAX_LINE) { stop(); return; }
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          let value: unknown;
          try { value = JSON.parse(line) as unknown; } catch { stop(); return; }
          const result = Output.safeParse(value);
          if (!result.success || signal.aborted) { stop(); return; }
          if (result.data.t === 'ready') {
            clearTimeout(deadline);
            ready = true;
            resolve();
          } else if (result.data.t === 'tool') {
            child.stdin.write(`${JSON.stringify(request.tool(result.data.input))}\n`);
          } else {
            inputMs += result.data.inputMs;
            outputMs += result.data.outputMs;
            inputTokens += result.data.inputTokens ?? 0;
            outputTokens += result.data.outputTokens ?? 0;
          }
        }
      });
      child.stdin.write(`${JSON.stringify({ url: this.rtcUrl, token: request.token, visitorId: request.visitorId, local: this.local })}\n`);
    });
  }

  async stop(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;
    job.process.kill();
    await job.closed;
  }
}
