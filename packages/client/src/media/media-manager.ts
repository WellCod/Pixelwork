import {
  DisconnectReason,
  LocalVideoTrack,
  RemoteVideoTrack,
  Room,
  RoomEvent,
  Track,
  VideoQuality,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
} from 'livekit-client';

/**
 * Uma única sala do LiveKit por vez; quem decide qual é o servidor, pelo `media.join`.
 * A assinatura é manual: só entra o que a proximidade pede, e quem sai é desassinado.
 */
export class MediaManager {
  private room: Room | null = null;
  private generation = 0;
  private audible = new Set<string>();
  private visible = new Set<string>();
  private volumes = new Map<string, number>();
  private expanded: string | null = null;
  private readonly audioElements = new Map<string, HTMLMediaElement[]>();
  private readonly listeners = new Set<() => void>();

  micOn = true;
  camOn = false;
  screenOn = false;
  /** Sala atual: `space:` tem assinatura por proximidade; reunião e chamada, todos com todos. */
  roomName: string | null = null;
  audioBlocked = false;
  connected = false;
  /** A conexão de mídia caiu sem o servidor mandar trocar de sala: precisa de um token novo. */
  lost = false;
  /** Quem está falando agora (identidades), para o anel no mapa e na lista. */
  speaking = new Set<string>();
  error: string | null = null;
  version = 0;

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Sala de reunião ou chamada (todos com todos), em vez da sala do espaço por proximidade. */
  get isPrivate(): boolean {
    return this.roomName !== null && !this.roomName.startsWith('space:');
  }

  /**
   * Troca de sala. Um `media.join` pode chegar enquanto a conexão anterior ainda está sendo
   * estabelecida: a geração descarta a conexão que terminar depois de ter sido substituída.
   */
  async join(url: string, token: string, roomName: string): Promise<void> {
    const generation = ++this.generation;
    this.roomName = roomName;
    // Tela compartilhada não atravessa a troca de sala.
    this.screenOn = false;
    const previous = this.room;
    this.room = null;
    this.lost = false;
    this.speaking = new Set();
    this.setConnected(false);
    await previous?.disconnect();
    this.changed();

    const room = new Room({ adaptiveStream: true, dynacast: true });
    this.listen(room);
    try {
      await room.connect(url, token, { autoSubscribe: false });
    } catch (error) {
      if (generation === this.generation) this.fail(error);
      await room.disconnect();
      return;
    }
    if (generation !== this.generation) {
      await room.disconnect();
      return;
    }
    this.room = room;
    this.error = null;
    this.setConnected(true);
    this.audioBlocked = !room.canPlaybackAudio;
    await this.publishLocal(room);
    this.apply();
  }

  /** Conjunto de quem ouvir (proximidade), de quem ver (balões) e o volume de cada um. */
  setDesired(audible: Set<string>, visible: Set<string>, volumes: Map<string, number>): void {
    this.audible = audible;
    this.visible = visible;
    this.volumes = volumes;
    this.apply();
  }

  /** Balão expandido pede a camada de qualidade alta; os outros ficam na baixa. */
  setExpanded(id: string | null): void {
    this.expanded = id;
    this.apply();
    this.changed();
  }

  get expandedId(): string | null {
    return this.expanded;
  }

  /** Falha (permissão negada, sem dispositivo) volta o botão para desligado. */
  async setMic(on: boolean): Promise<void> {
    this.micOn = on;
    this.changed();
    await this.room?.localParticipant.setMicrophoneEnabled(on).catch((error: unknown) => {
      this.micOn = false;
      this.fail(error, 'microfone');
    });
  }

  async setCamera(on: boolean): Promise<void> {
    this.camOn = on;
    this.changed();
    await this.room?.localParticipant.setCameraEnabled(on).catch((error: unknown) => {
      this.camOn = false;
      this.fail(error, 'câmera');
    });
  }

