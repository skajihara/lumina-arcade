/**
 * 素材なしの音。WebAudio でその場で合成する。
 * 連鎖の音は五音音階（ペンタトニック）で上がっていくので、連鎖が伸びるほど旋律になる。
 */
const PENTA = [0, 2, 4, 7, 9];

export function pentatonicFreq(step: number, root = 261.63): number {
  const oct = Math.floor(step / PENTA.length);
  const deg = PENTA[((step % PENTA.length) + PENTA.length) % PENTA.length];
  return root * Math.pow(2, oct + deg / 12);
}

export class Synth {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private reverbSend!: GainNode;
  private noiseBuf!: AudioBuffer;
  private ambient: { stop(): void } | null = null;
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

  /** 爆発音。intensity 0..1、step は連鎖段数 */
  boom(intensity: number, step: number): void {
    const i = Math.min(1, Math.max(0, intensity));
    this.noise(0.35 + i * 0.5, { vol: 0.25 + i * 0.35, from: 2500 + i * 3000, to: 80 });
    this.tone(110 - i * 40, 0.5 + i * 0.4, { type: 'sine', vol: 0.35 + i * 0.2, slideTo: 35, wet: 0.2 });
    this.bell(step, 0.1 + i * 0.05);
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
    const oscs = [1, 1.5, 2.005, 3.01].map((m, k) => {
      const o = ctx.createOscillator();
      o.type = k % 2 ? 'triangle' : 'sine';
      o.frequency.value = rootHz * m;
      o.detune.value = (k - 1.5) * 6;
      o.connect(f);
      o.start();
      return o;
    });
    f.connect(g);
    this.out(g, 0.8);
    lfo.start();
    this.ambient = {
      stop: () => {
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
        setTimeout(() => { oscs.forEach((o) => o.stop()); lfo.stop(); }, 2000);
      },
    };
  }
  stopAmbient(): void {
    this.ambient?.stop();
    this.ambient = null;
  }
}

export const synth = new Synth();
