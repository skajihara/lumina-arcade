/**
 * 素材なしの音。WebAudio でその場で合成する。
 * 連鎖の音は五音音階（ペンタトニック）で上がっていくので、連鎖が伸びるほど旋律になる。
 */
import { Music, STYLES } from './music';

const PENTA = [0, 2, 4, 7, 9];

export function pentatonicFreq(step: number, root = 261.63): number {
  const oct = Math.floor(step / PENTA.length);
  const deg = PENTA[((step % PENTA.length) + PENTA.length) % PENTA.length];
  return root * Math.pow(2, oct + deg / 12);
}

/**
 * 和音進行（キーの根音からの半音）。連鎖が進むと次の和音へ移る。
 * Imaj9 → vi9 → IVmaj9 → V9sus：夜空らしい、解決しきらない浮遊感のある進行
 */
export const PROGRESSION: number[][] = [
  [0, 4, 7, 11, 14],
  [-3, 0, 4, 7, 11],
  [-7, -3, 0, 4, 7],
  [-5, 0, 2, 5, 9],
];

export class Harmony {
  chordIdx = 0;
  /** キー（C からの半音） */
  key = 0;
  constructor(public progression: number[][] = PROGRESSION) {}
  chord(): number[] {
    return this.progression[this.chordIdx % this.progression.length];
  }
  /** 今の和音の n 番目の音（構成音を上へ積む）。C4 からの半音 */
  semis(n: number): number {
    const c = this.chord();
    const len = c.length;
    const k = ((n % len) + len) % len;
    return this.key + c[k] + 12 * Math.floor(n / len);
  }
  freq(n: number, base = 261.63): number {
    return base * Math.pow(2, this.semis(n) / 12);
  }
  advance(): void {
    this.chordIdx++;
  }
  reset(key = 0): void {
    this.key = key;
    this.chordIdx = 0;
  }
}

export class Synth {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private reverbSend!: GainNode;
  private noiseBuf!: AudioBuffer;
  private ambient: { stop(): void; oscs: OscillatorNode[] } | null = null;
  private ambientRoot = 65.41;
  private charging: { o: OscillatorNode; g: GainNode } | null = null;
  readonly harmony = new Harmony();
  /** BGM（UI-01）。最初の操作（unlock）で鳴り始める */
  music: Music | null = null;
  private musicStyle = 'sky';
  volume = 0.7;
  muted = false;

  /** ユーザー操作後に呼ぶ（ブラウザの自動再生制限のため） */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(comp).connect(ctx.destination);