  /** Compartilhar tela só vale em reunião e chamada; na sala do espaço o pedido é ignorado. */
  async setScreenShare(on: boolean): Promise<void> {
    if (on && (!this.isPrivate || !this.room)) return;
    this.screenOn = on;
    this.changed();
    await this.room?.localParticipant.setScreenShareEnabled(on, { audio: true }).catch((error: unknown) => {
      this.screenOn = false;
      this.fail(error, 'tela');
    });
  }

  /** Telas compartilhadas pelos outros na sala atual (só existem em reunião e chamada). */
  remoteScreens(): { identity: string; track: RemoteVideoTrack }[] {
    const screens: { identity: string; track: RemoteVideoTrack }[] = [];
    for (const [identity, participant] of this.room?.remoteParticipants ?? []) {
      const track = participant.getTrackPublication(Track.Source.ScreenShare)?.track;
      if (track instanceof RemoteVideoTrack) screens.push({ identity, track });
    }
    return screens;
  }

  /** Câmeras assinadas, para a grade da sala de reunião ou da chamada. */
  remoteCameras(): string[] {
    return [...(this.room?.remoteParticipants.keys() ?? [])].filter((id) => this.remoteVideo(id));
  }

  /** O navegador só toca áudio depois de um gesto do usuário. */
  async enableAudio(): Promise<void> {
    await this.room?.startAudio();
    this.audioBlocked = !(this.room?.canPlaybackAudio ?? true);
    this.changed();
  }

  /** A pessoa publica câmera ligada (mesmo sem estar assinada aqui), para decidir os balões. */
  hasCamera(id: string): boolean {
    const publication = this.room?.remoteParticipants.get(id)?.getTrackPublication(Track.Source.Camera);
    return publication !== undefined && !publication.isMuted;
  }

  remoteVideo(id: string): RemoteVideoTrack | undefined {
    const track = this.room?.remoteParticipants.get(id)?.getTrackPublication(Track.Source.Camera)?.track;
    return track instanceof RemoteVideoTrack ? track : undefined;
  }

  localVideo(): LocalVideoTrack | undefined {
    const track = this.room?.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
    return track instanceof LocalVideoTrack ? track : undefined;
  }

  /** Estado de assinatura, exposto só para depuração e para o E2E da fase 8. */
  debugState(): Record<string, { audio: boolean; video: boolean }> {
    const state: Record<string, { audio: boolean; video: boolean }> = {};
    for (const [id, participant] of this.room?.remoteParticipants ?? []) {
      state[id] = {
        audio: participant.getTrackPublication(Track.Source.Microphone)?.isSubscribed ?? false,
        video: participant.getTrackPublication(Track.Source.Camera)?.isSubscribed ?? false,
      };
    }
    return state;
  }

  async close(): Promise<void> {
    this.generation++;
    const room = this.room;
    this.room = null;
    await room?.disconnect();
  }

  /** Microfone e câmera em tentativas separadas: um negado não impede o outro. */
  private async publishLocal(room: Room): Promise<void> {
    await room.localParticipant.setMicrophoneEnabled(this.micOn).catch((error: unknown) => {
      this.micOn = false;
      this.fail(error, 'microfone');
    });
    await room.localParticipant.setCameraEnabled(this.camOn).catch((error: unknown) => {
      this.camOn = false;
      this.fail(error, 'câmera');
    });
  }

  private apply(): void {
    for (const [id, participant] of this.room?.remoteParticipants ?? []) this.applyTo(id, participant);
    this.changed();
  }

  /**
   * Regras de assinatura de uma pessoa. Na sala do espaço: microfone só de quem está ao alcance,
   * câmera só de quem, além disso, tem balão; balão expandido em qualidade alta.
   */
  private applyTo(id: string, participant: RemoteParticipant): void {
    if (this.isPrivate) {
      // Reunião e chamada: o servidor já decidiu quem está na sala, então todos com todos.
      for (const publication of participant.trackPublications.values()) publication.setSubscribed(true);
      participant.setVolume(1);
      return;
    }
    const hearing = this.audible.has(id);
    participant.getTrackPublication(Track.Source.Microphone)?.setSubscribed(hearing);
    const camera = participant.getTrackPublication(Track.Source.Camera);
    const seeing = hearing && this.visible.has(id);
    camera?.setSubscribed(seeing);
    if (seeing) camera?.setVideoQuality(this.expanded === id ? VideoQuality.HIGH : VideoQuality.LOW);
    if (hearing) participant.setVolume(this.volumes.get(id) ?? 1);
  }

