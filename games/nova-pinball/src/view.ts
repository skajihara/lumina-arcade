/** Nova Pinball の描画。シミュレーションの状態とイベントを見て絵と音を出す */
import { Container, Graphics, Sprite } from 'pixi.js';
import { glowTexture, ringTexture, sparkleTexture, skyTexture, makeStarfield, hsl, lerpColor, type Starfield } from '@engine/gfx';
import { Particles } from '@engine/particles';
import { synth } from '@engine/audio';
import type { Juice } from '@engine/juice';
import { BALL_R, BOARD_H, BOARD_W, boardWalls, SLING_L, SLING_R, ROLLOVERS, ROLL_R, PIVOT_L, PIVOT_R, type NovaSim, type SimEvent } from './sim';
import type { NovaConfig } from './config';

export const SCALE = 40; // 1メートル = 40px
export const VIEW_W = BOARD_W * SCALE;
export const VIEW_H = BOARD_H * SCALE;

const CHARGE_COLORS = [0x9fb8ff, 0x7ff0ff, 0xffd27f, 0xffa3e0, 0xffffff, 0xffffff, 0xffffff];

/** 連鎖の段階ごとの色（青→金→桃→虹） */
export function chainTier(chain: number): number {
  return chain >= 10 ? 3 : chain >= 6 ? 2 : chain >= 3 ? 1 : 0;
}
const TIER_COLORS: number[][] = [
  [],
  [0xffd27f, 0xffe7a8, 0xfff3d6],
  [0xffa3e0, 0xff7fd0, 0xffe1f5, 0xc9a3ff],
  [0x7ff0ff, 0xffd27f, 0xffa3e0, 0xa3ffb0, 0xffffff, 0xc9a3ff],
];
const TRAIL_MAX = 24;

interface StarView {
  c: Container;
  glow: Sprite;
  core: Graphics;
  pips: Graphics;
  lastCharge: number;
  pulse: number;
  x: number;
  y: number;
}

interface Shock {
  sp: Sprite;
  t: number;
  dur: number;
  size: number;
}

export class NovaView {
  readonly container = new Container();
  private sky: Sprite;
  private field: Starfield;
  private board = new Graphics();
  private links = new Graphics();
  private bumperG = new Graphics();
  private starLayer = new Container();
  private stars: StarView[] = [];
  private flippers: Graphics[] = [];
  private ballLayer = new Container();
  private ballSprites = new Map<number, { glow: Sprite; core: Graphics; trail: Sprite[] }>();
  private fxLayer = new Container();
  private shocks: Shock[] = [];
  private launchMeter = new Graphics();
  particles = new Particles(3000);
  private t = 0;
  private hue: number;
  private palette: number[];
  private linksDirty = true;
  private bumperFlash: number[] = [];
  private gimmicks = new Graphics();
  private slingFlash = { L: 0, R: 0 };
  private rollFlash = [0, 0, 0];
  /** 夜空に浮かぶ星座の線画（超新星で現れる） */
  private skyArt = new Graphics();
  private skyArtT = -1;
  /** カメラ：ズーム倍率と注視点（論理座標） */
  private cam = { zoom: 1, x: VIEW_W / 2, y: VIEW_H / 2, t: -1, peak: 1, hold: 0, dur: 0 };

  constructor(private sim: NovaSim, private juice: Juice, private cfg: NovaConfig, private hud: { chain(n: number): void; toast(msg: string): void }) {
    this.hue = sim.stage.hue ?? 0.62;
    this.palette = [hsl(this.hue, 0.9, 0.7), hsl(this.hue + 0.08, 0.95, 0.75), hsl(this.hue - 0.1, 0.9, 0.8), 0xffffff, 0xffe1a8];
    this.sky = new Sprite(skyTexture(VIEW_W, VIEW_H, '#' + hsl(this.hue, 0.6, 0.08).toString(16).padStart(6, '0'), '#02030a'));
    this.sky.width = VIEW_W;
    this.sky.height = VIEW_H;
    this.field = makeStarfield(VIEW_W, VIEW_H, 180, 11 + sim.stage.id.length);
    this.container.addChild(this.sky, this.field.container, this.skyArt, this.board, this.gimmicks, this.links, this.bumperG, this.starLayer);
    this.drawBoard();
    this.buildStars();
    for (const f of sim.flippers) {
      const g = new Graphics();
      const s = f.side === 'L' ? 1 : -1;
      const L = f.length * SCALE;
      const pts = [0, -0.26 * SCALE, s * L, -0.11 * SCALE, s * L, 0.11 * SCALE, 0, 0.26 * SCALE];
      g.poly(pts).fill({ color: 0x1a2250 }).stroke({ width: 2, color: 0xbfd0ff, alpha: 0.9 });
      g.circle(0, 0, 0.26 * SCALE).fill({ color: 0x2a3474 }).stroke({ width: 2, color: 0xbfd0ff });
      g.circle(s * L, 0, 0.11 * SCALE).fill({ color: 0xbfd0ff });
      this.flippers.push(g);
      this.container.addChild(g);
    }
    this.container.addChild(this.ballLayer, this.particles.container, this.fxLayer, this.launchMeter);
    this.particles.multiplier = cfg.particles;
  }

