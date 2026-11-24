/**
 * BGM（素材なし、WebAudio でその場で合成）。UI-01。
 *
 * 夜空の音楽：ゆっくり息をするパッド（重ねた和音）、低いベース、星がまたたくようなアルペジオ（鈴・木琴・オルゴール）、
 * ときどき高いきらめき。こだまのディレイと、synth のリバーブで広がりを出す。
 * 和音は synth.harmony（ゲームの連鎖でも進む）に従うので、ゲームの音と BGM がいつも同じ和音で鳴る。
 * 作品ごとに「スタイル」（速さ・音色・並び方）を変える。強さ（intensity）でアルペジオの密度と明るさが変わる。
 */
import type { Harmony } from './audio';

export type Timbre = 'bell' | 'pluck' | 'glass' | 'box' | 'koto' | 'mallet';

export interface MusicStyle {
  /** 1分の拍数 */
  tempo: number;
  /** アルペジオの音色 */
  timbre: Timbre;
  /** アルペジオの並び（和音の構成音の番号、-1 は休み）。16分音符ごと */
  pattern: number[];
  /** パッドの明るさ（ローパスの周波数） */
  padBright: number;
  /** パッドの波形 */
  padWave: OscillatorType;
  /** アルペジオの高さ（基準の何オクターブ上か） */
  arpOct: number;
  /** 何小節ごとに和音を進めるか（0 で進めない＝ゲームの連鎖だけで進む） */
  barsPerChord: number;
  /** こだま（ディレイ）の量 */
  echo: number;
  /** 音量 */
  level: number;
}

const base: MusicStyle = {
  tempo: 76, timbre: 'bell', pattern: [0, -1, 2, -1, 4, -1, 2, 3, 1, -1, 3, -1, 5, 4, -1, 2],
  padBright: 1400, padWave: 'sawtooth', arpOct: 1, barsPerChord: 2, echo: 0.32, level: 0.55,
};

/** 作品ごとのスタイル */
export const STYLES: Record<string, MusicStyle> = {
  // 星図（ランチャー）：ゆったり、オルゴール
  sky: { ...base, tempo: 66, timbre: 'box', pattern: [0, -1, -1, 4, -1, -1, 2, -1, 5, -1, -1, 3, -1, -1, 1, -1], padBright: 1100 },
  // Nova：きらめく鈴、上がって下がる
  nova: { ...base, tempo: 84, timbre: 'bell', pattern: [0, 2, 4, 2, 5, 4, 2, 4, 1, 3, 5, 3, 6, 5, 3, 5], padBright: 1700, level: 0.5 },
  // Echo：時計のような短いはじく音、こだまが強い
  echo: { ...base, tempo: 72, timbre: 'pluck', pattern: [0, -1, 4, -1, 0, -1, 4, -1, 1, -1, 5, -1, 1, -1, 5, 3], padBright: 900, padWave: 'triangle', echo: 0.55 },
  // Stopped World：まばらなオルゴール（止めると音がこもる）
  stopped: { ...base, tempo: 64, timbre: 'box', pattern: [4, -1, -1, -1, 2, -1, 5, -1, -1, -1, 3, -1, 1, -1, -1, -1], padBright: 1000, arpOct: 2 },
  // Event Horizon：深い。低い木琴と長いパッド
  horizon: { ...base, tempo: 58, timbre: 'mallet', pattern: [0, -1, -1, -1, -1, -1, 2, -1, -1, -1, 1, -1, -1, -1, 3, -1], padBright: 700, arpOct: 0, echo: 0.45 },
  // Origami：琴のようなはじく音、五音で
  origami: { ...base, tempo: 74, timbre: 'koto', pattern: [0, -1, 1, 2, -1, 4, -1, 2, 3, -1, 2, 1, -1, 0, -1, -1], padBright: 1000, padWave: 'triangle' },
  // Starsand：ガラスのような音、さらさら流れる
  starsand: { ...base, tempo: 80, timbre: 'glass', pattern: [0, 1, 2, 4, 2, 1, 3, 5, 0, 2, 4, 6, 4, 2, 1, -1], padBright: 1300, arpOct: 1 },
};

