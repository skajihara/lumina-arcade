/**
 * 試作 EL-20 案③「時間の巻き戻し」のシミュレーション（描画なし）。
 *
 * 自分の球1つとフリッパーで、盤面の星を全部灯す。灯った星はそのまま。
 * 落ちそうになったら、巻き戻しキーを押している間だけ時間が逆に流れる（球・フリッパー・星の灯りが戻る）。
 * 巻き戻せる量はゲージ（秒）で決まる。星を初めて灯すと少し回復。落ちてからも少しの間なら巻き戻して救える。
 * ゲージを残してクリアするほど★。残響（過去の自分の再生）はない — 自分の腕だけ。
 */
import { World, Circle, Edge, Polygon, type Body, type Contact } from 'planck';

export const HZ = 120;
export const DT = 1 / HZ;
export const W = 20;
export const H = 30;
/** 球が出ていく所（フィールドの右端。右はプランジャーのレーン） */
export const FIELD_R = 18.6;
export const BALL_R = 0.42;

export interface RewindConfig {
  gravity: number;
  /** ゲージの最大（巻き戻せる秒） */
  gaugeMax: number;
  /** 星を初めて灯した時の回復（秒） */
  gaugeGain: number;
  /** 巻き戻しの速さ（1ティックに何ティック戻るか） */
  rewindSpeed: number;
  /** 覚えておく過去（秒） */
  historySec: number;
  /** 落ちてから巻き戻しで救える猶予（秒） */
  drainGrace: number;
  balls: number;
  flipSpeed: number;
  launch: number;
  starKick: number;
}

export const defaults: RewindConfig = {
  gravity: 14, gaugeMax: 4, gaugeGain: 0.6, rewindSpeed: 2, historySec: 8, drainGrace: 1.4, balls: 3, flipSpeed: 26, launch: 30, starKick: 5,
};

export interface StarDef { x: number; y: number }
/** 1面：二つの星座（片方は高い所、片方は脇の奥） */
export const stars: StarDef[] = [
  { x: 4.2, y: 5.2 }, { x: 6.8, y: 3.6 }, { x: 9.6, y: 4.4 }, { x: 12.4, y: 3.2 }, { x: 14.8, y: 5.4 },
  { x: 9.3, y: 8.6 }, { x: 5.4, y: 11.2 }, { x: 13.2, y: 11.0 },
  { x: 2.2, y: 15.8 }, { x: 16.4, y: 15.2 }, { x: 7.2, y: 16.6 }, { x: 11.6, y: 17.2 },
];
/** 星座の線（描画用） */
export const links: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [5, 6], [5, 7], [6, 8], [7, 9], [6, 10], [7, 11]];

export const PIVOT_L = { x: 6.3, y: 27.0 };
export const PIVOT_R = { x: 12.3, y: 27.0 };
export const FLIP_LEN = 2.75;
const REST = 0.5, UP = -0.48;

interface Snap { bx: number; by: number; vx: number; vy: number; w: number; la: number; ra: number; lit: number; inLane: boolean }

export type RewindEvent =
  | { t: 'star'; i: number; x: number; y: number; first: boolean }
  | { t: 'bump'; x: number; y: number; speed: number }
  | { t: 'flip'; side: 'l' | 'r' }
  | { t: 'launch' }
  | { t: 'drain' }
  | { t: 'saved' }
  | { t: 'lost'; left: number }
  | { t: 'clear' }
  | { t: 'fail' };

export class RewindSim {
  world: World;
  ball: Body;
  flipL: Body;
  flipR: Body;
  starBodies: Body[] = [];
  lit = 0;
  everLit = 0;
  gauge: number;
  balls: number;
  tick = 0;
  phase: 'play' | 'drain' | 'clear' | 'fail' = 'play';
  /** 巻き戻し中か（このティック） */
  rewinding = false;
  /** 落ちてからの残り猶予（ティック） */
  graceLeft = 0;
  inLane = true;
  events: RewindEvent[] = [];
  history: Snap[] = [];
  private hits: { star?: number; speed: number; x: number; y: number }[] = [];
  private prevL = false;
  private prevR = false;