  private drawBoard(): void {
    const g = this.board;
    g.clear();
    const walls = boardWalls(this.sim.stage);
    const col = hsl(this.hue, 0.7, 0.72);
    for (const [w, a] of [[10, 0.08], [5, 0.18], [2, 0.9]] as const) {
      for (const line of walls) {
        g.moveTo(line[0].x * SCALE, line[0].y * SCALE);
        for (const p of line.slice(1)) g.lineTo(p.x * SCALE, p.y * SCALE);
        g.stroke({ width: w, color: col, alpha: a, cap: 'round', join: 'round' });
      }
    }
    // 発射レーンの目印
    for (let y = 21; y < 24; y += 0.7) g.circle(13.8 * SCALE, y * SCALE, 2).fill({ color: col, alpha: 0.4 });
  }

  private buildStars(): void {
    for (const s of this.sim.stars) {
      const c = new Container();
      const glow = new Sprite(glowTexture());
      glow.anchor.set(0.5);
      glow.blendMode = 'add';
      const core = new Graphics();
      const pips = new Graphics();
      c.addChild(glow, core, pips);
      this.starLayer.addChild(c);
      const p = s.body.getPosition();
      const sv: StarView = { c, glow, core, pips, lastCharge: -1, pulse: 0, x: p.x * SCALE, y: p.y * SCALE };
      this.stars.push(sv);
      this.drawStarCore(sv, s.r, s.loose, 0);
    }
  }

  private drawStarCore(sv: StarView, r: number, loose: boolean, charge: number): void {
    const R = r * SCALE;
    const g = sv.core;
    g.clear();
    const pts: number[] = [];
    const n = 5;
    for (let i = 0; i < n * 2; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / n;
      const rr = i % 2 === 0 ? R * 0.95 : R * 0.42;
      pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    const col = CHARGE_COLORS[Math.min(charge, CHARGE_COLORS.length - 1)];
    if (loose) g.poly(pts).stroke({ width: 2.5, color: col }).fill({ color: col, alpha: 0.25 });
    else g.poly(pts).fill({ color: lerpColor(col, 0xffffff, 0.35) });
    g.circle(0, 0, R * 0.22).fill({ color: 0xffffff });
  }

  private drawPips(sv: StarView, r: number, charge: number, max: number, decayFrac: number): void {
    const g = sv.pips;
    g.clear();
    const R = r * SCALE + 7;
    for (let i = 0; i < max; i++) {
      const a = -Math.PI / 2 + ((i - (max - 1) / 2) * 0.42);
      const on = i < charge;
      g.circle(Math.cos(a) * R, Math.sin(a) * R, on ? 3.2 : 2.2).fill({ color: on ? CHARGE_COLORS[Math.min(charge, 4)] : 0x48508a, alpha: on ? 1 : 0.7 });
    }
    if (charge > 0 && decayFrac > 0) {
      g.arc(0, 0, r * SCALE + 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - decayFrac)).stroke({ width: 1.5, color: 0xffffff, alpha: 0.35 });
    }
  }

