/**
 * Event Horizon — 地平すれすれ（EH-20b）のシミュレーション（描画なし・決定的）。
 *
 * 小さな船でブラックホールの周りを回る。操作は2つだけ：
 *   - 加速（↑・Space・クリック長押し／スマホは右半分）：進行方向へ噴射 → 軌道が膨らむ（離脱）
 *   - 減速（↓・X／スマホは左半分）：進行方向と逆へ噴射 → 軌道が縮む（地平へ潜る）
 * 地平に近いほど船の時計が遅れ、「時間の倍率」が上がる。かけらを拾うと 10 × 倍率 点。
 * 持ち時間は「船の時計」で数える — すれすれを飛ぶほど、外の世界より時間が長持ちする。
 * 地平の内側に入ったら終わり。画面の外へ流されても終わり。燃料は有限。
 * ブラックホールは複数でもよい（連星は時間の関数で回る）。
 */
import { Rng } from '@engine/rng';

export const HZ = 120;
export const DT = 1 / HZ;
export const WORLD_W = 32;
export const WORLD_H = 18;

export interface SkimConfig {
  /** 重力の強さの倍率（ステージの gm に掛ける） */
  gravity: number;
  /** 地平の近くで重力が強まる割合（落ちやすさ） */
  strong: number;
  /** 噴射の加速 */
  thrust: number;
  /** 燃料（秒ぶんの噴射。ステージの fuel に掛ける倍率ではなく、ステージに無い時の値） */
  fuel: number;
  /** 燃料の倍率（難易度） */
  fuelMul: number;
  /** 持ち時間（船の時計の秒） */
  time: number;
  /** 倍率の上限 */
  maxMult: number;
  /** かけらを拾える距離 */
  pickR: number;
}

export const defaults: SkimConfig = {
  gravity: 1, strong: 0.35, thrust: 1.3, fuel: 14, fuelMul: 1, time: 60, maxMult: 9, pickR: 0.55,
};

export interface Pt { x: number; y: number }

/** ブラックホール。orbit があると (cx, cy) の周りを半径 r・周期 period で回る（連星） */
export interface HoleDef { x: number; y: number; gm: number; rs: number; orbit?: { r: number; period: number; phase: number } }

/** かけらの輪：hole の周り半径 r に count 個。spin はかけらの回る速さ（軌道の速さに対する割合、負で逆回り） */
export interface RingDef { hole: number; r: number; count: number; spin?: number }

export interface StageDef {
  id: string;
  name: string;
  hint: string;
  holes: HoleDef[];
  /** 船の最初の軌道：中心（hole の番号か点）の周りの半径、向き（1 反時計回り・-1 時計回り）、角度 */
  start: { around: number | Pt; r: number; dir?: number; angle?: number };
  rings: RingDef[];
  /** ★1・★2・★3 の点 */
  stars: [number, number, number];
  fuel?: number;
  time?: number;
  /** 新しく出てくる要素の図解カードの名前（rules.ts） */
  intro?: string;
}

export interface Shard { x: number; y: number; ring: number; r: number; a: number; w: number }

export type SkimEvent =
  | { t: 'pick'; x: number; y: number; mult: number; pts: number }
  | { t: 'skim'; mult: number }
  | { t: 'perihelion'; r: number; mult: number }
  | { t: 'fuelOut' }
  | { t: 'end'; why: 'horizon' | 'drift' | 'time' };

export type EndWhy = 'horizon' | 'drift' | 'time';

export class SkimSim {
  cfg: SkimConfig;
  rng: Rng;
  x: number; y: number; vx: number; vy: number;
  tick = 0;
  /** 船の時計（秒） */
  shipTime = 0;
  fuel: number;
  fuelMax: number;
  timeMax: number;
  score = 0;
  picks = 0;
  bestMult = 1;
  phase: 'play' | 'over' = 'play';
  endWhy: EndWhy | null = null;
  shards: Shard[] = [];
  events: SkimEvent[] = [];
  /** 入力：1 = 加速、-1 = 減速、0 = なし */
  input = 0;
  /** 今噴射しているか（描画用） */
  firing = 0;
  /** 今のブラックホールの位置 */
  holes: Pt[] = [];
  private wasSkim = false;
  private lastR: number;
  private falling = false;

