/**
 * 試作 EH-20 案②「重力の置き石」のシミュレーション（描画なし・決定的）。
 * 小さなブラックホール（置き石）を決まった数だけ置いてから「放つ」。上の注ぎ口から星の粒が流れ出し、
 * 一様な重力と置き石の引力で曲がって、下の星座の器へ入れば溜まる。事象の地平に触れた粒は吸い込まれて消える。
 * 暗黒星雲の柱に触れた粒も消える。器が目標まで満ちればクリア。
 */
import { Rng } from '@engine/rng';

export const HZ = 120;
export const DT = 1 / HZ;
export const W = 32;
export const H = 18;

export interface Pt { x: number; y: number }
export interface Hole { x: number; y: number }
export interface Grain { x: number; y: number; vx: number; vy: number; alive: boolean; caught: boolean; trail: Pt[] }
export interface Rect { x0: number; y0: number; x1: number; y1: number }

export interface StonesConfig {
  /** 一様な重力（下向き m/s²） */
  gravity: number;
  /** 置き石の引力（G・m） */
  pull: number;
  /** 引力のやわらげ（近くで無限大にならない） */
  soft: number;
  /** 事象の地平の半径 */
  horizon: number;
  /** 置ける数 */
  holes: number;
  /** 粒の数・1秒あたりに出る数・出る速さ */
  grains: number;
  rate: number;
  speed: number;
  /** 器を満たすのに要る粒 */
  need: number;
  /** 放っている間も置き石を動かせる（1）か */
  moveWhileFlow: number;
}

export const defaults: StonesConfig = {
  gravity: 3.2, pull: 16, soft: 0.6, horizon: 0.42, holes: 3,
  grains: 140, rate: 34, speed: 6.2, need: 70, moveWhileFlow: 0,
};

/** 1面：左上の注ぎ口から右へ。真ん中に暗黒星雲の柱、その向こうの低い所に器 */
export const stage = {
  spout: { x: 1.6, y: 3.2 },
  cup: { x: 27.2, y: 15.6, w: 3.6, h: 1.6 },
  pillars: [{ x0: 19.4, y0: 7.6, x1: 20.6, y1: 18.5 }] as Rect[],
};

export type StonesEvent =
  | { t: 'release' }
  | { t: 'eaten'; x: number; y: number; hole: number }
  | { t: 'caught'; x: number; y: number; n: number }
  | { t: 'dust'; x: number; y: number }
  | { t: 'clear' }
  | { t: 'done'; caught: number };

export class StonesSim {
  cfg: StonesConfig;
  holes: Hole[] = [];
  grains: Grain[] = [];
  phase: 'place' | 'flow' | 'clear' | 'done' = 'place';
  tick = 0;
  emitted = 0;
  caught = 0;
  eaten = 0;
  events: StonesEvent[] = [];
  private rng = new Rng(7);

  constructor(cfg: Partial<StonesConfig> = {}, holes: Hole[] = []) {
    this.cfg = { ...defaults, ...cfg };
    this.holes = holes.map((h) => ({ ...h }));
  }

  get canMove(): boolean {
    return this.phase === 'place' || (this.phase === 'flow' && this.cfg.moveWhileFlow > 0);
  }

  place(x: number, y: number): boolean {
    if (this.phase !== 'place' || this.holes.length >= this.cfg.holes) return false;
    if (Math.hypot(x - stage.spout.x, y - stage.spout.y) < 1.2) return false;
    this.holes.push({ x, y });
    return true;
  }

  release(): boolean {
    if (this.phase !== 'place') return false;
    this.phase = 'flow';
    this.events.push({ t: 'release' });
    return true;
  }

  /** 1粒の加速度 */
  accel(x: number, y: number): Pt {
    let ax = 0, ay = this.cfg.gravity;
    for (const h of this.holes) {
      const dx = h.x - x, dy = h.y - y;
      const r2 = dx * dx + dy * dy;
      const r = Math.sqrt(r2);
      const a = this.cfg.pull / (r2 + this.cfg.soft * this.cfg.soft);
      ax += (dx / r) * a;
      ay += (dy / r) * a;
    }
    return { x: ax, y: ay };
  }