  constructor(public cfg: RewindConfig = defaults) {
    this.gauge = cfg.gaugeMax;
    this.balls = cfg.balls;
    this.world = new World({ gravity: { x: 0, y: cfg.gravity } });
    const g = this.world.createBody({ type: 'static' });
    const wall = (a: [number, number], b: [number, number], rest = 0.4) => g.createFixture(new Edge({ x: a[0], y: a[1] }, { x: b[0], y: b[1] }), { friction: 0.1, restitution: rest });
    wall([0, 4.5], [0, 22.5]);
    wall([0, 4.5], [3, 1]);
    wall([3, 1], [6, 0]);
    wall([6, 0], [15, 0]);
    wall([15, 0], [18.4, 1.2]);
    wall([18.4, 1.2], [20, 3.8], 0.2);
    wall([20, 3.8], [20, 30]);
    wall([FIELD_R, 7.5], [FIELD_R, 30]);
    wall([FIELD_R, 29.2], [20, 29.2], 0);
    // 下の斜面（インレーン）
    wall([0, 22.5], [PIVOT_L.x - 0.2, PIVOT_L.y - 0.15], 0.2);
    wall([FIELD_R, 22.5], [PIVOT_R.x + 0.2, PIVOT_R.y - 0.15], 0.2);
    // 左右の小さな三角（はね返し）
    for (const sgn of [1, -1]) {
      const cx = sgn > 0 ? 3.4 : FIELD_R - 3.4;
      const tri = [{ x: cx - 0.9 * sgn, y: 19.6 }, { x: cx - 0.9 * sgn, y: 22.6 }, { x: cx + 1.1 * sgn, y: 23.6 }];
      wall([tri[0].x, tri[0].y], [tri[1].x, tri[1].y], 0.3);
      wall([tri[1].x, tri[1].y], [tri[2].x, tri[2].y], 0.3);
      wall([tri[2].x, tri[2].y], [tri[0].x, tri[0].y], 1.05);
    }
    stars.forEach((s, i) => {
      const b = this.world.createBody({ type: 'static', position: s, userData: { star: i } });
      b.createFixture(new Circle(0.55), { restitution: 0.6 });
      this.starBodies.push(b);
    });
    const flip = (p: { x: number; y: number }, dir: 1 | -1) => {
      const b = this.world.createBody({ type: 'kinematic', position: p, angle: dir * REST });
      const L = FLIP_LEN * dir;
      b.createFixture(new Polygon([{ x: 0, y: -0.32 }, { x: L, y: -0.1 }, { x: L, y: 0.1 }, { x: 0, y: 0.32 }]), { friction: 0.3, restitution: 0.15 });
      return b;
    };
    this.flipL = flip(PIVOT_L, 1);
    this.flipR = flip(PIVOT_R, -1);
    this.ball = this.world.createBody({ type: 'dynamic', position: { x: 19.3, y: 28.5 }, bullet: true });
    this.ball.createFixture(new Circle(BALL_R), { density: 1, friction: 0.15, restitution: 0.35 });
    this.world.on('begin-contact', (c: Contact) => {
      const a = c.getFixtureA().getBody(), b = c.getFixtureB().getBody();
      if (a !== this.ball && b !== this.ball) return;
      const o = a === this.ball ? b : a;
      const ud = o.getUserData() as { star?: number } | null;
      const v = this.ball.getLinearVelocity();
      const p = this.ball.getPosition();
      this.hits.push({ star: ud?.star, speed: Math.hypot(v.x, v.y), x: p.x, y: p.y });
    });
  }

  get time(): number { return this.tick / HZ; }
  get litCount(): number { let n = 0; for (let i = 0; i < stars.length; i++) if (this.lit & (1 << i)) n++; return n; }
  get ballPos(): { x: number; y: number } { const p = this.ball.getPosition(); return { x: p.x, y: p.y }; }

  private snap(): Snap {
    const p = this.ball.getPosition(), v = this.ball.getLinearVelocity();
    return { bx: p.x, by: p.y, vx: v.x, vy: v.y, w: this.ball.getAngularVelocity(), la: this.flipL.getAngle(), ra: this.flipR.getAngle(), lit: this.lit, inLane: this.inLane };
  }

  private restore(s: Snap): void {
    this.ball.setTransform({ x: s.bx, y: s.by }, 0);
    this.ball.setLinearVelocity({ x: s.vx, y: s.vy });
    this.ball.setAngularVelocity(s.w);
    this.ball.setAwake(true);
    this.flipL.setTransform(PIVOT_L, s.la);
    this.flipR.setTransform(PIVOT_R, s.ra);
    this.flipL.setAngularVelocity(0);
    this.flipR.setAngularVelocity(0);
    this.lit = s.lit;
    this.inLane = s.inLane;
  }

