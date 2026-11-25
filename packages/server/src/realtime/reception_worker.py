"""Conexão RTC da recepção, com voz local opcional e dublê para testes."""

import asyncio
import json
import math
import sys
from array import array

from livekit import rtc

RATE = 48000
SAMPLES = 960
FRAME_MS = 20
TOOLS = (
    {"name": "locate_place", "query": "Aurora"},
    {"name": "explain_locked_room", "query": "Aurora"},
    {"name": "list_online_people"},
)


def write(message):
    print(json.dumps(message, separators=(",", ":")), flush=True)


def tone(frequency):
    data = array("h", (round(4200 * math.sin(2 * math.pi * frequency * i / RATE)) for i in range(SAMPLES)))
    return rtc.AudioFrame(data.tobytes(), RATE, 1, SAMPLES)


async def play(source, frequency):
    frame = tone(frequency)
    count = 0
    for _ in range(22):
        await source.capture_frame(frame)
        count += 1
        await asyncio.sleep(FRAME_MS / 1000)
    await source.wait_for_playout()
    return count * FRAME_MS


async def worker(config):
    local_voice = None
    if config.get("local"):
        from reception_local_voice import LocalVoice

        local_voice = await asyncio.to_thread(LocalVoice, config["local"])

    room = rtc.Room()
    visitor_id = config["visitorId"]
    live = asyncio.get_running_loop()
    published_mic = live.create_future()
    source = rtc.AudioSource(RATE, 1, queue_size_ms=100)

    def select(publication, participant):
        if participant.identity == visitor_id and publication.source == rtc.TrackSource.SOURCE_MICROPHONE:
            publication.set_subscribed(True)

    def on_input(track, publication, participant):
        if participant.identity == visitor_id and publication.source == rtc.TrackSource.SOURCE_MICROPHONE and not published_mic.done():
            published_mic.set_result(track)

    room.on("track_published", select)
    room.on("track_subscribed", on_input)
    playback = None
    try:
        await room.connect(config["url"], config["token"], rtc.RoomOptions(auto_subscribe=False))
        room.local_participant.set_track_subscription_permissions(
            allow_all_participants=False,
            participant_permissions=[rtc.ParticipantTrackPermission(participant_identity=visitor_id, allow_all=True)],
        )
        output = rtc.LocalAudioTrack.create_audio_track("recepcao", source)
        await room.local_participant.publish_track(output, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE))
        for participant in room.remote_participants.values():
            for publication in participant.track_publications.values():
                select(publication, participant)
        write({"t": "ready"})

        if local_voice:
            from reception_local_voice import converse

            await converse(local_voice, source, await asyncio.wait_for(published_mic, timeout=20), RATE, write)
            return

        playback = asyncio.create_task(play(source, 400))
        mic = await asyncio.wait_for(published_mic, timeout=20)
        stream = rtc.AudioStream(mic, sample_rate=RATE, num_channels=1)
        frames = stream.__aiter__()
        turn = voice_frames = silence_frames = 0
        deadline = live.time() + 20
        try:
            while live.time() < deadline:
                event = await asyncio.wait_for(anext(frames), timeout=max(0.1, deadline - live.time()))
                audible = max(map(abs, event.frame.data), default=0) >= 850
                if audible:
                    if voice_frames == 0 and playback and not playback.done():
                        playback.cancel()
                        await asyncio.gather(playback, return_exceptions=True)
                        source.clear_queue()
                    voice_frames += 1
                    silence_frames = 0
                    deadline = live.time() + 20
                    continue
                if not voice_frames:
                    continue
                silence_frames += 1
                if silence_frames < 12:
                    continue
                request = TOOLS[turn % len(TOOLS)]
                turn += 1
                write({"t": "tool", "input": request})
                reply = json.loads(await asyncio.to_thread(sys.stdin.readline))
                if "error" in reply:
                    break

                async def respond(input_ms, frequency):
                    output_ms = await play(source, frequency)
                    write({"t": "usage", "inputMs": input_ms, "outputMs": output_ms})

                playback = asyncio.create_task(respond(voice_frames * FRAME_MS, 450 + 50 * (turn % 3)))
                voice_frames = silence_frames = 0
        finally:
            await stream.aclose()
    finally:
        if playback and not playback.done():
            playback.cancel()
            await asyncio.gather(playback, return_exceptions=True)
        source.clear_queue()
        await room.disconnect()
        await source.aclose()


if __name__ == "__main__":
    asyncio.run(worker(json.loads(sys.stdin.readline())))
