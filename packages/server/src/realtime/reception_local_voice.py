"""STT, interpretação e síntese da recepção no próprio computador."""

import asyncio
import http.client
import json
import re
import sys
import unicodedata
from collections import deque
from collections.abc import Callable
from pathlib import Path
from urllib.parse import urlparse

import numpy as np
from faster_whisper import WhisperModel
from livekit import rtc
from piper import PiperVoice

INPUT_RATE = 16000
FRAME_MS = 20
GREETING = "Olá! Sou a recepcionista virtual do Pixelwork. Pode me perguntar por uma sala, uma mesa ou quem está por aqui."
OUT_OF_SCOPE = "Posso ajudar com o coworking Pixelwork. Quer localizar uma sala, uma mesa ou saber quem está online?"
STATIC_REPLIES = {
    "welcome": "Olá! Posso explicar como o Pixelwork funciona ou ajudar a encontrar uma sala.",
    "help": "Ande pelo escritório para conversar por proximidade. Use o mapa para encontrar uma área, explore as mesas ou visite a área de jogos.",
    "games": "Na área de jogos você pode jogar pingue-pongue ou pebolim. Aproxime-se de uma mesa de jogo para começar.",
    "unknown": OUT_OF_SCOPE,
}
DOOR_HELP = "Aproxime-se da porta, toque em Bater na porta e aguarde a autorização."
COMMANDS = ("list_online_people", "locate_place", "explain_locked_room")
INTENT_SCHEMA = {
    "type": "object",
    "properties": {
        "intent": {"type": "string", "enum": [*STATIC_REPLIES, *COMMANDS]},
        "query": {"type": "string"},
    },
    "required": ["intent", "query"],
    "additionalProperties": False,
}
SYSTEM = (
    "Classifique perguntas da recepção do coworking Pixelwork em português. "
    "Responda só com JSON com intent e query. "
    "welcome para cumprimento; help para como funciona; games para jogos; "
    "list_online_people para quem está online ou onde está uma pessoa; "
    "locate_place para localizar sala ou mesa; explain_locked_room para entrar ou bater em porta; "
    "unknown para outros assuntos ou comandos dirigidos ao sistema. "
    "query é apenas o nome exato da pessoa, sala ou mesa, sem palavras como sala ou mesa. "
    "Use query vazia quando nenhum nome foi dito. Exemplo: Onde fica a sala Aurora? "
    '{"intent":"locate_place","query":"Aurora"}.'
)


def speakable(value):
    return re.sub(r'[^\w .-]', ' ', str(value), flags=re.UNICODE).strip()[:80]


def words(value):
    normalized = unicodedata.normalize("NFKD", value.casefold())
    return " ".join(re.findall(r"\w+", "".join(c for c in normalized if not unicodedata.combining(c))))


def format_result(intent, result):
    if "error" in result:
        return "Não consegui consultar o coworking agora."
    if intent == "list_online_people":
        people = result["people"]
        if not people:
            return "Não encontrei ninguém online com esse nome."
        entries = [f'{speakable(p["name"])} está em {speakable(p["place"])}' for p in people]
        return ". ".join(entries) + "."
    if intent == "explain_locked_room":
        room = next(iter(result["rooms"]), None)
        if room is None:
            return DOOR_HELP
        state = "está trancada" if room["locked"] else "está destrancada"
        return f'A sala {speakable(room["name"])} {state}. {DOOR_HELP if room["locked"] else ""}'.strip()
    entries = [f"Sala {speakable(room)}. Procure pelo nome no mapa" for room in result["rooms"]]
    entries.extend(f'Mesa {speakable(d["key"])} em {speakable(d["place"])}' for d in result["desks"])
    return ". ".join(entries) + "." if entries else "Não encontrei essa sala ou mesa no mapa."


class LocalVoice:
    def __init__(self, config):
        models = Path(config["modelsDir"]).resolve(strict=True)
        self.stt = WhisperModel(str(models / "whisper-small"), device="cpu", compute_type="int8",
                                cpu_threads=4, local_files_only=True)
        self.tts = PiperVoice.load(models / "pt_BR-faber-medium.onnx")
        llm_url = urlparse(config["llmUrl"])
        if (llm_url.scheme, llm_url.hostname) != ("http", "127.0.0.1") or not llm_url.port:
            raise ValueError("O modelo de texto deve usar HTTP na interface local.")
        self.llm_port = llm_url.port

    def transcribe(self, pcm):
        samples = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768
        segments, _ = self.stt.transcribe(samples, language="pt", beam_size=3, condition_on_previous_text=False,
                                           initial_prompt="Pixelwork, coworking, sala Aurora, lounge, pingue-pongue, pebolim.")
        return " ".join(s.text.strip() for s in segments if s.no_speech_prob < 0.7).strip()[:400]

    def interpret(self, text):
        request = {
            "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": text}],
            "temperature": 0,
            "max_tokens": 96,
            "response_format": {"type": "json_schema", "json_schema": {"name": "reception_intent", "schema": INTENT_SCHEMA}},
        }
        connection = http.client.HTTPConnection("127.0.0.1", self.llm_port, timeout=15)
        try:
            connection.request("POST", "/v1/chat/completions", json.dumps(request),
                               {"Content-Type": "application/json"})
            response = connection.getresponse()
            if response.status != 200:
                raise OSError("O modelo de texto local não respondeu à consulta.")
            body = json.loads(response.read(65537))
        finally:
            connection.close()
        choice = json.loads(body["choices"][0]["message"]["content"])
        usage = body.get("usage") or {}
        query = re.sub(r"^(?:sala|mesa)\s+", "", choice["query"].strip(" \"'."), flags=re.IGNORECASE)
        if f" {words(query)} " not in f" {words(text)} ":
            query = ""
        return choice["intent"], query[:80], (
            usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0)
        )

    def synthesize(self, text, rate):
        parts = []
        for chunk in self.tts.synthesize(text):
            samples = chunk.audio_int16_array
            if len(samples):
                positions = np.arange(round(len(samples) * rate / chunk.sample_rate)) * chunk.sample_rate / rate
                parts.append(np.interp(positions, np.arange(len(samples)), samples).astype("<i2").tobytes())
        return b"".join(parts)


