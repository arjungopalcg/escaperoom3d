// Proximity voice chat. Peer-to-peer WebRTC mesh signalled through the game server.
// (The PRD proposes a media server such as LiveKit for 15-player sessions; the mesh keeps the
// prototype self-contained and the per-peer gain model is the same.)
import { audio } from './audio.ts';
import { net } from './net.ts';
import { store } from './store.ts';

interface Peer {
  id: string;
  pc: RTCPeerConnection;
  gain?: GainNode;
  analyser?: AnalyserNode;
  el?: HTMLAudioElement;
  level: number;
}

type Signal = { kind: 'offer' | 'answer'; sdp: RTCSessionDescriptionInit } | { kind: 'ice'; candidate: RTCIceCandidateInit };

const ICE: RTCConfiguration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

class Voice {
  local?: MediaStream;
  private localAnalyser?: AnalyserNode;
  peers = new Map<string, Peer>();
  /** Per-player volume (0..1.5) and mute, set from the crew list. */
  prefs = new Map<string, { volume: number; muted: boolean }>();
  micMuted = false;
  pttHeld = false;
  bells = new Set<string>();
  /** Supplies a 0..1 proximity factor for a peer. */
  proximity: (id: string) => number = () => 1;
  error = '';

  async enableMic(): Promise<boolean> {
    if (this.local) return true;
    try {
      this.local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const ctx = audio.ensure();
      const src = ctx.createMediaStreamSource(this.local);
      this.localAnalyser = ctx.createAnalyser();
      this.localAnalyser.fftSize = 512;
      src.connect(this.localAnalyser);
      // Each connection has one sendrecv audio transceiver, so the track can be swapped in without renegotiating.
      for (const p of this.peers.values()) void this.attachTrack(p);
      this.applyTalk();
      net.send({ t: 'mic', ok: true });
      return true;
    } catch (e) {
      this.error = (e as Error).message || 'Microphone blocked';
      net.send({ t: 'mic', ok: false });
      return false;
    }
  }

  /** Mic is live when not muted, and (in push-to-talk mode) while the key is held. */
  applyTalk() {
    const live = !this.micMuted && (!store.settings.pushToTalk || this.pttHeld);
    this.local?.getAudioTracks().forEach((t) => (t.enabled = live));
  }

  get talking(): boolean {
    const t = this.local?.getAudioTracks()[0];
    return !!t?.enabled;
  }

  localLevel(): number {
    return level(this.localAnalyser);
  }

  peerLevel(id: string): number {
    return this.peers.get(id)?.level ?? 0;
  }

  /** Keep a connection to every other player in the room. */
  sync(ids: string[]) {
    for (const id of ids) if (id !== store.me && !this.peers.has(id)) this.connect(id);
    for (const id of [...this.peers.keys()]) if (!ids.includes(id)) this.drop(id);
  }

  private connect(id: string): Peer {
    const pc = new RTCPeerConnection(ICE);
    const peer: Peer = { id, pc, level: 0 };
    this.peers.set(id, peer);
    if (store.me < id) {
      pc.addTransceiver('audio', { direction: 'sendrecv' });
      void this.attachTrack(peer);
    }
    pc.onicecandidate = (e) => {
      if (e.candidate) net.send({ t: 'rtc', to: id, data: { kind: 'ice', candidate: e.candidate.toJSON() } satisfies Signal });
    };
    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      // Chrome needs the remote stream attached to a media element before WebAudio will play it.
      const el = new Audio();
      el.srcObject = stream;
      el.muted = true;
      void el.play().catch(() => {});
      const ctx = audio.ensure();
      const src = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      src.connect(gain).connect(audio.voiceBus);
      peer.gain = gain;
      peer.analyser = analyser;
      peer.el = el;
    };
    if (store.me < id) void this.offer(peer);
    return peer;
  }

  private async attachTrack(p: Peer) {
    const track = this.local?.getAudioTracks()[0];
    const tr = p.pc.getTransceivers()[0];
    if (!tr) return;
    if (tr.direction !== 'sendrecv') tr.direction = 'sendrecv';
    if (!track) return;
    await tr.sender.replaceTrack(track).catch(() => {});
  }

  private async offer(p: Peer) {
    try {
      const offer = await p.pc.createOffer();
      await p.pc.setLocalDescription(offer);
      net.send({ t: 'rtc', to: p.id, data: { kind: 'offer', sdp: p.pc.localDescription!.toJSON() } satisfies Signal });
    } catch {
      /* ignore glare */
    }
  }

  async onSignal(from: string, data: Signal) {
    const p = this.peers.get(from) ?? this.connect(from);
    try {
      if (data.kind === 'offer') {
        await p.pc.setRemoteDescription(data.sdp);
        await this.attachTrack(p);
        const answer = await p.pc.createAnswer();
        await p.pc.setLocalDescription(answer);
        net.send({ t: 'rtc', to: from, data: { kind: 'answer', sdp: p.pc.localDescription!.toJSON() } satisfies Signal });
      } else if (data.kind === 'answer') {
        await p.pc.setRemoteDescription(data.sdp);
      } else if (data.kind === 'ice') {
        await p.pc.addIceCandidate(data.candidate);
      }
    } catch {
      /* stale signal */
    }
  }

  private drop(id: string) {
    const p = this.peers.get(id);
    p?.pc.close();
    p?.el?.remove();
    this.peers.delete(id);
  }

  /** Called every frame: proximity gains, captain bell, levels. */
  update() {
    for (const p of this.peers.values()) {
      p.level = level(p.analyser);
      if (!p.gain) continue;
      const pref = this.prefs.get(p.id) ?? { volume: 1, muted: false };
      const prox = this.bells.has(p.id) ? 1 : this.proximity(p.id);
      const target = pref.muted ? 0 : prox * pref.volume;
      p.gain.gain.setTargetAtTime(target, p.gain.context.currentTime, 0.1);
    }
  }

  closeAll() {
    for (const id of [...this.peers.keys()]) this.drop(id);
  }
}

function level(a?: AnalyserNode): number {
  if (!a) return 0;
  const buf = new Uint8Array(a.fftSize);
  a.getByteTimeDomainData(buf);
  let sum = 0;
  for (const v of buf) sum += ((v - 128) / 128) ** 2;
  return Math.min(1, Math.sqrt(sum / buf.length) * 4);
}

export const voice = new Voice();