  handle(e: SimEvent): void {
    switch (e.t) {
      case 'hit': {
        const sv = this.stars[e.star];
        sv.pulse = 1;
        this.particles.emit(e.x * SCALE, e.y * SCALE, { count: 10, speed: [60, 220], life: [0.2, 0.5], size: [0.05, 0.14], color: CHARGE_COLORS[Math.min(e.charge, 4)] });
        synth.bell(e.charge * 2 + 2, 0.08);
        break;
      }
      case 'bump':
        synth.tone(220, 0.15, { type: 'triangle', vol: 0.12, slideTo: 330 });
        this.particles.emit(e.x * SCALE, e.y * SCALE, { count: 8, speed: [80, 200], life: [0.2, 0.4], size: [0.05, 0.12], color: 0xbfc8e8 });
        break;
      case 'explode':
        this.explodeFx(e);
        break;
      case 'link':
        this.linksDirty = true;
        synth.chord(e.a % 5 + 5, [0, 4], 0.05, 0.07);
        break;
      case 'supernova':
        this.juice.doFlash(0.9, 0xffe7a8);
        this.juice.slowmo(0.25, 1.4);
        synth.chord(5, [0, 2, 4, 5, 7, 9], 0.07, 0.12);
        this.hud.toast('SUPERNOVA！ 星座完成 ＋1ボール');
        this.skyArtT = 0;
        this.particles.emit(VIEW_W / 2, VIEW_H * 0.35, { count: 260, speed: [100, 900], life: [0.8, 2.2], size: [0.08, 0.4], color: [0xffe7a8, 0xffffff, ...this.palette], drag: 1.2 });
        break;
      case 'sling': {
        this.slingFlash[e.side] = 1;
        synth.tone(e.side === 'L' ? 523 : 587, 0.12, { type: 'square', vol: 0.06, slideTo: 880 });
        this.particles.emit(e.x * SCALE, e.y * SCALE, { count: 12, speed: [80, 260], life: [0.2, 0.45], size: [0.05, 0.12], color: this.palette[1] });
        this.juice.shake(0.06 * this.cfg.shake);
        break;
      }
      case 'roll': {
        this.rollFlash[e.id] = 1;
        const r = ROLLOVERS[e.id];
        synth.bell(7 + e.id, 0.1);
        this.particles.emit(r.x * SCALE, r.y * SCALE, { count: 14, speed: [40, 160], life: [0.3, 0.6], size: [0.05, 0.12], color: 0xffe1a8 });
        if (e.all) {
          this.rollFlash = [1, 1, 1];
          synth.chord(7, [0, 4, 7], 0.06, 0.1);
          this.hud.toast('三つ星そろい！ ボールセーブ点灯');
        }
        break;
      }
      case 'kickback':
        synth.whoosh(1.4);
        this.juice.shake(0.12 * this.cfg.shake);
        this.particles.emit(e.x * SCALE, e.y * SCALE, { count: 24, speed: [80, 300], life: [0.3, 0.7], size: [0.05, 0.14], color: 0x7ff0ff });
        this.hud.toast('キックバック！');
        break;
      case 'flip':
        synth.click(e.side === 'L' ? 1 : 1.12);
        break;
      case 'launch':
        synth.whoosh(0.5 + e.power);
        break;
      case 'drain':
        if (e.saved) this.hud.toast('ボールセーブ！');
        else synth.tone(220, 0.8, { type: 'sine', vol: 0.15, slideTo: 70 });
        break;
      case 'decay': {
        const sv = this.stars[e.star];
        sv.pulse = -0.5;
        break;
      }
      case 'fizzle':
        this.particles.emit(e.x * SCALE, e.y * SCALE, { count: 20, color: 0x8888aa, life: [0.3, 0.6] });
        break;
      case 'chainEnd':
        this.hud.chain(0);
        break;
      default:
        break;
    }
  }

