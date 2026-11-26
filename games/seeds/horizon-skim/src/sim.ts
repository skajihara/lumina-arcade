/**
 * 試作 EH-20 案③「地平すれすれ」のシミュレーション（描画なし・決定的）。
 *
 * 小さな船でブラックホールの周りを回る。操作は2つだけ：
 *   - 加速（↑・Space・左クリック長押し）：進行方向へ噴射 → 軌道が膨らむ（離脱）
 *   - 減速（↓・X）：進行方向と逆へ噴射 → 軌道が縮む（地平へ潜る）
 * 地平（半径 RS）に近いほど船の時計が遅れ、「時間の倍率」が上がる。かけらを拾うと 10 × 倍率 点。
 * 持ち時間は「船の時計」で数える — 地平すれすれを飛ぶほど、外の世界より時間が長持ちする。
 * 地平の内側に入ったら終わり。遠くへ飛び去りすぎても終わり。燃料は有限。
 */
import { Rng } from '@engine/rng';

export const HZ = 120;
export const DT = 1 / HZ;
export const W = 32;
export const H = 18;
export const CX = 16;
export const CY = 9;

export interface SkimConfig {
  /** 重力の強さ（GM） */
  gm: number;
  /** 地平の半径 */
  rs: number;
  /** 地平の近くで重力が強まる割合（落ちやすさ） */
  strong: number;
  /** 噴射の加速 */
  thrust: number;
  /** 燃料（秒ぶんの噴射） */
  fuel: number;
  /** 持ち時間（船の時計の秒） */
  time: number;
  /** 倍率の上限 */
  maxMult: number;
  /** かけらの数 */
  shards: number;
  /** これより遠くへ行くと漂流して終わり */
  driftR: number;
}

export const defaults: SkimConfig = {
  gm: 150, rs: 1.3, strong: 0.6, thrust: 1.8, fuel: 14, time: 60, maxMult: 9, shards: 14, driftR: 11,
};

export interface Shard { x: number; y: number; r: number; a: number; w: number; alive: boolean }

export type SkimEvent =
  | { t: 'pick'; x: number; y: number; mult: number; pts: number }
  | { t: 'skim'; mult: number }
  | { t: 'perihelion'; r: number; mult: number }
  | { t: 'end'; why: 'horizon' | 'drift' | 'time' };

export class SkimSim {
  cfg: SkimConfig;
  rng: Rng;
  x: number; y: number; vx: number; vy: number;
  tick = 0;
  /** 船の時計（秒） */
  shipTime = 0;
  fuel: number;
  score = 0;
  picks = 0;
  bestMult = 1;
  phase: 'play' | 'over' = 'play';
  endWhy: 'horizon' | 'drift' | 'time' | null = null;
  shards: Shard[] = [];
  events: SkimEvent[] = [];
  /** 入力：1 = 加速、-1 = 減速、0 = なし */
  input = 0;
  /** 今噴射しているか（描画用） */
  firing = 0;
  private wasSkim = false;
  private lastR: number;
  private falling = false;

  constructor(cfg: SkimConfig = defaults, seed = 7) {
    this.cfg = { ...cfg };
    this.rng = new Rng(seed);
    const r0 = 5.5;
    this.x = CX; this.y = CY - r0;
    const v = Math.sqrt(this.cfg.gm / r0);
    this.vx = v; this.vy = 0;
    this.fuel = this.cfg.fuel;
    this.lastR = r0;
    for (let i = 0; i < this.cfg.shards; i++) this.shards.push(this.newShard(i));
  }

  /** かけら：内側ほど少ない（危ない所ほど価値がある倍率） */
  private newShard(i: number): Shard {
    const ring = i % 4;
    const r = [1.85, 2.6, 4, 6.2][ring] + this.rng.range(-0.25, 0.35);
    const a = this.rng.range(0, Math.PI * 2);
    // かけらはゆっくり回る（軌道の速さの 0.35 倍、内側ほど速い）
    const w = 0.35 * Math.sqrt(this.cfg.gm / r ** 3) * (this.rng.next() < 0.5 ? 1 : -1);
    return { x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r, r, a, w, alive: true };
  }