  constructor(public stage: StageDef, cfg: SkimConfig = defaults, seed = 7) {
    this.cfg = { ...cfg };
    this.rng = new Rng(seed);
    this.fuelMax = (stage.fuel ?? this.cfg.fuel) * this.cfg.fuelMul;
    this.fuel = this.fuelMax;
    this.timeMax = stage.time ?? this.cfg.time;
    this.holes = stage.holes.map((_, i) => this.holeAt(i, 0));
    const c = this.center(stage.start.around, 0);
    const r0 = stage.start.r;
    const ang = stage.start.angle ?? -Math.PI / 2;
    const dir = stage.start.dir ?? 1;
    this.x = c.x + Math.cos(ang) * r0;
    this.y = c.y + Math.sin(ang) * r0;
    // 円軌道の速さ（中心の内側にある重さの合計で）
    const gm = typeof stage.start.around === 'number' ? this.gmOf(stage.start.around) : stage.holes.reduce((s, _, i) => s + this.gmOf(i), 0);
    const v = Math.sqrt(gm / r0);
    // 反時計回り（画面は y 下向きなので、見た目では時計回りに見えないよう -dir）
    this.vx = -Math.sin(ang) * v * dir;
    this.vy = Math.cos(ang) * v * dir;
    this.lastR = this.nearest().r;
    stage.rings.forEach((rg, ri) => { for (let k = 0; k < rg.count; k++) this.shards.push(this.newShard(ri, (k / rg.count) * Math.PI * 2 + this.rng.range(-0.3, 0.3))); });
  }

  gmOf(i: number): number {
    return this.stage.holes[i].gm * this.cfg.gravity;
  }

  /** ブラックホール i の時刻 t（秒）での位置 */
  holeAt(i: number, t: number): Pt {
    const h = this.stage.holes[i];
    if (!h.orbit) return { x: h.x, y: h.y };
    const a = h.orbit.phase + (t / h.orbit.period) * Math.PI * 2;
    return { x: h.x + Math.cos(a) * h.orbit.r, y: h.y + Math.sin(a) * h.orbit.r };
  }

  private center(around: number | Pt, t: number): Pt {
    return typeof around === 'number' ? this.holeAt(around, t) : around;
  }

  private newShard(ring: number, a?: number): Shard {
    const rg = this.stage.rings[ring];
    const r = rg.r + this.rng.range(-0.2, 0.25);
    const ang = a ?? this.rng.range(0, Math.PI * 2);
    const gm = this.gmOf(rg.hole);
    const w = (rg.spin ?? 0.35) * Math.sqrt(gm / r ** 3);
    const c = this.holes[rg.hole];
    return { x: c.x + Math.cos(ang) * r, y: c.y + Math.sin(ang) * r, ring, r, a: ang, w };
  }

  get time(): number {
    return this.tick / HZ;
  }

  /** 一番近いブラックホールと、その地平までの距離の比 */
  nearest(x = this.x, y = this.y, holes = this.holes): { i: number; r: number; k: number } {
    let best = { i: 0, r: 1e9, k: 1e9 };
    holes.forEach((h, i) => {
      const r = Math.hypot(x - h.x, y - h.y);
      const k = r / this.stage.holes[i].rs;
      if (k < best.k) best = { i, r, k };
    });
    return best;
  }

  /** 時間の遅れ（倍率）：一番効いているブラックホールで */
  dilationAt(x: number, y: number, holes = this.holes): number {
    let m = 1;
    holes.forEach((h, i) => {
      const r = Math.hypot(x - h.x, y - h.y);
      const k = Math.max(0.012, 1 - this.stage.holes[i].rs / Math.max(r, 1e-3));
      m = Math.max(m, 1 / Math.sqrt(k));
    });
    return Math.min(this.cfg.maxMult, m);
  }

  dilation(): number {
    return this.dilationAt(this.x, this.y);
  }

  get mult(): number {
    return Math.round(this.dilation() * 10) / 10;
  }

  private accel(x: number, y: number, holes: Pt[]): { ax: number; ay: number } {
    let ax = 0, ay = 0;
    holes.forEach((h, i) => {
      const dx = h.x - x, dy = h.y - y;
      const r = Math.max(0.3, Math.hypot(dx, dy));
      const d = this.stage.holes[i];
      const a = (this.gmOf(i) / (r * r)) * (1 + this.cfg.strong * (d.rs / r) ** 2);
      ax += (dx / r) * a; ay += (dy / r) * a;
    });
    return { ax, ay };
  }

  /** 速度ベルレで1歩（重力のみ） */
  private integrate(s: { x: number; y: number; vx: number; vy: number }, t: number): void {
    const h0 = this.stage.holes.map((_, i) => this.holeAt(i, t));
    const h1 = this.stage.holes.map((_, i) => this.holeAt(i, t + DT));
    const a1 = this.accel(s.x, s.y, h0);
    s.vx += a1.ax * DT * 0.5; s.vy += a1.ay * DT * 0.5;
    s.x += s.vx * DT; s.y += s.vy * DT;
    const a2 = this.accel(s.x, s.y, h1);
    s.vx += a2.ax * DT * 0.5; s.vy += a2.ay * DT * 0.5;
  }