  private explodeFx(e: Extract<SimEvent, { t: 'explode' }>): void {
    const x = e.x * SCALE, y = e.y * SCALE;
    const sv = this.stars[e.star];
    sv.c.visible = false;
    const chain = e.chain;
    const tier = chainTier(chain);
    const cols = tier === 0 ? this.palette : TIER_COLORS[tier];
    const big = Math.min(1, 0.25 + chain * 0.07);
    const grow = 1 + tier * 0.25;
    this.particles.emit(x, y, { count: Math.round((36 + chain * 5) * grow), speed: [80, (420 + chain * 25) * grow], life: [0.5, 1.4 + tier * 0.2], size: [0.06, 0.32 + tier * 0.06], color: cols, drag: 1.8 });
    this.particles.emit(x, y, { count: 6 + tier * 3, speed: [10, 60 + tier * 30], life: [0.6, 1.0 + tier * 0.2], size: [0.6, 1.2 + tier * 0.4], color: cols[0], alpha: 0.5, grow: 1.5, texture: glowTexture() });
    this.particles.emit(x, y, { count: 3 + tier * 2, speed: [0, 20 + tier * 40], life: [0.3, 0.6], size: [0.5, 0.9 + tier * 0.2], color: 0xffffff, texture: sparkleTexture() });
    // 衝撃波：段階が上がるほど輪が増え、大きくなる
    for (let k = 0; k <= Math.min(2, tier); k++) {
      const ring = new Sprite(ringTexture());
      ring.anchor.set(0.5);
      ring.blendMode = 'add';
      ring.tint = cols[(k + 1) % cols.length];
      ring.x = x; ring.y = y;
      this.fxLayer.addChild(ring);
      this.shocks.push({ sp: ring, t: -k * 0.07, dur: 0.5 + tier * 0.08, size: ((e.r * SCALE * 2.2) / 256) * (1 + tier * 0.18 + k * 0.25) });
    }
    this.juice.shake((0.12 + 0.035 * chain) * this.cfg.shake);
    if (chain >= 3) this.juice.hitstop(0.015 + Math.min(0.04, chain * 0.004));
    if (chain >= this.cfg.slowmoAt) this.juice.slowmo(0.38, 0.6);
    // 段階が上がった瞬間は少し強く
    if (tier > 0 && chainTier(chain - 1) < tier) {
      this.juice.doFlash(0.3 + tier * 0.1, cols[0]);
      this.zoomTo(x, y, 1.04 + tier * 0.03, 0.05, 0.5);
    }
    synth.boom(big, chain - 1);
    if (chain >= 2) this.hud.chain(chain);
    if (e.last) {
      this.juice.doFlash(1, 0xffffff);
      this.juice.slowmo(0.15, 1.8);
      this.zoomTo(x, y, 1.45, 0.9, 1.6);
      synth.chord(chain, [0, 2, 4, 7, 9], 0.09, 0.12);
      this.particles.emit(x, y, { count: 400, speed: [200, 1400], life: [1, 2.6], size: [0.08, 0.45], color: [0xffffff, ...cols, ...this.palette], drag: 1 });
    } else this.juice.doFlash(Math.min(0.35, 0.06 + chain * 0.025), cols[Math.min(2, cols.length - 1)]);
    this.linksDirty = true;
  }

  /** カメラを (x,y) に寄せる。peak 倍まで素早く寄り、hold 秒保ってから dur 秒で戻る */
  private zoomTo(x: number, y: number, peak: number, hold: number, dur: number): void {
    if (this.cam.t >= 0 && this.cam.peak > peak) return;
    this.cam = { ...this.cam, x, y, peak, hold, dur, t: 0 };
  }

  private updateCamera(dt: number): void {
    const c = this.cam;
    if (c.t < 0) {
      c.zoom = 1;
    } else {
      c.t += dt;
      const inT = 0.18;
      if (c.t < inT) c.zoom = 1 + (c.peak - 1) * (1 - Math.pow(1 - c.t / inT, 3));
      else if (c.t < inT + c.hold) c.zoom = c.peak;
      else {
        const k = Math.min(1, (c.t - inT - c.hold) / c.dur);
        c.zoom = c.peak + (1 - c.peak) * (k * k * (3 - 2 * k));
        if (k >= 1) c.t = -1;
      }
    }
    // 注視点を中心にズーム（画面の外が見えないよう、寄せる量を制限）
    const z = c.zoom;
    const fx = Math.min(VIEW_W * 0.75, Math.max(VIEW_W * 0.25, c.x));
    const fy = Math.min(VIEW_H * 0.75, Math.max(VIEW_H * 0.25, c.y));
    this.container.scale.set(z);
    this.container.x = fx * (1 - z);
    this.container.y = fy * (1 - z);
  }

