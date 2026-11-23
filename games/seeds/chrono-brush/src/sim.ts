/**
 * 実験：時空の絵筆（Chrono Brush）のシミュレーション（描画なし）。
 * 空から星が降ってくる。下では星座の籠が左右に揺れている。
 * 時間の流れを塗る：青＝遅い（×slow）、赤＝速い（×fast）、紫＝逆再生（来た道を戻る）。塗った円の中では、星の時間がその速さで進む。
 * 星は斜めに流れて降る。塗った時間は zoneLife 秒で消える。
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
export interface ChronoConfig { gravity: number; slow: number; fast: number; rewind: number; ink: number; stars: number; interval: number; basketSpeed: number; basketW: number; wind: number; zoneLife: number }

/** wind：星が横に流れる速さの幅（斜めに降る）。zoneLife：塗った時間が消えるまでの秒（0 で消えない） */
export const defaults: ChronoConfig = { gravity: 420, slow: 0.25, fast: 2.2, rewind: -0.6, ink: 14, stars: 12, interval: 1.1, basketSpeed: 0.55, basketW: 120, wind: 150, zoneLife: 7 };

export type ChronoEvent = { t: 'catch'; x: number; y: number; n: number } | { t: 'miss'; x: number; y: number } | { t: 'end' };

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

  constructor(public cfg: ChronoConfig, seed = 1) {
    this.rng = new Rng(seed);
    this.ink = cfg.ink;
  }

  get time(): number { return this.tick / HZ; }

  /** 籠の中心（左右にゆっくり揺れる） */
  basketX(): number {
    return VIEW_W / 2 + Math.sin(this.time * this.cfg.basketSpeed * 2) * (VIEW_W * 0.36);
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
      this.stars.push({ x: this.rng.range(120, VIEW_W - 120), y: -10, vx: this.rng.range(-this.cfg.wind, this.cfg.wind), vy: 0, alive: true, caught: false });
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
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.x < 10 || s.x > VIEW_W - 10) { s.vx = -s.vx; s.x = Math.min(VIEW_W - 10, Math.max(10, s.x)); }
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