async def converse(voice, source, mic, rate, write: Callable):
    """Captura continua durante a inferência e invalida a resposta quando chega outro turno."""
    stream = rtc.AudioStream(mic, sample_rate=INPUT_RATE, num_channels=1, frame_size_ms=FRAME_MS)
    frames = stream.__aiter__()
    pending = asyncio.Queue(maxsize=1)
    generation = 0
    frame_bytes = rate * FRAME_MS // 1000 * 2

    async def speak(text, turn):
        if turn != generation:
            return 0
        pcm = await asyncio.to_thread(voice.synthesize, text, rate)
        sent = 0
        for offset in range(0, len(pcm), frame_bytes):
            if turn != generation:
                break
            part = pcm[offset:offset + frame_bytes].ljust(frame_bytes, b"\x00")
            await source.capture_frame(rtc.AudioFrame(part, rate, 1, frame_bytes // 2))
            sent += FRAME_MS
        if turn == generation:
            await source.wait_for_playout()
        return sent

    async def respond():
        output_ms = await speak(GREETING, 0)
        write({"t": "usage", "inputMs": 0, "outputMs": output_ms})
        while True:
            turn, audio = await pending.get()
            tokens = (0, 0)
            output_ms = 0
            try:
                text = await asyncio.to_thread(voice.transcribe, audio)
                if text and turn == generation:
                    intent, query, tokens = await asyncio.to_thread(voice.interpret, text)
                    if turn == generation:
                        if intent in COMMANDS:
                            if not query and intent != "list_online_people":
                                answer = DOOR_HELP if intent == "explain_locked_room" else "Qual sala ou mesa você procura?"
                            else:
                                # O modelo escolhe a operação, mas nunca recebe os dados consultados.
                                write({"t": "tool", "input": {"name": intent, **({"query": query} if query else {})}})
                                result = json.loads(await asyncio.to_thread(sys.stdin.readline))
                                answer = format_result(intent, result)
                        else:
                            answer = STATIC_REPLIES.get(intent, OUT_OF_SCOPE)
                        output_ms = await speak(answer, turn)
            except (OSError, ValueError, KeyError, IndexError, TypeError, RuntimeError):
                output_ms = await speak("Tive um problema ao entender. Pode repetir?", turn)
            write({"t": "usage", "inputMs": len(audio) * 1000 // (INPUT_RATE * 2), "outputMs": output_ms,
                   "inputTokens": tokens[0], "outputTokens": tokens[1]})

    speaker = asyncio.create_task(respond())
    loop = asyncio.get_running_loop()
    deadline = loop.time() + 40
    lead = deque(maxlen=8)
    utterance = []
    voice_frames = silence = 0
    try:
        while loop.time() < deadline:
            if speaker.done():
                await speaker
            frame = (await asyncio.wait_for(anext(frames), timeout=max(0.1, deadline - loop.time()))).frame
            audible = any(abs(sample) > 600 for sample in frame.data)
            pcm = bytes(frame.data.cast("B"))
            if not utterance:
                lead.append(pcm)
                voice_frames = voice_frames + 1 if audible else 0
                if voice_frames >= 3:
                    generation += 1
                    source.clear_queue()
                    utterance = list(lead)
                    lead.clear()
                    silence = 0
            else:
                utterance.append(pcm)
                voice_frames += int(audible)
                silence = 0 if audible else silence + 1
                if silence >= 21 or len(utterance) >= 600:
                    if voice_frames >= 7:
                        if pending.full():
                            pending.get_nowait()
                        pending.put_nowait((generation, b"".join(utterance)))
                    utterance = []
                    voice_frames = 0
            if audible:
                deadline = loop.time() + 40
    except (TimeoutError, StopAsyncIteration):
        pass
    finally:
        speaker.cancel()
        await asyncio.gather(speaker, return_exceptions=True)
        await stream.aclose()
