/**
 * 時空の絵筆（Chrono Brush）のシミュレーション（描画なし）。NEW-01a で実験枠から本編へ。
 * 空から星が降ってくる。下では星座の籠が左右に揺れている。
 * 時間の流れを塗る：青＝遅い（×slow）、赤＝速い（×fast）、紫＝逆再生（来た道を戻る）。塗った円の中では、星の時間がその速さで進む。
 * 星は風で斜めに流れて降る。風は世界の時間で吹くので、星の時間を遅らせる（逆再生する）ほど横へ運ばれ、速めるほど真下に近く落ちる。
 * 塗った時間は zoneLife 秒で消える。
 * 星が籠に入れば捕まえた、床に落ちれば消える。インクは有限。
 */
import { Rng } from '@engine/rng';

export const VIEW_W = 1000;
export const VIEW_H = 600;
export const HZ = 120;
const DT = 1 / HZ;

export type Brush = 'slow' | 'fast' | 'rewind';
export interface Zone { x: number; y: number; r: number; k: Brush; age: number }
export interface Star { x: number; y: number; vx: number; vy: number; alive: boolean; caught: boolean }
export interface ChronoConfig { inkScale?: number; windBias: number; spawnMin: number; spawnMax: number; gravity: number; slow: number; fast: number; rewind: number; ink: number; stars: number; interval: number; basketSpeed: number; basketW: number; wind: number; zoneLife: number }

/** windBias：風の向きと強さ（＋で右へ）。spawnMin/Max：星が出る横の範囲。wind：星が横に流れる速さの幅（斜めに降る）。zoneLife：塗った時間が消えるまでの秒（0 で消えない） */
export const defaults: ChronoConfig = { windBias: 0, spawnMin: 120, spawnMax: 880, gravity: 420, slow: 0.25, fast: 2.2, rewind: -0.6, ink: 14, stars: 12, interval: 1.1, basketSpeed: 0.55, basketW: 120, wind: 150, zoneLife: 7 };

export type ChronoEvent = { t: 'catch'; x: number; y: number; n: number } | { t: 'miss'; x: number; y: number } | { t: 'void'; x: number; y: number } | { t: 'end' };

/** ステージ：籠の動き・風・星を飲む「虚空」・インク・クリアに要る数 */
export interface ChronoStage {
  name: string;
  hint: string;
  seed: number;
  /** 籠の動き：sine＝左右にゆっくり／still＝止まっている（x）／fast＝速く揺れる／jump＝数秒ごとに瞬間移動 */
  basket: { kind: 'sine' | 'still' | 'fast' | 'jump'; x?: number; amp?: number; speed?: number };
  /** 星を飲み込む虚空（入ると消える） */
  voids?: { x: number; y: number; r: number }[];
  /** 上書きする設定（風・インク・星の数・間隔など） */
  cfg?: Partial<ChronoConfig>;
  /** クリアに要る数 */
  need: number;
}

