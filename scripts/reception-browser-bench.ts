/// <reference lib="dom" />
/* global window, navigator, AudioContext, AudioWorkletNode, MediaStream, atob */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';

interface AudioBenchmark {
  audioContext: () => AudioContext;
  mic: () => MediaStreamAudioDestinationNode | undefined;
  buffers: AudioBuffer[];
  lastSound: number;
  firstSound: number;
  questionEnd: number;
  firstReply: number;
  disconnect: () => void;
}

declare global {
  interface Window {
    receptionBench: AudioBenchmark;
    __pixelwork?: {
      world: { receptionSession?: { state: string; identity: string } };
      media: {
        connected: boolean;
        debugState: () => Record<string, { audio: boolean }>;
        room: { remoteParticipants: Map<string, RemoteParticipant> };
      };
    };
  }
}

interface RemoteParticipant {
  audioTrackPublications: Map<string, { track?: { mediaStreamTrack: MediaStreamTrack } }>;
}

const [origin, python, modelPath, count = '20'] = process.argv.slice(2);
const turns = Number(count);
assert.ok(origin && python && modelPath && Number.isInteger(turns) && turns >= 1,
  'Uso: node scripts/reception-browser-bench.ts URL PYTHON MODELO_PIPER [TURNOS]');

const questions = [
  'Onde fica a sala Aurora?',
  'Como entro numa sala trancada?',
  'Quem está online agora?',
  'Qual é a capital da França?',
];
const fixtureScript = String.raw`
import base64
import io
import json
import sys
import wave

import numpy as np
from piper import PiperVoice, SynthesisConfig

voice = PiperVoice.load(sys.argv[1])
for question in json.loads(sys.argv[2]):
    chunks = list(voice.synthesize(question, SynthesisConfig(noise_scale=0, noise_w_scale=0)))
    samples = np.concatenate([chunk.audio_int16_array for chunk in chunks])
    audible = np.flatnonzero(np.abs(samples.astype(np.int32)) > 600)
    data = samples[:audible[-1] + 1].astype("<i2").tobytes()
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setparams((1, 2, chunks[0].sample_rate, 0, "NONE", "not compressed"))
        wav.writeframes(data)
    print(base64.b64encode(buffer.getvalue()).decode())
`;
const generated = spawnSync(python, ['-B', '-c', fixtureScript, modelPath, JSON.stringify(questions)], {
  encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' }, maxBuffer: 4 * 1024 * 1024,
});
assert.equal(generated.status, 0, generated.stderr || String(generated.error));
const fixtures = generated.stdout.trim().split(/\r?\n/);
assert.equal(fixtures.length, questions.length);

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required'],
});
try {
  const context = await browser.newContext({ permissions: ['microphone'] });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    let mic: MediaStreamAudioDestinationNode | undefined;
    let audio: AudioContext | undefined;
    const audioContext = () => audio ??= new AudioContext({ sampleRate: 48000 });
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (constraints?.audio && !constraints.video) {
        mic = audioContext().createMediaStreamDestination();
        return mic.stream;
      }
      return getUserMedia(constraints);
    };
    window.receptionBench = { audioContext, mic: () => mic, buffers: [], lastSound: 0, firstSound: 0, firstReply: 0,
      questionEnd: Infinity, disconnect: () => undefined };
  });
  await page.goto(origin);
  await page.getByRole('button', { name: 'Entrar como convidado', exact: true }).click();
  const tutorial = page.getByRole('button', { name: 'Entendi', exact: true });
  if (await tutorial.isVisible()) await tutorial.click();
  await page.waitForFunction(() => window.__pixelwork?.media.connected);
  await page.getByRole('button', { name: 'Ligar microfone', exact: true }).click();
  await page.waitForFunction(() => window.receptionBench.mic());
  await page.evaluate(async (wavFiles) => {
    const bench = window.receptionBench;
    const audio = bench.audioContext();
    await audio.resume();
    const worklet = new Blob([`
      class ReceptionAudioProbe extends AudioWorkletProcessor {
        process(inputs) {
          if (inputs[0]?.[0]?.some((sample) => Math.abs(sample) > 0.01)) this.port.postMessage(currentTime);
          return true;
        }
      }
      registerProcessor('reception-audio-probe', ReceptionAudioProbe);
    `], { type: 'text/javascript' });
    const url = URL.createObjectURL(worklet);
    try { await audio.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
    bench.buffers = await Promise.all(wavFiles.map((file) =>
      audio.decodeAudioData(Uint8Array.from(atob(file), (character) => character.charCodeAt(0)).buffer)));
  }, fixtures);

  async function startSession() {
    const requestedAt = await page.evaluate(() => window.receptionBench.audioContext().currentTime);
    await page.getByRole('button', { name: 'Conversar com IA', exact: true }).click();
    await page.waitForFunction(() => window.__pixelwork?.world.receptionSession?.state === 'active', null, { timeout: 30_000 });
    await page.waitForFunction(() => {
      const world = window.__pixelwork;
      const identity = world?.world.receptionSession?.identity;
      return identity ? world.media.debugState()[identity]?.audio : false;
    });
    await page.evaluate(() => {
      const bench = window.receptionBench;
      const audio = bench.audioContext();
      const world = window.__pixelwork;
      const identity = world?.world.receptionSession?.identity;
      const participant = identity ? world.media.room.remoteParticipants.get(identity) : undefined;
      const publication = participant?.audioTrackPublications.values().next().value;
      const track = publication?.track?.mediaStreamTrack;
      if (!track) throw new Error('Trilha da recepção indisponível.');
      const remote = audio.createMediaStreamSource(new MediaStream([track]));
      const probe = new AudioWorkletNode(audio, 'reception-audio-probe');
      const muted = audio.createGain();
      muted.gain.value = 0;
      remote.connect(probe).connect(muted).connect(audio.destination);
      bench.lastSound = 0;
      bench.firstSound = 0;
      bench.firstReply = 0;
      bench.questionEnd = Infinity;
      probe.port.onmessage = (event: MessageEvent<unknown>) => {
        const time = event.data;
        if (typeof time !== 'number') return;
        if (!bench.firstSound) bench.firstSound = time;
        bench.lastSound = time;
        if (time >= bench.questionEnd && !bench.firstReply) bench.firstReply = time;
      };
      bench.disconnect = () => { remote.disconnect(); probe.disconnect(); muted.disconnect(); };
    });
    await page.waitForFunction(() => {
      const bench = window.receptionBench;
      return bench.lastSound && bench.audioContext().currentTime - bench.lastSound > 0.60;
    }, null, { timeout: 20_000 });
    return page.evaluate((start) => Math.round((window.receptionBench.firstSound - start) * 1000), requestedAt);
  }

  async function ask(index: number) {
    await page.evaluate((fixtureIndex) => {
      const bench = window.receptionBench;
      const audio = bench.audioContext();
      const source = audio.createBufferSource();
      const buffer = bench.buffers[fixtureIndex];
      const mic = bench.mic();
      if (!buffer || !mic) throw new Error('Entrada de áudio indisponível.');
      source.buffer = buffer;
      source.connect(mic);
      source.onended = () => source.disconnect();
      const start = audio.currentTime + 0.10;
      bench.firstReply = 0;
      bench.questionEnd = start + source.buffer.duration;
      source.start(start);
    }, index);
    await page.waitForFunction(() => window.receptionBench.firstReply > 0, null, { timeout: 20_000 });
    const latency = await page.evaluate(() => {
      const bench = window.receptionBench;
      return (bench.firstReply - bench.questionEnd) * 1000;
    });
    await page.waitForFunction(() => {
      const bench = window.receptionBench;
      return bench.audioContext().currentTime - bench.lastSound > 0.55;
    }, null, { timeout: 25_000 });
    return Math.round(latency);
  }

  const measurements: number[] = [];
  const failures: number[] = [];
  const greetings: number[] = [];
  const firstTurns: number[] = [];
  const failedSessions: number[] = [];
  console.log(`Chrome ${browser.version()}, ${turns} turnos`);
  const turnsPerSession = 5;
  for (let offset = 0; offset < turns; offset += turnsPerSession) {
    try {
      greetings.push(await startSession());
      firstTurns.push(await ask(0));
      for (let index = offset; index < Math.min(turns, offset + turnsPerSession); index++) {
        try {
          const latency = await ask(index % questions.length);
          measurements.push(latency);
          console.log(`${index + 1}. ${questions[index % questions.length] ?? ''} ${latency} ms`);
        } catch (error) {
          failures.push(index + 1);
          console.error(`${index + 1}. Falha ao medir o turno`, error);
        }
      }
    } catch (error) {
      failedSessions.push(1 + Math.floor(offset / turnsPerSession));
      console.error('Falha ao iniciar ou aquecer uma sessão', error);
    } finally {
      await page.evaluate(() => window.receptionBench.disconnect());
      const stop = page.getByRole('button', { name: 'Encerrar', exact: true });
      if (await stop.isVisible()) {
        await stop.click();
        await page.waitForFunction(() => window.__pixelwork?.world.receptionSession?.state === 'ended');
        await page.getByRole('button', { name: 'Conversar com IA', exact: true }).waitFor();
      }
    }
  }
  const sorted = [...measurements].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.ceil(sorted.length * p) - 1];
  console.log(JSON.stringify({ turns, measurements, failures, greetings, firstTurns, failedSessions, p50: percentile(0.50), p95: percentile(0.95) }));
  assert.equal(measurements.length, turns, 'A amostra está incompleta.');
} finally {
  await browser.close();
}
