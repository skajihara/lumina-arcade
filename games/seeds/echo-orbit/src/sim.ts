/**
 * 試作 EL-20 案②「軌道のループ（トーラス）」のシミュレーション（描画なし）。
 * - 盤面の左右の端は輪になっていて、球が左から出ると右から戻る（1周＝周回 +1）
 * - 周回するたびに球が少し速くなり、周回数＋1 が星の得点の倍率
 * - 周回が途切れずに続くのは、最後に端を抜けてから lapWindow 秒まで。過ぎると周回は 0 に戻り、速さも戻る
 * - 星に当たると弾け、近くの星へ連鎖する。全部の星を弾けさせたらクリア。下へ落ちると球を1つ失う
 * 動く物は自分の球と星だけ（残響は出さない）。
 */
import { World, Circle, Polygon, Edge, type Body, type Contact } from 'planck';

export const HZ = 120;
export const DT = 1 / HZ;
export const W = 20;
export const H = 24;
/** 左右の端が開いている高さ（これより下は案内の壁） */
export const OPEN_Y = 16.5;

export interface OrbitConfig {
  gravity: number;
  ballR: number;
  /** 1 周ごとの速さの倍率と上限 */
  lapBoost: number;
  maxSpeed: number;
  /** 周回が途切れるまでの秒 */
  lapWindow: number;
  /** 星の連鎖の半径 */
  chainR: number;
  flipperLen: number;
  balls: number;
}

export const defaults: OrbitConfig = { gravity: 8, ballR: 0.32, lapBoost: 1.07, maxSpeed: 24, lapWindow: 4, chainR: 1.9, flipperLen: 3.1, balls: 3 };

export interface Star { x: number; y: number; r: number; alive: boolean; body: Body; at: number }

export type OrbitEvent =
  | { t: 'wrap'; side: -1 | 1; y: number; laps: number }
  | { t: 'lapBreak'; laps: number }
  | { t: 'star'; i: number; x: number; y: number; mult: number; chain: number; score: number }
  | { t: 'bumper'; x: number; y: number }
  | { t: 'flip'; side: -1 | 1 }
  | { t: 'drain' }
  | { t: 'clear' }
  | { t: 'over' };

type Tag = { k: 'ball' } | { k: 'wall' } | { k: 'star'; i: number } | { k: 'bumper' } | { k: 'flipper' };

/** 星の並び（盤面の上半分。端の近くの星は、周回して反対から入ると取りやすい） */
const STAR_POS: [number, number][] = [
  [0.9, 4.2], [19.1, 4.2], [0.9, 9.5], [19.1, 9.5],
  [10, 3.0], [8.6, 4.4], [11.4, 4.4],
  [4.5, 6.5], [15.5, 6.5], [3.2, 12.8], [16.8, 12.8],
  [10, 8.2], [7.2, 10.6], [12.8, 10.6], [10, 12.6],
];
const BUMPERS: [number, number, number][] = [[6.2, 8.4, 0.75], [13.8, 8.4, 0.75]];

export class OrbitSim {
  world: World;
  ball: Body;
  stars: Star[] = [];
  flippers: { body: Body; side: -1 | 1; up: boolean }[] = [];
  tick = 0;
  score = 0;
  laps = 0;
  bestLaps = 0;
  balls: number;
  phase: 'play' | 'clear' | 'over' = 'play';
  events: OrbitEvent[] = [];
  lastWrapTick = -1e9;
  private hitStars: number[] = [];
  private hitBumper: { x: number; y: number }[] = [];
  /** 弾ける順番待ち（連鎖は 0.08 秒ずつ遅れて伝わる） */
  private pend: { i: number; at: number; chain: number }[] = [];

  constructor(public cfg: OrbitConfig = defaults) {
    this.balls = cfg.balls;
    this.world = new World({ gravity: { x: 0, y: cfg.gravity } });
    const wall = this.world.createBody({ type: 'static', userData: { k: 'wall' } as Tag });
    const fx = { friction: 0.1, restitution: 0.4 };
    // 天井（なだらかな弧）
    for (let i = 0; i < 12; i++) {
      const a0 = i / 12, a1 = (i + 1) / 12;
      const y = (u: number) => 0.8 + 1.0 * (1 - Math.sin(u * Math.PI));
      wall.createFixture(new Edge({ x: -1 + a0 * (W + 2), y: y(a0) }, { x: -1 + a1 * (W + 2), y: y(a1) }), fx);
    }
    // 左右の下の案内の壁（端から、フリッパーの付け根へ）
    wall.createFixture(new Edge({ x: -1, y: OPEN_Y }, { x: 6.2, y: 20.6 }), fx);
    wall.createFixture(new Edge({ x: W + 1, y: OPEN_Y }, { x: W - 6.2, y: 20.6 }), fx);
    // 星
    STAR_POS.forEach(([x, y], i) => {
      const body = this.world.createBody({ type: 'static', position: { x, y }, userData: { k: 'star', i } as Tag });
      body.createFixture(new Circle(0.45), { restitution: 0.6 });
      this.stars.push({ x, y, r: 0.45, alive: true, body, at: -1 });
    });
    for (const [x, y, r] of BUMPERS) {
      const b = this.world.createBody({ type: 'static', position: { x, y }, userData: { k: 'bumper' } as Tag });
      b.createFixture(new Circle(r), { restitution: 0.9 });
    }
    // フリッパー（キネマティック。付け根を軸に回す）
    for (const side of [-1, 1] as const) {
      const px = side < 0 ? 6.4 : W - 6.4;
      const body = this.world.createBody({ type: 'kinematic', position: { x: px, y: 20.8 }, userData: { k: 'flipper' } as Tag });
      const s = side < 0 ? 1 : -1;
      body.createFixture(new Polygon([{ x: 0, y: -0.24 }, { x: s * cfg.flipperLen, y: -0.08 }, { x: s * cfg.flipperLen, y: 0.08 }, { x: 0, y: 0.24 }]), { friction: 0.3, restitution: 0.2 });
      body.setAngle(this.restAngle(side));
      this.flippers.push({ body, side, up: false });
    }
    this.ball = this.world.createBody({ type: 'dynamic', position: { x: 10, y: 15 }, bullet: true, userData: { k: 'ball' } as Tag });
    this.ball.createFixture(new Circle(cfg.ballR), { density: 1, friction: 0.1, restitution: 0.35 });
    this.serve();
    this.world.on('begin-contact', (c: Contact) => {
      const a = c.getFixtureA().getBody().getUserData() as Tag, b = c.getFixtureB().getBody().getUserData() as Tag;
      const o = a.k === 'ball' ? b : b.k === 'ball' ? a : null;
      if (!o) return;
      if (o.k === 'star') this.hitStars.push(o.i);
      if (o.k === 'bumper') { const p = this.ball.getPosition(); this.hitBumper.push({ x: p.x, y: p.y }); }
    });
  }