  /** Eventos da sala: mudança de participante ou de track reaplica as regras de assinatura. */
  private listen(room: Room): void {
    const reapply = () => this.apply();
    room
      .on(RoomEvent.ParticipantConnected, reapply)
      .on(RoomEvent.ParticipantDisconnected, reapply)
      .on(RoomEvent.TrackPublished, reapply)
      .on(RoomEvent.TrackUnpublished, reapply)
      .on(RoomEvent.TrackMuted, reapply)
      .on(RoomEvent.TrackUnmuted, reapply)
      .on(RoomEvent.LocalTrackPublished, () => this.changed())
      .on(RoomEvent.LocalTrackUnpublished, (publication) => {
        // Parar pelo botão nativo do navegador também desliga o estado daqui.
        if (publication.source === Track.Source.ScreenShare) this.screenOn = false;
        this.changed();
      })
      .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        this.speaking = new Set(speakers.map((speaker) => speaker.identity));
        this.changed();
      })
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _publication, participant: RemoteParticipant) => {
        // Áudio remoto precisa de um elemento <audio> no documento para tocar; vídeo é anexado pela UI.
        if (track.kind === Track.Kind.Audio) {
          const element = track.attach();
          element.hidden = true;
          document.body.appendChild(element);
          this.audioElements.set(track.sid ?? '', [element]);
          participant.setVolume(this.volumes.get(participant.identity) ?? 1);
        }
        this.changed();
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) {
          for (const element of track.detach()) element.remove();
          this.audioElements.delete(track.sid ?? '');
        }
        this.changed();
      })
      .on(RoomEvent.AudioPlaybackStatusChanged, () => {
        this.audioBlocked = !room.canPlaybackAudio;
        this.changed();
      })
      .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
        if (this.room !== room) return;
        this.room = null;
        // Removido pelo servidor ou sala apagada: um `media.join` novo já vem a caminho.
        const expected =
          reason === DisconnectReason.CLIENT_INITIATED ||
          reason === DisconnectReason.PARTICIPANT_REMOVED ||
          reason === DisconnectReason.ROOM_DELETED;
        this.lost = !expected;
        this.setConnected(false);
      });
  }

  private fail(error: unknown, device?: string): void {
    this.error = describeMediaError(error, device);
    this.changed();
  }

  dismissError(): void {
    this.error = null;
    this.changed();
  }

  private setConnected(connected: boolean): void {
    this.connected = connected;
    this.changed();
  }

  private changed(): void {
    this.version++;
    for (const listener of this.listeners) listener();
  }
}

const DEVICES: Record<string, { the: string; none: string }> = {
  microfone: { the: 'o microfone', none: 'Nenhum microfone encontrado.' },
  câmera: { the: 'a câmera', none: 'Nenhuma câmera encontrada.' },
  tela: { the: 'a tela', none: 'Não há tela disponível para compartilhar.' },
};

/** Erros do navegador e do LiveKit em português, com o que a pessoa pode fazer. */
export function describeMediaError(error: unknown, device = 'microfone'): string {
  const name = error instanceof Error ? error.name : '';
  const deviceText = DEVICES[device] ?? { the: device, none: `${device}: não encontrado.` };
  switch (name) {
    case 'NotAllowedError':
      return `Sem permissão para usar ${deviceText.the}. Libere no cadeado da barra de endereço.`;
    case 'NotFoundError':
    case 'OverconstrainedError':
      return deviceText.none;
    case 'NotReadableError':
      return `Não deu para abrir ${deviceText.the}: outro programa está usando.`;
    default:
      return 'Não deu para conectar o áudio e o vídeo agora.';
  }
}
