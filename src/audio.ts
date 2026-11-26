// Synthesised sound effects (WebAudio, no files: works offline from file://).
//
// The AudioContext can only start after a user gesture, so it is created on
// the first key press or tap (`unlock()`). Until then every call is a no-op.
// Sounds are triggered by the same simulation events that drive the visual
// feedback, in the same frame.

import { VOLUME } from './config.ts';
import type { SimEvent } from './sim.ts';

export type SoundId =
  | 'move'
  | 'bump'
  | 'collect'
  | 'big'
  | 'crash'
  | 'close'
  | 'miss'
  | 'tick'
  | 'go'
  | 'finish'
  | 'menuMove'
  | 'confirm';

type Wave = OscillatorType;

interface ToneOpts {
  wave?: Wave;
  f0: number;
  f1?: number; // end frequency (exponential glide)
  dur: number;
  gain: number;
  delay?: number;
  attack?: number;
  pan?: number;
}

interface NoiseOpts {
  dur: number;
  gain: number;
  filter: BiquadFilterType;
  f0: number;
  f1?: number;
  q?: number;
  delay?: number;
  pan?: number;
}

/** Major pentatonic steps (semitones): the pickup pitch climbs with the streak. */
const STREAK_STEPS = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const LOG_SIZE = 40;

export class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  /** Last sounds played (newest last). Read-only aid for automated tests. */
  readonly log: SoundId[] = [];
  /** Count of every sound played since load. */
  readonly counts: Partial<Record<SoundId, number>> = {};

  /** Create or resume the context. Call from a user gesture (key press, tap). */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor: typeof AudioContext | undefined =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        const ctx = new Ctor();
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.ratio.value = 6;
        const master = ctx.createGain();
        master.gain.value = this.muted ? 0 : VOLUME;
        master.connect(comp);
        comp.connect(ctx.destination);
        const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.6), ctx.sampleRate);
        const data = buf.getChannelData(0);
        // Deterministic noise (no Math.random needed; nothing here affects the game).
        let seed = 12345;
        for (let i = 0; i < data.length; i++) {
          seed = (seed * 1103515245 + 12345) & 0x7fffffff;
          data[i] = (seed / 0x3fffffff - 1) * 0.9;
        }
        this.ctx = ctx;
        this.master = master;
        this.noiseBuf = buf;
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      // No audio available: the game works the same without it.
      this.ctx = null;
    }
  }

  get state(): string {
    return this.ctx ? this.ctx.state : 'none';
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : VOLUME, this.ctx.currentTime, 0.01);
    if (!this.muted) this.play('confirm');
    return this.muted;
  }

  /** Turn simulation events into sounds. `close` = ids of barriers dodged close. */
  handleEvents(events: readonly SimEvent[], close: ReadonlySet<number>): void {
    let closePlayed = false;
    for (const e of events) {
      switch (e.type) {
        case 'move':
          this.play('move', e.to - e.from);
          break;
        case 'bump':
          this.play('bump', e.dir);
          break;
        case 'collect':
          if (e.obj.kind === 'bigCore') this.play('big');
          else this.play('collect', e.streak);
          break;
        case 'crash':
          this.play('crash');
          break;
        case 'dodge':
          if (close.has(e.obj.id) && !closePlayed) {
            this.play('close', e.obj.lane - 1);
            closePlayed = true;
          }
          break;
        case 'miss':
          this.play('miss', e.obj.lane - 1);
          break;
        case 'finish':
          this.play('finish');
          break;
      }
    }
  }

  play(id: SoundId, arg = 0): void {
    this.log.push(id);
    if (this.log.length > LOG_SIZE) this.log.shift();
    this.counts[id] = (this.counts[id] ?? 0) + 1;
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    try {
      this.synth(id, arg);
    } catch {
      // A failed sound must never break the game loop.
    }
  }

  private synth(id: SoundId, arg: number): void {
    switch (id) {
      case 'move': {
        // Short blip panned to the side the ship went; right is a touch higher.
        const right = arg > 0;
        this.tone({ wave: 'triangle', f0: right ? 640 : 540, f1: right ? 760 : 460, dur: 0.06, gain: 0.32, pan: right ? 0.7 : -0.7 });
        break;
      }
      case 'bump':
        // Dull knock against the wall.
        this.tone({ wave: 'square', f0: 120, f1: 70, dur: 0.08, gain: 0.22, pan: arg > 0 ? 0.85 : -0.85 });
        this.noise({ dur: 0.05, gain: 0.18, filter: 'lowpass', f0: 600, pan: arg > 0 ? 0.85 : -0.85 });
        break;
      case 'collect': {
        const step = STREAK_STEPS[Math.min(STREAK_STEPS.length - 1, Math.max(0, arg - 1))];
        const f = 660 * Math.pow(2, step / 12);
        this.tone({ wave: 'triangle', f0: f, dur: 0.14, gain: 0.34 });
        this.tone({ wave: 'sine', f0: f * 2, dur: 0.09, gain: 0.12 });
        break;
      }
      case 'big':
        // Bright rising arpeggio with a shimmer on top.
        [784, 988, 1175, 1568].forEach((f, i) => {
          this.tone({ wave: 'square', f0: f, dur: 0.16, gain: 0.12, delay: i * 0.045 });
          this.tone({ wave: 'sine', f0: f * 2, dur: 0.2, gain: 0.08, delay: i * 0.045 });
        });
        this.noise({ dur: 0.35, gain: 0.06, filter: 'highpass', f0: 6000, delay: 0.05 });
        break;
      case 'crash':
        // Noise burst falling in pitch + a low sawtooth drop.
        this.noise({ dur: 0.42, gain: 0.7, filter: 'lowpass', f0: 3200, f1: 180, q: 1.5 });
        this.tone({ wave: 'sawtooth', f0: 180, f1: 45, dur: 0.38, gain: 0.32 });
        break;
      case 'close':
        // Whoosh past the barrier + a small chime.
        this.noise({ dur: 0.2, gain: 0.28, filter: 'bandpass', f0: 700, f1: 4200, q: 2.5, pan: arg * 0.6 });
        this.tone({ wave: 'sine', f0: 1320, f1: 1980, dur: 0.12, gain: 0.14, delay: 0.05 });
        break;
      case 'miss':
        // Soft falling "bloop": something slipped past.
        this.tone({ wave: 'sine', f0: 330, f1: 196, dur: 0.16, gain: 0.2, pan: arg * 0.6 });
        break;
      case 'tick':
        this.tone({ wave: 'square', f0: 440, dur: 0.09, gain: 0.14 });
        break;
      case 'go':
        this.tone({ wave: 'square', f0: 880, dur: 0.22, gain: 0.16 });
        this.tone({ wave: 'triangle', f0: 1320, dur: 0.18, gain: 0.1 });
        break;
      case 'finish':
        [523, 659, 784, 1047].forEach((f, i) => this.tone({ wave: 'triangle', f0: f, dur: i === 3 ? 0.55 : 0.16, gain: 0.26, delay: i * 0.1 }));
        break;
      case 'menuMove':
        this.tone({ wave: 'square', f0: 1000, dur: 0.035, gain: 0.08 });
        break;
      case 'confirm':
        this.tone({ wave: 'triangle', f0: 660, dur: 0.07, gain: 0.22 });
        this.tone({ wave: 'triangle', f0: 990, dur: 0.12, gain: 0.22, delay: 0.06 });
        break;
    }
  }

  private out(pan: number | undefined): AudioNode {
    const ctx = this.ctx!;
    if (pan && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      p.connect(this.master!);
      return p;
    }
    return this.master!;
  }

  private envelope(g: GainNode, start: number, dur: number, gain: number, attack: number): void {
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  }

  private tone(o: ToneOpts): void {
    const ctx = this.ctx!;
    const start = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.wave ?? 'sine';
    osc.frequency.setValueAtTime(o.f0, start);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, start + o.dur);
    const g = ctx.createGain();
    this.envelope(g, start, o.dur, o.gain, o.attack ?? 0.005);
    osc.connect(g);
    g.connect(this.out(o.pan));
    osc.start(start);
    osc.stop(start + o.dur + 0.02);
  }

  private noise(o: NoiseOpts): void {
    const ctx = this.ctx!;
    const start = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = o.filter;
    f.Q.value = o.q ?? 0.8;
    f.frequency.setValueAtTime(o.f0, start);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, start + o.dur);
    const g = ctx.createGain();
    this.envelope(g, start, o.dur, o.gain, 0.004);
    src.connect(f);
    f.connect(g);
    g.connect(this.out(o.pan));
    src.start(start);
    src.stop(start + o.dur + 0.02);
  }
}