  /** 超新星：星座の線画を夜空に大きく描く */
  private drawSkyArt(): void {
    const g = this.skyArt;
    g.clear();
    if (this.skyArtT < 0) return;
    const st = this.sim.stage;
    const xs = st.stars.map((p) => p.x), ys = st.stars.map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const k = 1.55;
    const P = (i: number) => ({ x: (VIEW_W / 2 + (st.stars[i].x - cx) * k * SCALE), y: (VIEW_H * 0.42 + (st.stars[i].y - cy) * k * SCALE) });
    const tIn = Math.min(1, this.skyArtT / 1.6);
    const breathe = 0.85 + 0.15 * Math.sin(this.t * 1.3);
    const a = (tIn < 1 ? tIn * 0.9 : 0.25 + 0.65 * Math.max(0, 1 - (this.skyArtT - 1.6) / 2.5)) * breathe;
    st.links.forEach(([i, j], n) => {
      // 線が順に引かれていく
      const show = Math.min(1, Math.max(0, tIn * st.links.length - n * 0.6));
      if (show <= 0) return;
      const A = P(i), B = P(j);
      const ex = A.x + (B.x - A.x) * show, ey = A.y + (B.y - A.y) * show;
      g.moveTo(A.x, A.y).lineTo(ex, ey).stroke({ width: 14, color: 0xffe1a8, alpha: a * 0.12, cap: 'round' });
      g.moveTo(A.x, A.y).lineTo(ex, ey).stroke({ width: 2, color: 0xfff3d6, alpha: a * 0.8, cap: 'round' });
    });
    st.stars.forEach((_, i) => {
      const p = P(i);
      g.circle(p.x, p.y, 10).fill({ color: 0xffe1a8, alpha: a * 0.15 });
      g.circle(p.x, p.y, 3).fill({ color: 0xffffff, alpha: a });
    });
  }

  private drawLinks(): void {
    const g = this.links;
    g.clear();
    const pulse = 0.75 + 0.25 * Math.sin(this.t * 3);
    this.sim.stage.links.forEach(([a, b], i) => {
      const A = this.stars[a], B = this.stars[b];
      const lit = this.sim.litLinks.has(i);
      if (lit) {
        g.moveTo(A.x, A.y).lineTo(B.x, B.y).stroke({ width: 9, color: 0xffe1a8, alpha: 0.18 * pulse });
        g.moveTo(A.x, A.y).lineTo(B.x, B.y).stroke({ width: 2.5, color: 0xfff3d6, alpha: 0.95 });
      } else {
        // 点線
        const dx = B.x - A.x, dy = B.y - A.y;
        const len = Math.hypot(dx, dy);
        const n = Math.max(2, Math.floor(len / 12));
        for (let k = 0; k < n; k += 2) {
          const t0 = k / n, t1 = Math.min(1, (k + 1) / n);
          g.moveTo(A.x + dx * t0, A.y + dy * t0).lineTo(A.x + dx * t1, A.y + dy * t1);
        }
        g.stroke({ width: 1.2, color: 0x9fb8ff, alpha: 0.28 });
      }
    });
  }