  private outside(x: number, y: number): boolean {
    return x < -1.5 || x > WORLD_W + 1.5 || y < -1.5 || y > WORLD_H + 1.5;
  }

  step(): void {
    this.events = [];
    if (this.phase !== 'play') return;
    const t0 = this.time;
    this.tick++;
    // 噴射：進行方向（加速）か、その逆（減速）
    this.firing = 0;
    if (this.input !== 0 && this.fuel > 0) {
      const sp = Math.hypot(this.vx, this.vy) || 1;
      const k = this.input * this.cfg.thrust * DT;
      this.vx += (this.vx / sp) * k;
      this.vy += (this.vy / sp) * k;
      this.fuel = Math.max(0, this.fuel - DT);
      this.firing = this.input;
      if (this.fuel === 0) this.events.push({ t: 'fuelOut' });
    }
    const s = { x: this.x, y: this.y, vx: this.vx, vy: this.vy };
    this.integrate(s, t0);
    this.x = s.x; this.y = s.y; this.vx = s.vx; this.vy = s.vy;
    this.holes = this.stage.holes.map((_, i) => this.holeAt(i, this.time));

    const near = this.nearest();
    const dil = this.dilation();
    this.shipTime += DT / dil;
    this.bestMult = Math.max(this.bestMult, dil);
    // 近点（一番近づいた所）を知らせる
    if (near.r > this.lastR && this.falling) this.events.push({ t: 'perihelion', r: this.lastR, mult: dil });
    this.falling = near.r < this.lastR;
    this.lastR = near.r;
    // すれすれ（倍率 2.5 以上）に入った瞬間
    const skim = dil >= 2.5;
    if (skim && !this.wasSkim) this.events.push({ t: 'skim', mult: dil });
    this.wasSkim = skim;
    // かけら：自分の輪のブラックホールの周りを回る
    for (let i = 0; i < this.shards.length; i++) {
      const sh = this.shards[i];
      const c = this.holes[this.stage.rings[sh.ring].hole];
      sh.a += sh.w * DT;
      sh.x = c.x + Math.cos(sh.a) * sh.r;
      sh.y = c.y + Math.sin(sh.a) * sh.r;
      if (Math.hypot(sh.x - this.x, sh.y - this.y) < this.cfg.pickR) {
        const m = Math.round(dil * 10) / 10;
        const pts = Math.round(10 * m);
        this.score += pts;
        this.picks++;
        this.events.push({ t: 'pick', x: sh.x, y: sh.y, mult: m, pts });
        // 拾った所から離れた角度に、新しいかけら
        this.shards[i] = this.newShard(sh.ring, sh.a + Math.PI * this.rng.range(0.6, 1.4));
      }
    }
    if (near.r < this.stage.holes[near.i].rs) this.end('horizon');
    else if (this.outside(this.x, this.y)) this.end('drift');
    else if (this.shipTime >= this.timeMax) this.end('time');
  }

  private end(why: EndWhy): void {
    this.phase = 'over';
    this.endWhy = why;
    this.events.push({ t: 'end', why });
  }

  /** 先の軌道（噴射なし）。予測線・ボット用 */
  predict(n: number, every = 4): Pt[] {
    const s = { x: this.x, y: this.y, vx: this.vx, vy: this.vy };
    const out: Pt[] = [];
    let t = this.time;
    for (let i = 0; i < n; i++) {
      this.integrate(s, t);
      t += DT;
      if (i % every === 0) out.push({ x: s.x, y: s.y });
      const hs = this.stage.holes.map((_, k) => this.holeAt(k, t));
      const nr = this.nearest(s.x, s.y, hs);
      if (nr.r < this.stage.holes[nr.i].rs || this.outside(s.x, s.y)) { out.push({ x: s.x, y: s.y }); break; }
    }
    return out;
  }

  /** 噴射なしで先へ進めた時、一番近づく地平の比（r / rs）と、外へ出るか */
  lookahead(n: number): { minK: number; out: boolean } {
    const s = { x: this.x, y: this.y, vx: this.vx, vy: this.vy };
    let t = this.time, minK = 1e9;
    for (let i = 0; i < n; i++) {
      this.integrate(s, t);
      t += DT;
      if (i % 3 !== 0) continue;
      const hs = this.stage.holes.map((_, k) => this.holeAt(k, t));
      minK = Math.min(minK, this.nearest(s.x, s.y, hs).k);
      if (this.outside(s.x, s.y)) return { minK, out: true };
    }
    return { minK, out: false };
  }

  /** 何点で★いくつか */
  starsFor(score = this.score): number {
    return this.stage.stars.filter((v) => score >= v).length;
  }

  digest(): number[] {
    return [this.tick, this.x, this.y, this.vx, this.vy, this.score, this.fuel];
  }
}