export const chronoStages: ChronoStage[] = [
  { name: '風を待つ', hint: '風は右へ吹く。遅い時間（青）で星を浮かせ、風に運ばせて籠へ', seed: 11, basket: { kind: 'still', x: 780 }, cfg: { stars: 8, windBias: 90, wind: 25, spawnMin: 200, spawnMax: 640, ink: 12 }, need: 5 },
  { name: '揺れる籠', hint: '籠の来る時に合わせて、星を遅らせる', seed: 3, basket: { kind: 'sine' }, cfg: { stars: 10, wind: 60, ink: 17 }, need: 6 },
  { name: '急ぐ星', hint: '赤い時間で、籠が離れる前に落とせ。流されすぎた星は真下へ', seed: 7, basket: { kind: 'sine', speed: 0.9 }, cfg: { stars: 10, wind: 90, ink: 14 }, need: 6 },
  { name: '虚空', hint: '黒い虚空は星を飲む。遅らせて風でよけるか、急がせて手前で落とせ', seed: 5, basket: { kind: 'still', x: 500 }, voids: [{ x: 430, y: 330, r: 55 }], cfg: { stars: 10, windBias: 70, wind: 20, spawnMin: 150, spawnMax: 480, ink: 10 }, need: 8 },
  { name: '跳ぶ籠', hint: '籠は3秒ごとに跳ぶ。次の場所を読んで待たせろ', seed: 9, basket: { kind: 'jump' }, cfg: { stars: 10, wind: 120, ink: 16 }, need: 4 },
  { name: '流星群', hint: '星が次々と降る。三色を使い分けろ', seed: 13, basket: { kind: 'fast' }, voids: [{ x: 500, y: 280, r: 70 }], cfg: { stars: 16, interval: 0.7, wind: 160, ink: 22 }, need: 8 },
  // NEW-01b：後半の4面
  { name: '逆風', hint: '風は左へ。右で生まれた星を遅らせて、左端の籠まで運ばせろ', seed: 21, basket: { kind: 'still', x: 190 }, cfg: { stars: 10, windBias: -95, wind: 25, spawnMin: 520, spawnMax: 860, ink: 15 }, need: 5 },
  { name: '二つの虚空', hint: '虚空が二つ。星の通り道を読んで、虚空の間をすり抜けさせろ', seed: 23, basket: { kind: 'sine' }, voids: [{ x: 340, y: 320, r: 62 }, { x: 660, y: 320, r: 62 }], cfg: { stars: 12, wind: 70, ink: 18 }, need: 5 },
  { name: '谷底の籠', hint: '籠の真上に虚空。逆再生（紫）で星を戻し、風で回り込ませろ', seed: 27, basket: { kind: 'still', x: 520 }, voids: [{ x: 470, y: 330, r: 60 }], cfg: { stars: 10, windBias: 40, wind: 30, spawnMin: 260, spawnMax: 700, ink: 16 }, need: 3 },
  { name: '時の嵐', hint: '強い風、速い籠、二つの虚空。全部の時間を使え', seed: 31, basket: { kind: 'fast' }, voids: [{ x: 300, y: 250, r: 55 }, { x: 720, y: 330, r: 60 }], cfg: { stars: 18, interval: 0.65, wind: 190, ink: 26 }, need: 8 },
];

export class ChronoSim {
  zones: Zone[] = [];
  stars: Star[] = [];
  tick = 0;
  spawned = 0;
  caught = 0;
  missed = 0;
  ink: number;
  events: ChronoEvent[] = [];
  done = false;
  private rng: Rng;

  stage: ChronoStage | null;

  constructor(public cfg: ChronoConfig, seed = 1, stage: ChronoStage | null = null) {
    this.stage = stage;
    if (stage) {
      this.cfg = { ...cfg, ...stage.cfg };
      seed = stage.seed;
    }
    this.rng = new Rng(seed);
    // 難易度でインクの量を増減（inkScale）
    this.ink = Math.max(1, Math.round(this.cfg.ink * (cfg.inkScale ?? 1)));
  }

  /** ステージから作る */
  static of(stage: ChronoStage, cfg: ChronoConfig = defaults): ChronoSim {
    return new ChronoSim(cfg, stage.seed, stage);
  }

  /** 状態を写した別の世界（ボットの先読み用）。乱数は星を全部出し終えた後なら関係ない */
  clone(): ChronoSim {
    const c = new ChronoSim(this.cfg, 1, null);
    c.stage = this.stage;
    c.cfg = this.cfg;
    c.zones = this.zones.map((z) => ({ ...z }));
    c.stars = this.stars.map((s) => ({ ...s }));
    c.tick = this.tick;
    c.spawned = this.spawned;
    c.caught = this.caught;
    c.missed = this.missed;
    c.ink = this.ink;
    c.done = this.done;
    c.rng = this.rng.clone();
    return c;
  }

  get cleared(): boolean {
    return !!this.stage && this.caught >= this.stage.need;
  }

  get time(): number { return this.tick / HZ; }