  update(realDt: number): void {
    this.t += realDt;
    this.field.update(this.t);
    this.particles.multiplier = this.cfg.particles;
    const sim = this.sim;
    const max = Math.round(this.cfg.maxCharge);

    // 星
    sim.stars.forEach((s, i) => {
      const sv = this.stars[i];
      if (!s.alive) return;
      const p = s.body.getPosition();
      sv.x = p.x * SCALE; sv.y = p.y * SCALE;
      sv.c.x = sv.x; sv.c.y = sv.y;
      const ch = s.pendingAt >= 0 ? max : s.charge;
      if (ch !== sv.lastCharge) {
        this.drawStarCore(sv, s.r, s.loose, ch);
        sv.lastCharge = ch;
      }
      this.drawPips(sv, s.r, ch, max, s.charge > 0 ? s.decay / this.cfg.decayTime : 0);
      sv.pulse += (0 - sv.pulse) * Math.min(1, realDt * 8);
      const hot = s.pendingAt >= 0 ? 0.3 * Math.sin(this.t * 60) : 0;
      const base = (s.r * SCALE * 4.2) / 128;
      sv.glow.scale.set(base * (1 + ch * 0.32 + sv.pulse * 0.5 + hot));
      sv.glow.tint = CHARGE_COLORS[Math.min(ch, 4)];
      sv.glow.alpha = 0.55 + ch * 0.12;
      sv.core.rotation += realDt * (0.2 + ch * 0.6);
      sv.core.scale.set(1 + sv.pulse * 0.25);
    });
    if (sim.stars.some((s) => s.loose && s.alive)) this.linksDirty = true;
    if (this.linksDirty || sim.litLinks.size > 0) {
      this.drawLinks();
      this.linksDirty = false;
    }

    // 惑星（バンパー）
    const bg = this.bumperG;
    bg.clear();
    sim.bumpers.forEach((b, i) => {
      this.bumperFlash[i] = Math.max(0, (this.bumperFlash[i] ?? 0) - realDt * 3);
      const R = b.r * SCALE;
      bg.circle(b.x * SCALE, b.y * SCALE, R + 6).fill({ color: 0xbfc8e8, alpha: 0.08 });
      bg.circle(b.x * SCALE, b.y * SCALE, R).fill({ color: 0x3a3f5c }).stroke({ width: 2, color: 0xbfc8e8, alpha: 0.8 });
      bg.ellipse(b.x * SCALE, b.y * SCALE, R * 1.6, R * 0.35).stroke({ width: 1.5, color: 0xbfc8e8, alpha: 0.5 });
    });

    this.drawGimmicks(realDt);
    if (this.skyArtT >= 0) {
      this.skyArtT += realDt;
      this.drawSkyArt();
    }
    this.updateCamera(realDt);

    // フリッパー
    sim.flippers.forEach((f, i) => {
      const g = this.flippers[i];
      const p = f.body.getPosition();
      g.x = p.x * SCALE; g.y = p.y * SCALE;
      g.rotation = f.body.getAngle();
    });

    // ボール
    const seen = new Set<number>();
    for (const b of sim.balls) {
      seen.add(b.id);
      let v = this.ballSprites.get(b.id);
      if (!v) {
        const glow = new Sprite(glowTexture());
        glow.anchor.set(0.5);
        glow.blendMode = 'add';
        glow.tint = 0xcfe6ff;
        glow.scale.set((BALL_R * SCALE * 5) / 128);
        const core = new Graphics().circle(0, 0, BALL_R * SCALE).fill({ color: 0xffffff });
        const trail: Sprite[] = [];
        for (let k = 0; k < TRAIL_MAX; k++) {
          const t = new Sprite(glowTexture());
          t.anchor.set(0.5);
          t.blendMode = 'add';
          t.tint = 0x9fd0ff;
          trail.push(t);
          this.ballLayer.addChild(t);
        }
        this.ballLayer.addChild(glow, core);
        v = { glow, core, trail };
        this.ballSprites.set(b.id, v);
      }
      const p = b.body.getPosition();
      const x = p.x * SCALE, y = p.y * SCALE;
      b.trail.unshift({ x, y });
      if (b.trail.length > TRAIL_MAX) b.trail.pop();
      v.glow.x = v.core.x = x;
      v.glow.y = v.core.y = y;
      // 速いほど軌跡が長く、明るく、青白くなる
      const bv = b.body.getLinearVelocity();
      const sp = Math.min(1, Math.hypot(bv.x, bv.y) / 32);
      const len = Math.round(6 + sp * (TRAIL_MAX - 6));
      const tcol = lerpColor(0x7fa8ff, 0xe8fbff, sp);
      v.glow.scale.set(((BALL_R * SCALE * 5) / 128) * (1 + sp * 0.35));
      v.trail.forEach((t, k) => {
        const tp = b.trail[k] ?? { x, y };
        t.x = tp.x; t.y = tp.y;
        t.visible = k < len;
        t.tint = tcol;
        t.alpha = (0.25 + 0.25 * sp) * (1 - k / len);
        t.scale.set(((BALL_R * SCALE * 2.6) / 128) * (1 - k / (len * 1.3)));
      });
    }
    for (const [id, v] of this.ballSprites) {
      if (seen.has(id)) continue;
      v.glow.destroy(); v.core.destroy(); v.trail.forEach((t) => t.destroy());
      this.ballSprites.delete(id);
    }

    // 衝撃波
    for (let i = this.shocks.length - 1; i >= 0; i--) {
      const s = this.shocks[i];
      s.t += realDt;
      const k = s.t / s.dur;
      if (k >= 1) {
        s.sp.destroy();
        this.shocks.splice(i, 1);
        continue;
      }
      const e = 1 - Math.pow(1 - k, 3);
      s.sp.scale.set(s.size * (0.2 + 0.8 * e));
      s.sp.alpha = 1 - k;
    }

    // 発射メーター
    const lm = this.launchMeter;
    lm.clear();
    const lane = sim.balls.some((b) => sim.inLane(b));
    if (lane) {
      const h = 3.2 * SCALE * sim.launchCharge;
      lm.rect(14.55 * SCALE - 4, 24.2 * SCALE - h, 5, h).fill({ color: lerpColor(0x7ff0ff, 0xffa3e0, sim.launchCharge) });
      lm.rect(14.55 * SCALE - 4, 21.0 * SCALE, 5, 3.2 * SCALE).stroke({ width: 1, color: 0x9fb8ff, alpha: 0.4 });
      if (sim.launchCharge === 0) {
        const a = 0.4 + 0.4 * Math.sin(this.t * 4);
        lm.circle(13.8 * SCALE, 20.6 * SCALE, 4).fill({ color: 0xffffff, alpha: a });
      }
    }

    this.particles.update(realDt);
    // 背景の星をかすかに漂わせる
    this.field.container.y = Math.sin(this.t * 0.1) * 4;
  }

