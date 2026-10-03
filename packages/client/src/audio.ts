// Procedural storm ambience, sound effects and spoken lines — no audio files needed.
import { voiceKeyFor } from '@crimson/engine';
import { mediaUrl } from './media.ts';
import { store } from './store.ts';

export type Sfx = 'click' | 'unlock' | 'wrong' | 'pickup' | 'throw' | 'splash' | 'cannon' | 'drum' | 'bell' | 'thunder' | 'reveal' | 'act' | 'heave';

class AudioEngine {
  ctx?: AudioContext;
  private master!: GainNode;
  private sfxBus!: GainNode;
  voiceBus!: GainNode;
  private wind?: { gain: GainNode; filter: BiquadFilterNode };
  private water?: { gain: GainNode; filter: BiquadFilterNode };
  private rain?: GainNode;
  private noiseBuf?: AudioBuffer;
  private intensity = 0;
  private onDeck = false;
  private creakTimer?: number;

  ensure(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.voiceBus = this.ctx.createGain();
      this.voiceBus.connect(this.master);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = store.settings;
    this.master.gain.value = s.master;
    this.sfxBus.gain.value = s.sfx;
    this.voiceBus.gain.value = s.voice;
  }

  private noise(): AudioBuffer {
    if (this.noiseBuf) return this.noiseBuf;
    const ctx = this.ensure();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02; // brown-ish
      d[i] = last * 3.5 * 0.5 + w * 0.5 * 0.15;
    }
    return (this.noiseBuf = buf);
  }

  private loop(filterType: BiquadFilterType, freq: number, q = 0.7): { gain: GainNode; filter: BiquadFilterNode } {
    const ctx = this.ensure();
    const src = ctx.createBufferSource();
    src.buffer = this.noise();
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.sfxBus);
    src.start();
    return { gain, filter };
  }

  startAmbience() {
    if (this.wind) return;
    const ctx = this.ensure();
    this.wind = this.loop('lowpass', 400, 1);
    this.water = this.loop('bandpass', 700, 1.5);
    this.rain = this.loop('highpass', 3000).gain;
    // Gusts.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain).connect(this.wind.filter.frequency);
    lfo.start();
    this.update();
    const creak = () => {
      this.creak();
      this.creakTimer = window.setTimeout(creak, 3500 + Math.random() * 7000 * (1 - this.intensity * 0.6));
    };
    creak();
  }

  stopAmbience() {
    clearTimeout(this.creakTimer);
    for (const g of [this.wind?.gain, this.water?.gain, this.rain]) g?.gain.setTargetAtTime(0, this.ctx!.currentTime, 0.5);
  }

  /** 0..1 how close the ship is to sinking. */
  setIntensity(f: number, onDeck: boolean) {
    this.intensity = Math.max(0, Math.min(1, f));
    this.onDeck = onDeck;
    this.update();
  }

  private update() {
    if (!this.ctx || !this.wind || !this.water || !this.rain) return;
    const t = this.ctx.currentTime;
    const i = this.intensity;
    this.wind.gain.gain.setTargetAtTime((this.onDeck ? 0.5 : 0.22) + i * 0.25, t, 1);
    this.wind.filter.frequency.setTargetAtTime((this.onDeck ? 700 : 300) + i * 500, t, 1);
    this.water.gain.gain.setTargetAtTime(this.onDeck ? 0.05 : 0.06 + i * 0.22, t, 1);
    this.rain.gain.setTargetAtTime(this.onDeck ? 0.12 + i * 0.1 : 0.015, t, 1);
  }

  private creak() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const f0 = 70 + Math.random() * 90;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.linearRampToValueAtTime(f0 * (0.7 + Math.random() * 0.6), t + 0.9);
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 400 + Math.random() * 300;
    filt.Q.value = 8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05 + this.intensity * 0.05, t + 0.15);
    g.gain.linearRampToValueAtTime(0, t + 1.0);
    osc.connect(filt).connect(g).connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 1.1);
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.3, delay = 0, endFreq?: number) {
    const ctx = this.ensure();
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(dur: number, type: BiquadFilterType, freq: number, vol = 0.4, delay = 0, q = 1) {
    const ctx = this.ensure();
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random() * 2);
    src.stop(t + dur + 0.05);
  }

  play(s: Sfx) {
    if (!this.ctx) return;
    switch (s) {
      case 'click':
        return this.tone(1400, 0.04, 'square', 0.05);
      case 'unlock':
        this.burst(0.08, 'highpass', 3000, 0.3);
        this.tone(880, 0.6, 'sine', 0.2, 0.05);
        return this.tone(1320, 0.8, 'sine', 0.15, 0.12);
      case 'wrong':
        this.tone(110, 0.4, 'triangle', 0.4, 0, 55);
        return this.burst(0.3, 'lowpass', 300, 0.4);
      case 'pickup':
        return this.tone(500, 0.12, 'sine', 0.15, 0, 900);
      case 'throw':
        return this.burst(0.35, 'bandpass', 1200, 0.25, 0, 2);
      case 'splash':
        this.burst(0.8, 'bandpass', 900, 0.5, 0, 0.8);
        return this.burst(0.5, 'highpass', 2500, 0.2, 0.1);
      case 'cannon':
        this.burst(1.6, 'lowpass', 220, 1.0);
        return this.tone(60, 1.2, 'sine', 0.6, 0, 30);
      case 'drum':
        return this.tone(140, 0.25, 'sine', 0.5, 0, 60);
      case 'bell':
        this.tone(620, 2.5, 'sine', 0.2);
        this.tone(1550, 1.8, 'sine', 0.08);
        return this.tone(2480, 1.2, 'sine', 0.05);
      case 'thunder':
        this.burst(3.5, 'lowpass', 160, 0.9);
        return this.burst(1.2, 'lowpass', 600, 0.4, 0.05);
      case 'reveal':
        [523, 659, 784].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.12, i * 0.09));
        return;
      case 'act':
        [196, 247, 294].forEach((f) => this.tone(f, 1.6, 'sawtooth', 0.05));
        return this.burst(0.4, 'lowpass', 400, 0.3);
      case 'heave':
        return this.tone(90, 0.3, 'sawtooth', 0.12, 0, 70);
    }
  }

  private missingVoice = new Set<string>();
  private voiceEl?: HTMLAudioElement;

  /** Stop any line currently being spoken. */
  hush() {
    this.voiceEl?.pause();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  /**
   * Speak a story line. A recorded file (media/voice/<key>.mp3, e.g. made with Gemini TTS or
   * ElevenLabs) is used when present; otherwise the browser's built-in voice reads it.
   */
  speak(text: string, who: 'captain' | 'parrot' | 'note' | 'narrator', onEnd?: () => void) {
    if (!store.settings.speech) return onEnd?.();
    const key = voiceKeyFor(text);
    const file = key ? mediaUrl(`voice/${key}.mp3`) : undefined;
    if (key && file && !this.missingVoice.has(key)) {
      const el = new Audio(file);
      el.volume = Math.min(1, store.settings.master);
      el.onended = () => onEnd?.();
      el.onerror = () => {
        this.missingVoice.add(key);
        this.tts(text, who, onEnd);
      };
      this.voiceEl = el;
      void el.play().catch(() => {
        this.missingVoice.add(key);
        this.tts(text, who, onEnd);
      });
      return;
    }
    this.tts(text, who, onEnd);
  }

  private tts(text: string, who: 'captain' | 'parrot' | 'note' | 'narrator', onEnd?: () => void) {
    if (!('speechSynthesis' in window)) return onEnd?.();
    const clean = text.replace(/^[A-Z ]+(\([^)]*\))?:\s*/, '').replace(/[“”]/g, '');
    const u = new SpeechSynthesisUtterance(clean);
    u.volume = Math.min(1, store.settings.master * 1.1);
    const tone = { captain: [0.55, 0.95], parrot: [2, 1.25], narrator: [0.85, 0.92], note: [1, 1] }[who];
    u.pitch = tone[0];
    u.rate = tone[1];
    const voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
    const pref = voices.find((v) => /UK|GB|Daniel|Arthur/i.test(v.name)) ?? voices[0];
    if (pref) u.voice = pref;
    u.onend = () => onEnd?.();
    speechSynthesis.speak(u);
  }
}

export const audio = new AudioEngine();