  /** 籠の中心（左右にゆっくり揺れる） */
  basketX(at = this.time): number {
    const b = this.stage?.basket ?? { kind: 'sine' as const };
    const amp = b.amp ?? VIEW_W * 0.36;
    const sp = b.speed ?? this.cfg.basketSpeed;
    if (b.kind === 'still') return b.x ?? VIEW_W / 2;
    if (b.kind === 'fast') return VIEW_W / 2 + Math.sin(at * 1.6 * 2) * amp * 0.9;
    if (b.kind === 'jump') {
      // 3秒ごとに、決まった順の5か所へ跳ぶ
      const spots = [0.5, 0.18, 0.78, 0.35, 0.65];
      return VIEW_W * spots[Math.floor(at / 3) % spots.length];
    }
    return VIEW_W / 2 + Math.sin(at * sp * 2) * amp;
  }

  paint(x: number, y: number, k: Brush): boolean {
    if (this.ink <= 0) return false;
    // 近すぎる所に同じ色の円があれば塗らない（インクの節約）
    if (this.zones.some((z) => z.k === k && Math.hypot(z.x - x, z.y - y) < 30)) return false;
    this.zones.push({ x, y, r: 48, k, age: 0 });
    this.ink--;
    return true;
  }

  /** その場所の時間の速さ */
  rate(x: number, y: number): number {
    let r = 1;
    for (const z of this.zones) {
      if (Math.hypot(z.x - x, z.y - y) > z.r) continue;
      // 逆再生は何より強い（来た道を戻る）
      if (z.k === 'rewind') return this.cfg.rewind;
      r = z.k === 'slow' ? Math.min(r, this.cfg.slow) : Math.max(r, this.cfg.fast);
    }
    return r;
  }

  step(): void {
    this.events = [];
    this.tick++;
    if (this.done) return;
    if (this.spawned < this.cfg.stars && this.time >= this.spawned * this.cfg.interval + 0.5) {
      this.stars.push({ x: this.rng.range(this.cfg.spawnMin, this.cfg.spawnMax), y: -10, vx: this.cfg.windBias + this.rng.range(-this.cfg.wind, this.cfg.wind), vy: 0, alive: true, caught: false });
      this.spawned++;
    }
    // 塗った時間は少しずつ消える
    if (this.cfg.zoneLife > 0) {
      for (const z of this.zones) z.age += DT;
      this.zones = this.zones.filter((z) => z.age < this.cfg.zoneLife);
    }
    const bx = this.basketX();
    const by = VIEW_H - 40;
    for (const s of this.stars) {
      if (!s.alive) continue;
      const dt = DT * this.rate(s.x, s.y);
      s.vy += this.cfg.gravity * dt;
      // 風（横の流れ）は世界の時間で進む：星の時間を遅らせるほど、落ちる間に風で遠くへ運ばれる（＝曲げられる）
      s.x += s.vx * DT;
      s.y += s.vy * dt;
      if (s.x < 10 || s.x > VIEW_W - 10) { s.vx = -s.vx; s.x = Math.min(VIEW_W - 10, Math.max(10, s.x)); }
      if (this.stage?.voids?.some((v) => Math.hypot(v.x - s.x, v.y - s.y) < v.r)) {
        s.alive = false;
        this.missed++;
        this.events.push({ t: 'void', x: s.x, y: s.y });
        continue;
      }
      if (s.y >= by && s.y - s.vy * dt < by && Math.abs(s.x - bx) < this.cfg.basketW / 2) {
        s.alive = false;
        s.caught = true;
        this.caught++;
        this.events.push({ t: 'catch', x: s.x, y: by, n: this.caught });
      } else if (s.y > VIEW_H) {
        s.alive = false;
        this.missed++;
        this.events.push({ t: 'miss', x: s.x, y: VIEW_H - 4 });
      }
    }
    if (this.spawned >= this.cfg.stars && this.stars.every((s) => !s.alive)) {
      this.done = true;
      this.events.push({ t: 'end' });
    }
  }
}
