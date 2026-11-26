/**
 * 試作 EH-20 案①「スイングバイ」のシミュレーション（描画なし・決定的・120Hz）。
 * 探査機を1回だけ打ち出し、ブラックホールと惑星の重力で曲げて星の門へ届ける。
 * - ブラックホールの事象の地平（半径 rh）に触れると吸い込まれて失敗。惑星に当たっても失敗
 * - 地平の近くを通るほど時間が遅れ（dilation = 1/sqrt(1 - rh/r)）、その分だけ得点が溜まる＝攻めるほど高得点
 * - 星のかけらを拾うと★（最大3）
 */
export const HZ = 120;
export const DT = 1 / HZ;
export const W = 32;
export const H = 18;

export interface Pt { x: number; y: number }
export interface Hole { x: number; y: number; rh: number; gm: number }
export interface Planet { x: number; y: number; r: number; gm: number }
export interface Shard { x: number; y: number; got: boolean }

export interface SwingCfg {
  vmax: number;
  timeLimit: number;
  shardR: number;
  gateR: number;
}
export const defaults: SwingCfg = { vmax: 12, timeLimit: 14, shardR: 0.6, gateR: 1.3 };

export type SwingEvent =
  | { t: 'launch'; power: number }
  | { t: 'graze'; x: number; y: number; dil: number }
  | { t: 'shard'; x: number; y: number; n: number }
  | { t: 'swallow'; x: number; y: number }
  | { t: 'crash'; x: number; y: number }
  | { t: 'lost' }
  | { t: 'arrive'; x: number; y: number };

export class SwingSim {
  start: Pt = { x: 2.6, y: 9 };
  gate: Pt = { x: 29.4, y: 9 };
  holes: Hole[] = [
    { x: 10.5, y: 4.6, rh: 0.85, gm: 40 },
    { x: 21.5, y: 13.2, rh: 0.95, gm: 46 },
  ];
  planets: Planet[] = [{ x: 16, y: 9, r: 1.7, gm: 16 }];
  shards: Shard[] = [
    { x: 13.4, y: 3.7, got: false },
    { x: 19.4, y: 5.0, got: false },
    { x: 25.2, y: 6.2, got: false },
  ];
  pos: Pt = { ...this.start };
  vel: Pt = { x: 0, y: 0 };
  phase: 'aim' | 'fly' | 'clear' | 'fail' = 'aim';
  failWhy = '';
  tick = 0;
  flyTicks = 0;
  score = 0;
  /** 今の時間の遅れ（1 = 遅れなし） */
  dil = 1;
  maxDil = 1;
  events: SwingEvent[] = [];
  private grazing = false;
  /** step の外（launch）で起きた出来事。次の step の events に入れる */
  private queued: SwingEvent[] = [];

  constructor(public cfg: SwingCfg = defaults) {}

  get stars(): number {
    return this.shards.filter((s) => s.got).length;
  }

  /** 向き (dx, dy) と強さ 0〜1 で打ち出す */
  launch(dx: number, dy: number, power: number): boolean {
    if (this.phase !== 'aim') return false;
    const l = Math.hypot(dx, dy);
    if (l < 1e-6) return false;
    const p = Math.max(0.05, Math.min(1, power));
    this.vel = { x: (dx / l) * p * this.cfg.vmax, y: (dy / l) * p * this.cfg.vmax };
    this.phase = 'fly';
    this.queued.push({ t: 'launch', power: p });
    return true;
  }

  private accel(x: number, y: number): Pt {
    let ax = 0, ay = 0;
    for (const b of [...this.holes, ...this.planets]) {
      const dx = b.x - x, dy = b.y - y;
      const r2 = dx * dx + dy * dy + 0.05;
      const r = Math.sqrt(r2);
      const a = b.gm / r2;
      ax += (dx / r) * a;
      ay += (dy / r) * a;
    }
    return { x: ax, y: ay };
  }

  step(): void {
    this.events = this.queued;
    this.queued = [];
    this.tick++;
    if (this.phase !== 'fly') return;
    this.flyTicks++;
    // 半陰的オイラー（4 分割で精度を上げる）
    const sub = 4, h = DT / sub;
    for (let i = 0; i < sub; i++) {
      const a = this.accel(this.pos.x, this.pos.y);
      this.vel.x += a.x * h;
      this.vel.y += a.y * h;
      this.pos.x += this.vel.x * h;
      this.pos.y += this.vel.y * h;
      if (this.collide()) return;
    }
    // 時間の遅れ（一番強い穴）と得点
    let dil = 1;
    for (const b of this.holes) {
      const r = Math.hypot(this.pos.x - b.x, this.pos.y - b.y);
      dil = Math.max(dil, 1 / Math.sqrt(Math.max(0.02, 1 - b.rh / r)));
    }
    this.dil = dil;
    this.maxDil = Math.max(this.maxDil, dil);
    this.score += (dil - 1) * (dil - 1) * 400 * DT + 10 * DT;
    const graze = dil > 1.5;
    if (graze && !this.grazing) this.events.push({ t: 'graze', x: this.pos.x, y: this.pos.y, dil });
    this.grazing = graze;
    for (const s of this.shards) {
      if (!s.got && Math.hypot(s.x - this.pos.x, s.y - this.pos.y) < this.cfg.shardR) {
        s.got = true;
        this.score += 300;
        this.events.push({ t: 'shard', x: s.x, y: s.y, n: this.stars });
      }
    }
    if (Math.hypot(this.gate.x - this.pos.x, this.gate.y - this.pos.y) < this.cfg.gateR) {
      this.phase = 'clear';
      this.score += 1000;
      this.events.push({ t: 'arrive', x: this.pos.x, y: this.pos.y });
      return;
    }
    if (this.pos.x < -3 || this.pos.x > W + 3 || this.pos.y < -3 || this.pos.y > H + 3 || this.flyTicks > this.cfg.timeLimit * HZ) {
      this.fail('彼方へ流れていった');
      this.events.push({ t: 'lost' });
    }
  }

  private collide(): boolean {
    for (const b of this.holes) {
      if (Math.hypot(this.pos.x - b.x, this.pos.y - b.y) < b.rh) {
        this.fail('事象の地平に吸い込まれた');
        this.events.push({ t: 'swallow', x: b.x, y: b.y });
        return true;
      }
    }
    for (const p of this.planets) {
      if (Math.hypot(this.pos.x - p.x, this.pos.y - p.y) < p.r) {
        this.fail('惑星にぶつかった');
        this.events.push({ t: 'crash', x: this.pos.x, y: this.pos.y });
        return true;
      }
    }
    return false;
  }

  private fail(why: string): void {
    this.phase = 'fail';
    this.failWhy = why;
  }

  /** 予測用の写し */
  clone(): SwingSim {
    const c = new SwingSim(this.cfg);
    c.pos = { ...this.pos };
    c.vel = { ...this.vel };
    c.phase = this.phase;
    c.shards = this.shards.map((s) => ({ ...s }));
    return c;
  }

  /** 打ったらどう飛ぶか（点の列。終わった理由つき） */
  predict(dx: number, dy: number, power: number, maxSec = 6): { pts: Pt[]; end: SwingSim['phase'] } {
    const c = this.clone();
    c.launch(dx, dy, power);
    const pts: Pt[] = [];
    for (let i = 0; i < maxSec * HZ && c.phase === 'fly'; i++) {
      c.step();
      if (i % 3 === 0) pts.push({ ...c.pos });
    }
    return { pts, end: c.phase };
  }
}