  restAngle(side: -1 | 1): number { return side < 0 ? 0.5 : -0.5; }
  upAngle(side: -1 | 1): number { return side < 0 ? -0.45 : 0.45; }

  get time(): number { return this.tick / HZ; }
  get mult(): number { return 1 + this.laps; }
  /** 周回が途切れるまでの残り（0〜1） */
  get lapLeft(): number {
    if (this.laps === 0) return 0;
    return Math.max(0, 1 - (this.tick - this.lastWrapTick) / (this.cfg.lapWindow * HZ));
  }

  /** 球を上から出す（左右に少し流れる） */
  private serve(): void {
    this.ball.setTransform({ x: 10, y: 2.2 }, 0);
    this.ball.setLinearVelocity({ x: this.balls % 2 ? 4 : -4, y: 0 });
    this.ball.setAngularVelocity(0);
  }

  private queue(i: number, at: number, chain: number): void {
    if (!this.stars[i].alive || this.pend.some((q) => q.i === i)) return;
    this.pend.push({ i, at, chain });
  }

  setFlipper(side: -1 | 1, up: boolean): void {
    const f = this.flippers.find((q) => q.side === side)!;
    if (up && !f.up) this.events.push({ t: 'flip', side });
    f.up = up;
  }

  step(): void {
    this.events = [];
    if (this.phase !== 'play') { this.tick++; return; }
    this.tick++;
    for (const f of this.flippers) {
      const target = f.up ? this.upAngle(f.side) : this.restAngle(f.side);
      const a = f.body.getAngle();
      const w = Math.max(-22, Math.min(22, (target - a) / DT));
      f.body.setAngularVelocity(w);
    }
    this.world.step(DT, 8, 3);
    // 星：当たった星と連鎖
    for (const i of this.hitStars) this.queue(i, this.tick, 0);
    this.hitStars = [];
    for (const b of this.hitBumper) this.events.push({ t: 'bumper', ...b });
    this.hitBumper = [];
    this.pend.sort((a, b) => a.at - b.at);
    while (this.pend.length && this.pend[0].at <= this.tick) {
      const q = this.pend.shift()!;
      const s = this.stars[q.i];
      if (!s.alive) continue;
      s.alive = false;
      s.at = this.tick;
      this.world.destroyBody(s.body);
      const pts = 100 * this.mult * (1 + q.chain);
      this.score += pts;
      this.events.push({ t: 'star', i: q.i, x: s.x, y: s.y, mult: this.mult, chain: q.chain, score: pts });
      this.stars.forEach((o, j) => {
        if (o.alive && Math.hypot(o.x - s.x, o.y - s.y) < this.cfg.chainR * (1 + 0.08 * this.laps)) this.queue(j, this.tick + Math.round(HZ * 0.08), q.chain + 1);
      });
    }
    if (this.stars.every((s) => !s.alive) && this.phase === 'play') { this.phase = 'clear'; this.events.push({ t: 'clear' }); return; }
    // 輪の盤：左右の端を抜けると反対側へ。周回 +1、少し速く
    const p = this.ball.getPosition();
    const v = this.ball.getLinearVelocity();
    if (p.x < -0.4 || p.x > W + 0.4) {
      const side = p.x < 0 ? -1 : 1;
      this.ball.setTransform({ x: p.x + (side < 0 ? W + 0.8 : -(W + 0.8)), y: p.y }, 0);
      this.laps++;
      this.bestLaps = Math.max(this.bestLaps, this.laps);
      this.lastWrapTick = this.tick;
      const sp = Math.hypot(v.x, v.y);
      const k = Math.min(this.cfg.lapBoost, this.cfg.maxSpeed / Math.max(0.1, sp));
      this.ball.setLinearVelocity({ x: v.x * Math.max(1, k), y: v.y * Math.max(1, k) });
      this.events.push({ t: 'wrap', side, y: p.y, laps: this.laps });
    }
    // 周回が途切れた
    if (this.laps > 0 && this.tick - this.lastWrapTick > this.cfg.lapWindow * HZ) {
      this.events.push({ t: 'lapBreak', laps: this.laps });
      this.laps = 0;
    }
    // 落ちた
    if (p.y > H + 1) {
      this.balls--;
      this.laps = 0;
      this.events.push({ t: 'drain' });
      if (this.balls <= 0) { this.phase = 'over'; this.events.push({ t: 'over' }); } else this.serve();
    }
  }
}