    // 簡易リバーブ（ノイズを減衰させたインパルス応答）
    const conv = ctx.createConvolver();
    const len = ctx.sampleRate * 2.4;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    conv.buffer = ir;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.35;
    this.reverbSend.connect(conv).connect(this.master);

    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    this.music = new Music(ctx, this.master, this.reverbSend, this.harmony);
    this.music.setStyle(STYLES[this.musicStyle] ?? STYLES.sky);
    this.music.start();
  }

  /** BGM のスタイル（作品ごと：nova / echo / stopped / horizon / origami / starsand / sky） */
  setMusicStyle(name: string): void {
    this.musicStyle = name;
    this.music?.setStyle(STYLES[name] ?? STYLES.sky);
  }

  /** BGM の盛り上がり 0..1（アルペジオの密度と明るさ） */
  setMusicIntensity(x: number): void {
    if (this.music) this.music.intensity = Math.max(0, Math.min(1, x));
  }

  /** BGM をこもらせる（時間を止めている間など） */
  muffleMusic(on: boolean): void {
    this.music?.muffle(on);
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.05);
  }
  setMuted(m: boolean): void {
    this.muted = m;
    this.setVolume(this.volume);
  }

  private out(node: AudioNode, wet = 0.5): void {
    node.connect(this.master);
    const s = this.ctx!.createGain();
    s.gain.value = wet;
    node.connect(s).connect(this.reverbSend);
  }

  tone(freq: number, dur = 0.3, opts: { type?: OscillatorType; vol?: number; attack?: number; wet?: number; slideTo?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slideTo), t + dur);
    const g = ctx.createGain();
    const vol = opts.vol ?? 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (opts.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    this.out(g, opts.wet ?? 0.5);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(dur = 0.3, opts: { vol?: number; from?: number; to?: number; q?: number; wet?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = opts.q ?? 1;
    f.frequency.setValueAtTime(opts.from ?? 4000, t);
    f.frequency.exponentialRampToValueAtTime(opts.to ?? 120, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(opts.vol ?? 0.4, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g);
    this.out(g, opts.wet ?? 0.3);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  /** 鈴のような音（step は五音音階の段） */
  bell(step: number, vol = 0.12): void {
    const f = pentatonicFreq(step, 392);
    this.tone(f, 0.9, { vol, wet: 0.7 });
    this.tone(f * 2.01, 0.5, { vol: vol * 0.35, wet: 0.7 });
    this.tone(f * 3.98, 0.25, { vol: vol * 0.12, wet: 0.7 });
  }

  /** 和音の n 番目の音を鈴の音色で鳴らす */
  hbell(n: number, vol = 0.12, dur = 0.9): void {
    const f = this.harmony.freq(n, 392 / Math.pow(2, 7 / 12));
    this.tone(f, dur, { vol, wet: 0.7 });
    this.tone(f * 2.01, dur * 0.55, { vol: vol * 0.35, wet: 0.7 });
    this.tone(f * 3.98, dur * 0.28, { vol: vol * 0.12, wet: 0.7 });
  }

  /** 和音の構成音を順に鳴らす（アルペジオ） */
  arp(notes: number[], spread = 0.07, vol = 0.1): void {
    if (!this.ctx) return;
    notes.forEach((n, k) => setTimeout(() => this.hbell(n, vol), k * spread * 1000));
  }

  /** 今の和音を柔らかい持続音で鳴らす */
  pad(vol = 0.05, dur = 2.6): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (let k = 0; k < 4; k++) {
      const f = this.harmony.freq(k, 130.81);
      this.tone(f, dur, { type: 'triangle', vol, attack: 0.25, wet: 0.9 });
    }
  }

  /** 次の和音へ進む（持続音と環境音も一緒に移る） */
  nextChord(padVol = 0.05): void {
    this.harmony.advance();
    this.pad(padVol);
    this.retuneAmbient();
  }

  /** 爆発音。intensity 0..1、step は連鎖段数（和音の構成音を上がっていく） */
  boom(intensity: number, step: number): void {
    const i = Math.min(1, Math.max(0, intensity));
    this.noise(0.35 + i * 0.5, { vol: 0.25 + i * 0.35, from: 2500 + i * 3000, to: 80 });
    this.tone(110 - i * 40, 0.5 + i * 0.4, { type: 'sine', vol: 0.35 + i * 0.2, slideTo: 35, wet: 0.2 });
    this.hbell(step + 2, 0.1 + i * 0.05);
  }

  /** フリッパー：低い「トン」と軽い打鍵音 */
  flipper(pitch = 1): void {
    this.tone(160 * pitch, 0.09, { type: 'sine', vol: 0.16, slideTo: 70, wet: 0.05 });
    this.tone(1400 * pitch, 0.03, { type: 'triangle', vol: 0.04, wet: 0.1 });
    this.noise(0.05, { vol: 0.06, from: 3000, to: 600, wet: 0 });
  }

  /** 発射の溜め：押している間、音が上がっていく。level<0 で止める */
  chargeTone(level: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (level < 0) {
      if (this.charging) {
        const c = this.charging;
        c.g.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
        setTimeout(() => c.o.stop(), 200);
        this.charging = null;
      }
      return;
    }
    if (!this.charging) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      const g = ctx.createGain();
      g.gain.value = 0;
      o.connect(g);
      this.out(g, 0.4);
      o.start();
      this.charging = { o, g };
    }
    const f = this.harmony.freq(Math.floor(level * 6), 130.81);
    this.charging.o.frequency.setTargetAtTime(f, ctx.currentTime, 0.02);
    this.charging.g.gain.setTargetAtTime(0.025 + level * 0.035, ctx.currentTime, 0.05);
  }

  /** 発射：風切り音と、強さに応じて駆け上がるアルペジオ */
  launch(power: number): void {
    this.chargeTone(-1);
    this.whoosh(0.6 + power);
    const n = 2 + Math.round(power * 4);
    this.arp(Array.from({ length: n }, (_, k) => 4 + k), 0.035, 0.05 + power * 0.03);
  }

  click(pitch = 1): void {
    this.tone(900 * pitch, 0.05, { type: 'triangle', vol: 0.08, wet: 0.1 });
    this.noise(0.04, { vol: 0.08, from: 6000, to: 1500, wet: 0 });
  }

  whoosh(strength = 1): void {
    this.noise(0.5, { vol: 0.15 * strength, from: 600, to: 4000, q: 3, wet: 0.4 });
  }

  chord(baseStep: number, notes = [0, 2, 4, 7], spread = 0.06, vol = 0.1): void {
    if (!this.ctx) return;
    notes.forEach((n, k) => setTimeout(() => this.bell(baseStep + n, vol), k * spread * 1000));
  }

  /** ゆっくり揺れる環境音（ドローン） */
  startAmbient(rootHz = 65.41): void {
    const ctx = this.ctx;
    // BGM があれば、環境音の代わりに BGM（止まっていたら鳴らし直す）
    if (this.music) { if (!this.music.playing) this.music.start(); return; }
    if (!ctx || this.ambient) return;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(0.06, ctx.currentTime, 2);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 600;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 300;
    lfo.connect(lfoG).connect(f.frequency);
    this.ambientRoot = rootHz;
    const oscs = [1, 1.5, 2.005, 3.01].map((m, k) => {
      const o = ctx.createOscillator();
      o.type = k % 2 ? 'triangle' : 'sine';
      o.frequency.value = this.ambientFreq(k) * (m === 2.005 ? 1.0025 : 1);
      o.detune.value = (k - 1.5) * 6;
      o.connect(f);
      o.start();
      return o;
    });
    f.connect(g);
    this.out(g, 0.8);
    lfo.start();
    this.ambient = {
      oscs,
      stop: () => {
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
        setTimeout(() => { oscs.forEach((o) => o.stop()); lfo.stop(); }, 2000);
      },
    };
  }
  /** 環境音の k 番目の声：今の和音の構成音（低音域） */
  private ambientFreq(k: number): number {
    const c = this.harmony.chord();
    const semis = [c[0] - 12, c[2] - 12, c[0], c[1]][k] ?? 0;
    return this.ambientRoot * Math.pow(2, (semis + this.harmony.key) / 12);
  }

  private retuneAmbient(): void {
    const ctx = this.ctx;
    if (!ctx || !this.ambient) return;
    this.ambient.oscs.forEach((o, k) => o.frequency.setTargetAtTime(this.ambientFreq(k), ctx.currentTime, 0.8));
  }

  /** ステージのキー（C からの半音）を決め、和音進行を最初に戻す */
  setKey(key: number): void {
    this.harmony.reset(key);
    this.retuneAmbient();
  }

  stopAmbient(): void {
    this.ambient?.stop();
    this.ambient = null;
  }
}

export const synth = new Synth();
