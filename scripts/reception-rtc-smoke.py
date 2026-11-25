"""Recepção: prova de trilhas com quatro identidades e áudio sintético no LiveKit local."""

import asyncio
import json
import math
import sys
from array import array
from collections import Counter

from livekit import rtc

RATE = 48000
SAMPLES = 960


class Probe:
    def __init__(self, config):
        self.config = config
        self.rooms = {}
        self.readers = set()
        self.sources = []
        self.frames = Counter()
        self.attempts = Counter()
        self.subscriptions = Counter()
        self.revoked = set()

    async def connect(self, identity, select, auto_subscribe=False):
        room = rtc.Room()
        self.rooms[identity] = room

        def request(publication, participant):
            if publication.source == rtc.TrackSource.SOURCE_MICROPHONE and select(participant.identity):
                self.attempts[identity, participant.identity] += 1
                publication.set_subscribed(True)

        def subscribed(track, _publication, participant):
            self.subscriptions[identity, participant.identity] += 1
            reader = asyncio.create_task(self.consume(track, identity, participant.identity))
            self.readers.add(reader)

        def unsubscribed(_track, _publication, participant):
            self.revoked.add((identity, participant.identity))

        room.on('track_published', request)
        room.on('track_subscribed', subscribed)
        room.on('track_unsubscribed', unsubscribed)
        await room.connect(self.config['url'], self.config['tokens'][identity], rtc.RoomOptions(auto_subscribe=auto_subscribe))
        for participant in room.remote_participants.values():
            for publication in participant.track_publications.values():
                request(publication, participant)
        return room

    async def consume(self, track, receiver, sender):
        stream = rtc.AudioStream(track, sample_rate=RATE, num_channels=1)
        try:
            async for event in stream:
                if any(abs(sample) > 160 for sample in event.frame.data):
                    self.frames[receiver, sender] += 1
        finally:
            await stream.aclose()

    @staticmethod
    def allow(room, *identities):
        room.local_participant.set_track_subscription_permissions(
            allow_all_participants=False,
            participant_permissions=[rtc.ParticipantTrackPermission(participant_identity=identity, allow_all=True) for identity in identities],
        )

    async def publish(self, room):
        source = rtc.AudioSource(RATE, 1, queue_size_ms=1000)
        self.sources.append(source)
        track = rtc.LocalAudioTrack.create_audio_track('reception-smoke', source)
        await room.local_participant.publish_track(track, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE))
        return source

    @staticmethod
    def frame():
        samples = array('h', (round(5000 * math.sin(2 * math.pi * 440 * i / RATE)) for i in range(SAMPLES)))
        return rtc.AudioFrame(samples.tobytes(), RATE, 1, SAMPLES)

    async def play(self, *sources, frames=75):
        frame = self.frame()
        for _ in range(frames):
            await asyncio.gather(*(source.capture_frame(frame) for source in sources))
            await asyncio.sleep(0.02)

    def denied(self, receiver, sender):
        assert self.attempts[receiver, sender] > 0, f'{receiver} não fez tentativa explícita'
        assert self.subscriptions[receiver, sender] == 0, f'SFU entregou assinatura a {receiver}'
        assert self.frames[receiver, sender] == 0, f'SFU entregou áudio a {receiver}'

    async def run(self):
        wants_agent = lambda identity: identity.startswith('reception-')
        alice = await self.connect('alice', wants_agent)
        bob = await self.connect('bob', wants_agent)
        alice_mic, bob_mic = await asyncio.gather(self.publish(alice), self.publish(bob))
        worker = await self.connect('reception-first', lambda identity: identity == 'alice')
        self.allow(worker, 'alice')
        response = await self.publish(worker)
        await self.play(alice_mic, bob_mic, response)
        assert self.frames['alice', 'reception-first'] > 0, 'visitante autorizado ficou sem resposta'
        assert self.frames['reception-first', 'alice'] > 0, 'worker ficou sem entrada autorizada'
        assert self.subscriptions['reception-first', 'bob'] == 0, 'worker recebeu entrada fora do lease'
        self.denied('bob', 'reception-first')

        await bob.disconnect()
        self.attempts['bob', 'reception-first'] = 0
        bob = await self.connect('bob', wants_agent, auto_subscribe=True)
        await self.play(response, frames=35)
        self.denied('bob', 'reception-first')

        # Uma interrupção limpa frames ainda no buffer, sem esperar a fila tocar.
        for _ in range(25):
            await response.capture_frame(self.frame())
        assert response.queued_duration >= 0.1, 'a prova precisa enfileirar áudio antes da interrupção'
        response.clear_queue()
        assert response.queued_duration < 0.03, 'a interrupção deixou áudio enfileirado'

        self.allow(worker)
        await asyncio.sleep(0.3)
        baseline = self.frames['alice', 'reception-first']
        await self.play(response, frames=35)
        delivered = self.frames['alice', 'reception-first'] - baseline
        print(f'Após limpar a ACL: {delivered} frames audíveis; evento de desassinatura: {("alice", "reception-first") in self.revoked}.', flush=True)
        assert delivered == 0, 'a ACL revogada ainda deixou passar áudio'

        # O Fastify retira a identidade, inclusive se o processo de voz não fechar o RTC.
        print('REMOVE_FIRST', flush=True)
        ack = await asyncio.to_thread(sys.stdin.readline)
        assert ack.strip() == 'REMOVED', 'o servidor não confirmou a remoção'
        async with asyncio.timeout(5):
            while 'reception-first' in alice.remote_participants:
                await asyncio.sleep(0.02)

        next_worker = await self.connect('reception-next', lambda identity: identity == 'bob')
        self.allow(next_worker, 'bob')
        await self.play(await self.publish(next_worker))
        self.denied('alice', 'reception-next')
        assert self.frames['bob', 'reception-next'] > 0, 'segundo atendimento não entregou áudio'
        print('LiveKit: áudio autorizado em ambos os sentidos; terceiro bloqueado na publicação e reconexão; fila limpa; revogação e troca de interlocutor aprovadas.')

    async def close(self):
        await asyncio.gather(*(room.disconnect() for room in self.rooms.values()), return_exceptions=True)
        for reader in self.readers:
            reader.cancel()
        await asyncio.gather(*self.readers, return_exceptions=True)
        await asyncio.gather(*(source.aclose() for source in self.sources), return_exceptions=True)


async def main():
    probe = Probe(json.loads(sys.stdin.readline()))
    try:
        await asyncio.wait_for(probe.run(), timeout=55)
    finally:
        await probe.close()


if __name__ == '__main__':
    asyncio.run(main())