  /** 1粒を1ティック進める。消えたら理由を返す */
  move(g: Grain): 'eaten' | 'caught' | 'dust' | 'out' | null {
    const a = this.accel(g.x, g.y);
    g.vx += a.x * DT; g.vy += a.y * DT;
    // 速すぎる粒は抑える（引力のすぐ近くで暴れない）
    const sp = Math.hypot(g.vx, g.vy);
    if (sp > 24) { g.vx *= 24 / sp; g.vy *= 24 / sp; }
    const px = g.x, py = g.y;
    g.x += g.vx * DT; g.y += g.vy * DT;
    for (const h of this.holes) if (Math.hypot(g.x - h.x, g.y - h.y) < this.cfg.horizon) return 'eaten';
    for (const p of stage.pillars) if (g.x > p.x0 && g.x < p.x1 && g.y > p.y0 && g.y < p.y1) return 'dust';
    // 器：縁（左右の壁）で跳ね、上から内側に入れば溜まる
    const c = stage.cup;
    const l = c.x - c.w / 2, r = c.x + c.w / 2, top = c.y - c.h;
    if (g.y > top && g.y < c.y + 0.3) {
      for (const wx of [l, r]) {
        if ((px - wx) * (g.x - wx) < 0) {
          if (py < top + 0.05) break; // 縁の上から入った
          g.x = px; g.vx *= -0.35; g.vy *= 0.7;
        }
      }
      if (g.x > l && g.x < r && py <= top + 0.02 && g.y > top) return 'caught';
    }
    if (g.y > c.y && g.y < c.y + 0.25 && g.x > l && g.x < r) { g.vy = -Math.abs(g.vy) * 0.2; g.y = c.y; }
    if (g.y > H + 1 || g.x < -2 || g.x > W + 2 || g.y < -6) return 'out';
    return null;
  }

  step(): void {
    this.events = [];
    if (this.phase !== 'flow') return;
    this.tick++;
    const c = this.cfg;
    const want = Math.min(c.grains, Math.floor((this.tick * c.rate) / HZ));
    while (this.emitted < want) {
      const j = this.rng.range(-0.25, 0.25);
      this.grains.push({ x: stage.spout.x, y: stage.spout.y + this.rng.range(-0.08, 0.08), vx: c.speed * (1 + j * 0.08), vy: j, alive: true, caught: false, trail: [] });
      this.emitted++;
    }
    for (const g of this.grains) {
      if (!g.alive) continue;
      const r = this.move(g);
      if (this.tick % 3 === 0) { g.trail.push({ x: g.x, y: g.y }); if (g.trail.length > 8) g.trail.shift(); }
      if (!r) continue;
      g.alive = false;
      if (r === 'eaten') {
        this.eaten++;
        let hi = 0, best = 1e9;
        this.holes.forEach((h, i) => { const d = Math.hypot(h.x - g.x, h.y - g.y); if (d < best) { best = d; hi = i; } });
        this.events.push({ t: 'eaten', x: g.x, y: g.y, hole: hi });
      } else if (r === 'caught') {
        g.caught = true;
        this.caught++;
        this.events.push({ t: 'caught', x: g.x, y: g.y, n: this.caught });
        if (this.caught === c.need) { this.phase = 'clear'; this.events.push({ t: 'clear' }); }
      } else if (r === 'dust') this.events.push({ t: 'dust', x: g.x, y: g.y });
    }
    if (this.phase === 'flow' && this.emitted >= c.grains && this.grains.every((g) => !g.alive)) {
      this.phase = 'done';
      this.events.push({ t: 'done', caught: this.caught });
    }
  }

  /** 予測線：真ん中の1粒が放たれたらどう飛ぶか（sec 秒ぶん） */
  predict(sec: number): Pt[] {
    const g: Grain = { x: stage.spout.x, y: stage.spout.y, vx: this.cfg.speed, vy: 0, alive: true, caught: false, trail: [] };
    const out: Pt[] = [];
    for (let i = 0; i < sec * HZ; i++) {
      const r = this.move(g);
      if (i % 4 === 0) out.push({ x: g.x, y: g.y });
      if (r) { out.push({ x: g.x, y: g.y }); break; }
    }
    return out;
  }

  /** 流れを戻す（置き石はそのまま） */
  retry(): StonesSim {
    return new StonesSim(this.cfg, this.holes);
  }
}