  /** スリングショット・ロールオーバー・ボールセーブの灯り */
  private drawGimmicks(dt: number): void {
    const g = this.gimmicks;
    const sim = this.sim;
    g.clear();
    const col = hsl(this.hue, 0.7, 0.72);
    if (sim.stage.slings) {
      for (const [side, tri] of [['L', SLING_L], ['R', SLING_R]] as const) {
        const f = (this.slingFlash[side] = Math.max(0, this.slingFlash[side] - dt * 4));
        const pts = tri.flatMap((p) => [p.x * SCALE, p.y * SCALE]);
        g.poly(pts).fill({ color: lerpColor(0x141a40, col, 0.15 + f * 0.6), alpha: 0.9 }).stroke({ width: 2, color: col, alpha: 0.85 });
        const [A, , C] = tri;
        g.moveTo(A.x * SCALE, A.y * SCALE).lineTo(C.x * SCALE, C.y * SCALE).stroke({ width: 4 + f * 8, color: 0xffffff, alpha: 0.35 + f * 0.6, cap: 'round' });
      }
    }
    if (sim.stage.rollovers) {
      ROLLOVERS.forEach((r, i) => {
        const f = (this.rollFlash[i] = Math.max(0, this.rollFlash[i] - dt * 1.5));
        const lit = sim.rollLit[i];
        const x = r.x * SCALE, y = r.y * SCALE;
        const R = ROLL_R * SCALE;
        g.circle(x, y, R + 6 + f * 10).fill({ color: 0xffe1a8, alpha: (lit ? 0.18 : 0.04) + f * 0.3 });
        g.circle(x, y, R).stroke({ width: 1.5, color: lit ? 0xffe1a8 : col, alpha: lit ? 0.95 : 0.4 });
        // 小さな星形
        const pts: number[] = [];
        for (let k = 0; k < 8; k++) {
          const a = -Math.PI / 2 + (k * Math.PI) / 4;
          const rr = k % 2 === 0 ? R * 0.55 : R * 0.2;
          pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        g.poly(pts).fill({ color: lit ? 0xfff3d6 : 0x48508a, alpha: lit ? 1 : 0.7 });
      });
    }
    // キックバックの灯り（アウトレーンの上向き矢印）
    if (sim.stage.outlanes) {
      for (const [side, x] of [['L', 0.95], ['R', 12.85]] as const) {
        const on = sim.kickback[side];
        const a = on ? 0.6 + 0.3 * Math.sin(this.t * 5) : 0.18;
        for (let k = 0; k < 3; k++) {
          const y = (22.6 - k * 0.45) * SCALE;
          g.moveTo(x * SCALE - 6, y + 4).lineTo(x * SCALE, y - 3).lineTo(x * SCALE + 6, y + 4)
            .stroke({ width: 2, color: on ? 0x7ff0ff : col, alpha: a * (1 - k * 0.2), cap: 'round', join: 'round' });
        }
      }
    }
    // ボールセーブの灯り（フリッパーの間）
    const cx = ((PIVOT_L.x + PIVOT_R.x) / 2) * SCALE, cy = (PIVOT_L.y + 1.4) * SCALE;
    if (sim.saveActive()) {
      const a = 0.55 + 0.35 * Math.sin(this.t * 8);
      g.circle(cx, cy, 14).fill({ color: 0x7ff0ff, alpha: a * 0.25 });
      g.circle(cx, cy, 5).fill({ color: 0xcffaff, alpha: a });
    } else g.circle(cx, cy, 4).stroke({ width: 1, color: col, alpha: 0.3 });
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