  get r(): number {
    return Math.hypot(this.x - CX, this.y - CY);
  }

  /** 時間の遅れ（船の時計が外の何分の一で進むか、の逆数） */
  dilation(r = this.r): number {
    const k = Math.max(0.012, 1 - this.cfg.rs / Math.max(r, 1e-3));
    return Math.min(this.cfg.maxMult, 1 / Math.sqrt(k));
  }

  get mult(): number {
    return Math.round(this.dilation() * 10) / 10;
  }

  private accel(x: number, y: number): { ax: number; ay: number } {
    const dx = CX - x, dy = CY - y;
    const r = Math.max(0.3, Math.hypot(dx, dy));
    const a = (this.cfg.gm / (r * r)) * (1 + this.cfg.strong * (this.cfg.rs / r) ** 2);
    return { ax: (dx / r) * a, ay: (dy / r) * a };
  }

  step(): void {
    this.events = [];
    if (this.phase !== 'play') return;
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
    }
    // 重力：速度ベルレ（半歩ずつ）で軌道が崩れにくい
    const a1 = this.accel(this.x, this.y);
    this.vx += a1.ax * DT * 0.5; this.vy += a1.ay * DT * 0.5;
    this.x += this.vx * DT; this.y += this.vy * DT;
    const a2 = this.accel(this.x, this.y);
    this.vx += a2.ax * DT * 0.5; this.vy += a2.ay * DT * 0.5;

    const r = this.r;
    const dil = this.dilation(r);
    this.shipTime += DT / dil;
    this.bestMult = Math.max(this.bestMult, dil);
    // 近点（一番近づいた所）を知らせる
    if (r > this.lastR && this.falling) this.events.push({ t: 'perihelion', r: this.lastR, mult: this.dilation(this.lastR) });
    this.falling = r < this.lastR;
    this.lastR = r;
    // すれすれ（倍率 2.5 以上）に入った瞬間
    const skim = dil >= 2.5;
    if (skim && !this.wasSkim) this.events.push({ t: 'skim', mult: dil });
    this.wasSkim = skim;
    // かけら
    for (let i = 0; i < this.shards.length; i++) {
      const s = this.shards[i];
      s.a += s.w * DT;
      s.x = CX + Math.cos(s.a) * s.r;
      s.y = CY + Math.sin(s.a) * s.r;
      if (Math.hypot(s.x - this.x, s.y - this.y) < 0.55) {
        const m = Math.round(dil * 10) / 10;
        const pts = Math.round(10 * m);
        this.score += pts;
        this.picks++;
        this.events.push({ t: 'pick', x: s.x, y: s.y, mult: m, pts });
        this.shards[i] = this.newShard(i);
      }
    }
    if (r < this.cfg.rs) this.end('horizon');
    else if (r > this.cfg.driftR) this.end('drift');
    else if (this.shipTime >= this.cfg.time) this.end('time');
  }

  private end(why: 'horizon' | 'drift' | 'time'): void {
    this.phase = 'over';
    this.endWhy = why;
    this.events.push({ t: 'end', why });
  }

  /** 先の軌道（噴射なし）。描画の予測線用 */
  predict(n: number, every = 4): { x: number; y: number }[] {
    let x = this.x, y = this.y, vx = this.vx, vy = this.vy;
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const a1 = this.accel(x, y);
      vx += a1.ax * DT * 0.5; vy += a1.ay * DT * 0.5;
      x += vx * DT; y += vy * DT;
      const a2 = this.accel(x, y);
      vx += a2.ax * DT * 0.5; vy += a2.ay * DT * 0.5;
      if (i % every === 0) out.push({ x, y });
      if (Math.hypot(x - CX, y - CY) < this.cfg.rs) break;
    }
    return out;
  }

  digest(): number[] {
    return [this.tick, this.x, this.y, this.vx, this.vy, this.score, this.fuel];
  }
}