export class Music {
  private bus: GainNode;
  private padFilter: BiquadFilterNode;
  private muffleFilter: BiquadFilterNode;
  private delay: DelayNode;
  private fb: GainNode;
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  private padUntil = 0;
  style: MusicStyle = STYLES.sky;
  /** 0..1：アルペジオの密度と明るさ（ゲームの盛り上がり） */
  intensity = 0.4;

  constructor(private ctx: AudioContext, out: AudioNode, reverb: AudioNode, private harmony: Harmony) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.muffleFilter = ctx.createBiquadFilter();
    this.muffleFilter.type = 'lowpass';
    this.muffleFilter.frequency.value = 18000;
    this.bus.connect(this.muffleFilter).connect(out);
    const rs = ctx.createGain();
    rs.gain.value = 0.6;
    this.muffleFilter.connect(rs).connect(reverb);
    // こだま（付点8分）
    this.delay = ctx.createDelay(2);
    this.fb = ctx.createGain();
    this.fb.gain.value = 0.35;
    const dl = ctx.createBiquadFilter();
    dl.type = 'lowpass';
    dl.frequency.value = 2600;
    this.delay.connect(dl).connect(this.fb).connect(this.delay);
    dl.connect(this.bus);
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 1200;
    this.padFilter.Q.value = 0.7;
    // パッドの明るさがゆっくり揺れる
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lg = ctx.createGain();
    lg.gain.value = 350;
    lfo.connect(lg).connect(this.padFilter.frequency);
    lfo.start();
    this.padFilter.connect(this.bus);
  }

  get playing(): boolean {
    return this.timer !== null;
  }

  setStyle(s: MusicStyle): void {
    this.style = s;
    const beat = 60 / s.tempo;
    this.delay.delayTime.setTargetAtTime(beat * 0.75, this.ctx.currentTime, 0.1);
    this.fb.gain.setTargetAtTime(s.echo, this.ctx.currentTime, 0.1);
    this.padFilter.frequency.setTargetAtTime(s.padBright, this.ctx.currentTime, 0.5);
    if (this.playing) this.bus.gain.setTargetAtTime(s.level, this.ctx.currentTime, 1);
  }

  start(): void {
    if (this.timer !== null) return;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.padUntil = 0;
    this.bus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.bus.gain.setTargetAtTime(this.style.level, this.ctx.currentTime, 1.5);
    this.timer = window.setInterval(() => this.schedule(), 50);
  }

  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
    this.bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.6);
  }

  /** こもらせる（時間を止めている間など）。on=false で戻す */
  muffle(on: boolean): void {
    this.muffleFilter.frequency.setTargetAtTime(on ? 520 : 18000, this.ctx.currentTime, on ? 0.08 : 0.25);
  }

  private freq(semis: number, root = 130.81): number {
    return root * Math.pow(2, (semis + this.harmony.key) / 12);
  }

  /** 和音の n 番目（上へ積む） */
  private chordTone(n: number): number {
    const c = this.harmony.chord();
    const oct = Math.floor(n / c.length);
    return c[((n % c.length) + c.length) % c.length] + 12 * oct;
  }

  private schedule(): void {
    const s = this.style;
    const dur16 = 60 / s.tempo / 4;
    while (this.nextTime < this.ctx.currentTime + 0.25) {
      const t = this.nextTime;
      const inBar = this.step % 16;
      const bar = Math.floor(this.step / 16);
      if (inBar === 0) {
        // 和音を進める（数小節ごと）
        if (s.barsPerChord > 0 && bar > 0 && bar % s.barsPerChord === 0) this.harmony.advance();
        // ベース
        const c = this.harmony.chord();
        this.voice(this.freq(c[0] - 24), t, dur16 * 16, 'sine', 0.11, 0.25, 1.2);
      }
      // パッド：和音が変わる所で重ね直す（前のパッドと少し重ねる）
      if (inBar === 0 && t >= this.padUntil - 0.05) {
        const len = dur16 * 16 * Math.max(1, s.barsPerChord);
        this.pad(t, len + 1.2);
        this.padUntil = t + len;
      }
      // アルペジオ：強さで密度が変わる（休みの所にも、強いと音が入る）
      const p = s.pattern[inBar];
      const dense = this.intensity;
      if (p >= 0 && Math.random() < 0.55 + dense * 0.45) this.arp(this.chordTone(p) + 12 * s.arpOct, t, dense);
      else if (p < 0 && dense > 0.7 && Math.random() < (dense - 0.7) * 1.2) this.arp(this.chordTone(Math.floor(Math.random() * 6)) + 12 * s.arpOct, t, dense * 0.6);
      // きらめき：高い鈴がときどき
      if (inBar % 4 === 2 && Math.random() < 0.12 + dense * 0.15) this.sparkle(t);
      this.nextTime += dur16;
      this.step++;
    }
  }

  private pad(t: number, len: number): void {
    const c = this.harmony.chord();
    const notes = [c[0] - 12, c[1], c[2], c[3] ?? c[0] + 12];
    for (const n of notes) {
      for (const det of [-7, 7]) {
        const o = this.ctx.createOscillator();
        o.type = this.style.padWave;
        o.frequency.value = this.freq(n);
        o.detune.value = det;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.018, t + 1.6);
        g.gain.setValueAtTime(0.018, t + Math.max(1.7, len - 1.4));
        g.gain.linearRampToValueAtTime(0, t + len);
        o.connect(g).connect(this.padFilter);
        o.start(t);
        o.stop(t + len + 0.1);
      }
    }
  }

  private arp(semis: number, t: number, energy: number): void {
    const f = this.freq(semis, 261.63);
    const v = 0.05 + energy * 0.03;
    switch (this.style.timbre) {
      case 'bell':
        this.voice(f, t, 1.1, 'sine', v, 0.6);
        this.voice(f * 2.01, t, 0.5, 'sine', v * 0.3, 0.6);
        this.voice(f * 3.98, t, 0.25, 'sine', v * 0.12, 0.6);
        break;
      case 'box':
        this.voice(f * 2, t, 0.9, 'sine', v * 0.9, 0.7);
        this.voice(f * 4.02, t, 0.35, 'sine', v * 0.25, 0.7);
        break;
      case 'pluck':
        this.voice(f, t, 0.35, 'triangle', v * 1.1, 0.8, 0.002);
        this.voice(f * 2, t, 0.12, 'sine', v * 0.4, 0.8, 0.002);
        break;
      case 'glass':
        this.voice(f, t, 0.8, 'sine', v, 0.7);
        this.voice(f * 2.76, t, 0.4, 'sine', v * 0.25, 0.7);
        this.voice(f * 5.4, t, 0.2, 'sine', v * 0.1, 0.7);
        break;
      case 'koto': {
        // はじいた瞬間に少し高く、すぐ落ち着く
        const o = this.ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.setValueAtTime(f * 1.02, t);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
        this.env(o, t, 0.7, v * 1.1, 0.002, 0.7);
        this.voice(f * 3, t, 0.15, 'sine', v * 0.2, 0.7, 0.002);
        break;
      }
      case 'mallet':
        this.voice(f / 2, t, 1.4, 'sine', v * 1.2, 0.5, 0.01);
        this.voice(f * 2, t, 0.3, 'sine', v * 0.2, 0.5, 0.005);
        break;
    }
  }

  private sparkle(t: number): void {
    const f = this.freq(this.chordTone(Math.floor(Math.random() * 5)) + 24, 261.63);
    this.voice(f, t, 1.4, 'sine', 0.022, 0.9);
    this.voice(f * 1.5, t + 0.09, 1.2, 'sine', 0.012, 0.9);
  }

  /** 1つの音：エンベロープつきの発振器をバスとこだまへ */
  private voice(f: number, t: number, dur: number, type: OscillatorType, vol: number, echoSend: number, attack = 0.006): void {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    this.env(o, t, dur, vol, attack, echoSend);
  }

  private env(o: OscillatorNode, t: number, dur: number, vol: number, attack: number, echoSend: number): void {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.bus);
    if (echoSend > 0) {
      const e = this.ctx.createGain();
      e.gain.value = echoSend * this.style.echo;
      g.connect(e).connect(this.delay);
    }
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}