  /** 1ティック進める。left/right＝フリッパー、launch＝発射、rewind＝巻き戻し（押している間） */
  step(inp: { left: boolean; right: boolean; launch: boolean; rewind: boolean }): void {
    this.events = [];
    if (this.phase === 'clear' || this.phase === 'fail') return;
    this.tick++;
    const cfg = this.cfg;
    // 巻き戻し：過去の写しを戻す（ゲージを使う）
    this.rewinding = inp.rewind && this.gauge > 0 && this.history.length > 1;
    if (this.rewinding) {
      let s: Snap | undefined;
      for (let k = 0; k < cfg.rewindSpeed && this.history.length > 1; k++) s = this.history.pop();
      if (s) this.restore(s);
      this.gauge = Math.max(0, this.gauge - (cfg.rewindSpeed * DT));
      if (this.phase === 'drain') { this.phase = 'play'; this.events.push({ t: 'saved' }); }
      return;
    }
    if (this.phase === 'drain') {
      if (--this.graceLeft <= 0) this.loseBall();
      return;
    }
    // フリッパー
    const drive = (b: Body, up: boolean, dir: 1 | -1) => {
      const target = dir * (up ? UP : REST);
      const d = target - b.getAngle();
      b.setAngularVelocity(Math.max(-cfg.flipSpeed, Math.min(cfg.flipSpeed, d / DT)));
    };
    drive(this.flipL, inp.left, 1);
    drive(this.flipR, inp.right, -1);
    if (inp.left && !this.prevL) this.events.push({ t: 'flip', side: 'l' });
    if (inp.right && !this.prevR) this.events.push({ t: 'flip', side: 'r' });
    this.prevL = inp.left; this.prevR = inp.right;
    // 発射
    const p0 = this.ball.getPosition();
    if (inp.launch && p0.x > FIELD_R && p0.y > 26 && Math.abs(this.ball.getLinearVelocity().y) < 1) {
      this.ball.setLinearVelocity({ x: 0, y: -cfg.launch });
      this.events.push({ t: 'launch' });
    }
    this.world.step(DT, 8, 3);
    for (const h of this.hits) {
      if (h.star !== undefined) {
        const s = stars[h.star];
        const bit = 1 << h.star;
        // 星：はじく（中心から外へ）
        const p = this.ball.getPosition(), v = this.ball.getLinearVelocity();
        const dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy) || 1;
        this.ball.setLinearVelocity({ x: v.x + (dx / d) * cfg.starKick, y: v.y + (dy / d) * cfg.starKick });
        if (!(this.lit & bit)) {
          this.lit |= bit;
          const first = !(this.everLit & bit);
          if (first) { this.everLit |= bit; this.gauge = Math.min(cfg.gaugeMax, this.gauge + cfg.gaugeGain); }
          this.events.push({ t: 'star', i: h.star, x: s.x, y: s.y, first });
        } else this.events.push({ t: 'bump', x: s.x, y: s.y, speed: h.speed });
      } else if (h.speed > 4) this.events.push({ t: 'bump', x: h.x, y: h.y, speed: h.speed });
    }
    this.hits = [];
    const p = this.ball.getPosition();
    if (p.x < FIELD_R - 0.5) this.inLane = false;
    this.history.push(this.snap());
    if (this.history.length > cfg.historySec * HZ) this.history.shift();
    if (this.litCount === stars.length) { this.phase = 'clear'; this.events.push({ t: 'clear' }); return; }
    if (p.y > H + 0.8) {
      this.phase = 'drain';
      this.graceLeft = Math.round(cfg.drainGrace * HZ);
      this.events.push({ t: 'drain' });
    }
  }

  private loseBall(): void {
    this.balls--;
    this.history = [];
    if (this.balls <= 0) { this.phase = 'fail'; this.events.push({ t: 'fail' }); return; }
    this.phase = 'play';
    this.ball.setTransform({ x: 19.3, y: 28.5 }, 0);
    this.ball.setLinearVelocity({ x: 0, y: 0 });
    this.inLane = true;
    this.events.push({ t: 'lost', left: this.balls });
  }

  /** ★：ゲージをどれだけ残してクリアしたか */
  get stars3(): number {
    if (this.phase !== 'clear') return 0;
    const f = this.gauge / this.cfg.gaugeMax;
    return f >= 0.6 ? 3 : f >= 0.25 ? 2 : 1;
  }
}
