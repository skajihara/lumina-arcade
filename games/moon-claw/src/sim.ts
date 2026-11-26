/**
 * Moon Claw（月の爪クレーン）のシミュレーション（描画なし）。NEW-02 の MVP。
 *
 * 2層の盤：
 *   - 上の段：棚の上に精霊（光る玉）が山になっている。月の爪（クレーン）を左右に動かし、下ろして掴み、運んで放す
 *   - 棚の真ん中には「落とし口」。そこへ落とした精霊は下の段へ落ち、ピンボールの球になる
 *   - 下の段：左右のフリッパーで精霊を打ち上げ、壁の巣穴（ゴール、穴ごとに倍率）へ入れる。下に落ちると消える
 *   - 爆弾精霊：山に強くぶつかる（または掴んで落とした先で強くぶつかる）と爆発し、周りの精霊を吹き飛ばす → 落とし口へ雪崩れればマルチボール
 * 目的：時間内に巣穴の点数を need 以上にする。
 *
 * 入力はビットマスク＋爪の目標の x（決定的：同じ入力なら同じ結果）。
 */
import { World, Circle, Polygon, Edge, RevoluteJoint, type Body, type Contact } from 'planck';

export const HZ = 120;
export const DT = 1 / HZ;
export const WORLD_W = 14;
export const WORLD_H = 24;
/** 上の段の棚の高さと、落とし口の左右 */
export const SHELF_Y = 9;
export const HOLE_X0 = 6.0;
export const HOLE_X1 = 8.0;
/** 爪のレールの高さ（爪の上端） */
export const RAIL_Y = 1.2;
export const PIVOT_L = { x: 4.3, y: 21.6 };
export const PIVOT_R = { x: 9.7, y: 21.6 };

export const IN_LEFT = 1;
export const IN_RIGHT = 2;
/** 爪を下ろす（押している間下がる、放すと閉じて上がる） */
export const IN_DROP = 4;
/** 爪を開いて放す */
export const IN_OPEN = 8;

export interface ClawConfig {
  gravity: number;
  /** 爪の横に動く速さ・下りる速さ・上がる速さ（m/s） */
  clawSpeed: number;
  clawDown: number;
  clawUp: number;
  /** 爪が掴める範囲（爪の先から） */
  grabR: number;
  /** 握力：一度に掴める数と、揺れでこぼす強さ（大きいほどこぼれにくい） */
  grabMax: number;
  grip: number;
  /** 精霊の大きさ・弾み */
  spiritR: number;
  restitution: number;
  /** 爆弾：爆発する衝突の速さ・半径・強さ */
  bombSpeed: number;
  bombR: number;
  bombForce: number;
  flipperLength: number;
  flipperSpeed: number;
  flipperTorque: number;
  /** 制限時間（秒） */
  timeLimit: number;
  /** 下の段の精霊が光っていられる秒（過ぎると消える。0 で消えない）。NEW-04 */
  ballLife: number;
}

export const defaults: ClawConfig = {
  gravity: 16, clawSpeed: 5, clawDown: 4, clawUp: 3.2, grabR: 0.9, grabMax: 3, grip: 7,
  spiritR: 0.32, restitution: 0.35, bombSpeed: 4, bombR: 2.4, bombForce: 9,
  flipperLength: 1.9, flipperSpeed: 22, flipperTorque: 2400, timeLimit: 90, ballLife: 7,
};

export interface SpiritDef { x: number; y: number; bomb?: boolean }
/** 巣穴。move があると左右に揺れる（amp m、speed は 1 秒あたりのラジアン） */
export interface GoalDef { x: number; y: number; r: number; mult: number; move?: { amp: number; speed: number; phase?: number } }
/** 柱。kick があると「月のバンパー」：当たった精霊を kick m/s で弾き返す */
export interface PostDef { x: number; y: number; r: number; kick?: number }

export interface ClawStage {
  id: string;
  name: string;
  hint: string;
  spirits: SpiritDef[];
  goals: GoalDef[];
  /** クリアに要る点（巣穴の倍率の合計） */
  need: number;
  /** 下の段の柱（入れない丸） */
  posts?: PostDef[];
  /** 制限時間の倍率（難易度の制限時間に掛ける） */
  timeScale?: number;
  /** 棚の上の低い壁（山を仕切る。爪はその上を越えられる）：x と高さ */
  fences?: { x: number; h: number }[];
  cfg?: Partial<ClawConfig>;
}

export interface Spirit {
  id: number;
  body: Body;
  bomb: boolean;
  /** 'pile' 上の段 / 'held' 爪の中 / 'ball' 下の段 / 'home' 巣穴に入った / 'lost' 落ちた・消えた */
  state: 'pile' | 'held' | 'ball' | 'home' | 'lost';
  /** 爪の中での位置（爪の中心から） */
  off: { x: number; y: number };
  /** 下の段へ落ちた時刻（ティック） */
  fellAt: number;
}

export type ClawEvent =
  | { t: 'grab'; n: number; x: number; y: number }
  | { t: 'slip'; id: number; x: number; y: number }
  | { t: 'release'; n: number; x: number; y: number }
  | { t: 'fall'; id: number; x: number; y: number }
  | { t: 'boom'; id: number; x: number; y: number; r: number }
  | { t: 'home'; id: number; x: number; y: number; mult: number; total: number }
  | { t: 'lost'; id: number; x: number; y: number; faded?: boolean }
  | { t: 'flip'; side: 'L' | 'R' }
  | { t: 'bump'; x: number; y: number }
  | { t: 'clear' }
  | { t: 'fail' };

type Tag = { kind: 'spirit'; id: number } | { kind: 'wall' } | { kind: 'flipper' };

export class ClawSim {
  world: World;
  cfg: ClawConfig;
  tick = 0;
  phase: 'play' | 'clear' | 'fail' = 'play';
  score = 0;
  spirits: Spirit[] = [];
  events: ClawEvent[] = [];
  /** 爪：中心の位置、開き具合（0 閉 → 1 開）、下りているか */
  claw = { x: WORLD_W / 2, y: RAIL_Y, open: 1, vx: 0 };
  private clawState: 'idle' | 'down' | 'up' = 'idle';
  private flippers: { side: 'L' | 'R'; body: Body; joint: RevoluteJoint }[] = [];
  private hits: { a: Spirit; b: Spirit | null; speed: number }[] = [];
  private bumps: { s: Spirit; i: number }[] = [];
  private prevBits = 0;

  constructor(public stage: ClawStage, cfg: ClawConfig = defaults) {
    this.cfg = { ...cfg, ...stage.cfg };
    this.cfg.timeLimit *= stage.timeScale ?? 1;
    this.world = new World({ gravity: { x: 0, y: this.cfg.gravity } });
    const ground = this.world.createBody({ type: 'static', userData: { kind: 'wall' } as Tag });
    const edge = (a: { x: number; y: number }, b: { x: number; y: number }) => ground.createFixture(new Edge(a, b), { friction: 0.3, restitution: 0.3 });
    // 外壁（上は開いている）
    edge({ x: 0, y: -5 }, { x: 0, y: WORLD_H + 2 });
    edge({ x: WORLD_W, y: -5 }, { x: WORLD_W, y: WORLD_H + 2 });
    // 上の段の棚（真ん中に落とし口）。平らで、落とし口の縁に小さな段（山が勝手に転がり落ちない）
    edge({ x: 0, y: SHELF_Y }, { x: HOLE_X0, y: SHELF_Y });
    edge({ x: HOLE_X1, y: SHELF_Y }, { x: WORLD_W, y: SHELF_Y });
    edge({ x: HOLE_X0, y: SHELF_Y }, { x: HOLE_X0, y: SHELF_Y - 0.45 });
    edge({ x: HOLE_X1, y: SHELF_Y }, { x: HOLE_X1, y: SHELF_Y - 0.45 });
    // 下の段：フリッパーへ向かう斜面（間はドレイン）
    edge({ x: 0, y: 18.5 }, { x: PIVOT_L.x - 0.1, y: PIVOT_L.y - 0.3 });
    edge({ x: WORLD_W, y: 18.5 }, { x: PIVOT_R.x + 0.1, y: PIVOT_R.y - 0.3 });
    (stage.posts ?? []).forEach((p, i) => {
      const f = ground.createFixture(new Circle({ x: p.x, y: p.y }, p.r), { friction: 0.1, restitution: 0.5 });
      if (p.kick) f.setUserData({ bumper: i });
    });
    for (const f of stage.fences ?? []) edge({ x: f.x, y: SHELF_Y }, { x: f.x, y: SHELF_Y - f.h });
    // フリッパー
    for (const [side, pivot] of [['L', PIVOT_L], ['R', PIVOT_R]] as const) {
      const s = side === 'L' ? 1 : -1;
      const L = this.cfg.flipperLength;
      const body = this.world.createBody({ type: 'dynamic', position: pivot, bullet: true, gravityScale: 0, userData: { kind: 'flipper' } as Tag });
      const fd = { density: 3, friction: 0.2, restitution: 0.15 };
      body.createFixture(new Polygon([{ x: 0, y: -0.24 }, { x: s * L, y: -0.1 }, { x: s * L, y: 0.1 }, { x: 0, y: 0.24 }]), fd);
      body.createFixture(new Circle({ x: 0, y: 0 }, 0.24), fd);
      const joint = this.world.createJoint(new RevoluteJoint({
        enableLimit: true, lowerAngle: side === 'L' ? -0.45 : -0.5, upperAngle: side === 'L' ? 0.5 : 0.45,
        enableMotor: true, maxMotorTorque: this.cfg.flipperTorque, motorSpeed: 0,
      }, ground, body, pivot))!;
      this.flippers.push({ side, body, joint });
    }
    stage.spirits.forEach((d, id) => {
      const body = this.world.createBody({ type: 'dynamic', position: { x: d.x, y: d.y }, bullet: true, linearDamping: 0.05, angularDamping: 0.5, userData: { kind: 'spirit', id } as Tag });
      body.createFixture(new Circle(this.cfg.spiritR), { density: d.bomb ? 1.6 : 1, friction: 0.35, restitution: this.cfg.restitution });
      this.spirits.push({ id, body, bomb: !!d.bomb, state: 'pile', off: { x: 0, y: 0 }, fellAt: 0 });
    });
    this.world.on('begin-contact', (c: Contact) => this.onContact(c));
  }

  get time(): number {
    return this.tick / HZ;
  }

  get timeLeft(): number {
    return Math.max(0, this.cfg.timeLimit - this.time);
  }

  /** 爪の先（掴む所）の y */
  get clawTip(): number {
    return this.claw.y + 0.9;
  }

  private onContact(c: Contact): void {
    const ua = c.getFixtureA().getBody().getUserData() as Tag | null;
    const ub = c.getFixtureB().getBody().getUserData() as Tag | null;
    const a = ua?.kind === 'spirit' ? this.spirits[ua.id] : null;
    const b = ub?.kind === 'spirit' ? this.spirits[ub.id] : null;
    const va = c.getFixtureA().getBody().getLinearVelocity(), vb = c.getFixtureB().getBody().getLinearVelocity();
    const speed = Math.hypot(va.x - vb.x, va.y - vb.y);
    // 月のバンパー
    const fa = c.getFixtureA().getUserData() as { bumper?: number } | null, fb = c.getFixtureB().getUserData() as { bumper?: number } | null;
    const bi = fa?.bumper ?? fb?.bumper;
    if (bi !== undefined && (a || b)) this.bumps.push({ s: (a ?? b)!, i: bi });
    if (a) this.hits.push({ a, b, speed });
    if (b) this.hits.push({ a: b, b: a, speed });
  }

  /** 1ティック進める。targetX：爪を動かしたい x（マウスの位置など） */
  step(bits: number, targetX = this.claw.x): void {
    this.events = [];
    this.tick++;
    const cfg = this.cfg;
    const rise = bits & ~this.prevBits;
    const fallB = this.prevBits & ~bits;
    this.prevBits = bits;
    if (this.phase === 'play') {
      this.moveClaw(bits, rise, fallB, targetX);
      for (const f of this.flippers) {
        const on = (bits & (f.side === 'L' ? IN_LEFT : IN_RIGHT)) !== 0;
        const dir = f.side === 'L' ? -1 : 1;
        f.joint.setMotorSpeed(on ? dir * cfg.flipperSpeed : -dir * cfg.flipperSpeed * 0.7);
        if (rise & (f.side === 'L' ? IN_LEFT : IN_RIGHT)) this.events.push({ t: 'flip', side: f.side });
      }
    }
    this.world.step(DT, 8, 3);
    this.afterStep();
  }

  private moveClaw(bits: number, rise: number, fall: number, targetX: number): void {
    const cfg = this.cfg;
    const c = this.claw;
    const ox = c.x;
    if (this.clawState === 'idle') {
      // レールの上だけ横に動ける
      const dx = Math.max(0.6, Math.min(WORLD_W - 0.6, targetX)) - c.x;
      const step = cfg.clawSpeed * DT;
      c.x += Math.max(-step, Math.min(step, dx));
      if (rise & IN_DROP) { this.clawState = 'down'; c.open = 1; }
    } else if (this.clawState === 'down') {
      c.y += cfg.clawDown * DT;
      const floor = SHELF_Y - 1.1;
      const touching = this.spirits.some((s) => s.state === 'pile' && Math.hypot(s.body.getPosition().x - c.x, s.body.getPosition().y - this.clawTip) < cfg.spiritR + 0.1);
      if (!(bits & IN_DROP) || c.y >= floor || touching) { this.close(); this.clawState = 'up'; }
    } else if (this.clawState === 'up') {
      c.y = Math.max(RAIL_Y, c.y - cfg.clawUp * DT);
      if (c.y <= RAIL_Y) this.clawState = 'idle';
    }
    if (fall & IN_DROP) { /* 放したら閉じる（down の中で処理） */ }
    if (rise & IN_OPEN) this.release();
    c.vx = (c.x - ox) / DT;
    // 掴んでいる精霊は爪と一緒に動く。速く動かすと（揺れ）、握力に負けた分がこぼれる
    const held = this.spirits.filter((s) => s.state === 'held');
    for (const s of held) {
      s.body.setTransform({ x: c.x + s.off.x, y: this.clawTip + s.off.y }, 0);
      s.body.setLinearVelocity({ x: c.vx, y: 0 });
    }
    // 握力 grip の 6 割を超える速さで動かすと、18 ティックごとに1つこぼれる（ゆっくり運べば落とさない）
    const shake = Math.abs(c.vx) / Math.max(0.1, cfg.grip);
    if (held.length && shake > 0.6 && this.tick % 18 === 0) {
      // 揺れが大きいほど、外側の精霊から1つこぼれる（決定的：一番外側）
      const out = held.sort((a, b) => Math.abs(b.off.x) - Math.abs(a.off.x))[0];
      out.state = 'pile';
      out.body.setGravityScale(1);
      this.events.push({ t: 'slip', id: out.id, x: out.body.getPosition().x, y: out.body.getPosition().y });
    }
  }

  /** 爪を閉じる：爪の先の近くの精霊を grabMax まで掴む */
  private close(): void {
    const c = this.claw;
    c.open = 0;
    const near = this.spirits
      .filter((s) => s.state === 'pile')
      .map((s) => ({ s, d: Math.hypot(s.body.getPosition().x - c.x, s.body.getPosition().y - this.clawTip) }))
      .filter((q) => q.d < this.cfg.grabR + this.cfg.spiritR)
      .sort((a, b) => a.d - b.d)
      .slice(0, Math.round(this.cfg.grabMax));
    near.forEach(({ s }, k) => {
      s.state = 'held';
      s.off = { x: (k - (near.length - 1) / 2) * this.cfg.spiritR * 2.1, y: 0.1 };
      s.body.setGravityScale(0);
    });
    if (near.length) this.events.push({ t: 'grab', n: near.length, x: c.x, y: this.clawTip });
  }

  /** 爪を開いて放す */
  release(): void {
    const held = this.spirits.filter((s) => s.state === 'held');
    this.claw.open = 1;
    for (const s of held) {
      s.state = 'pile';
      s.body.setGravityScale(1);
      s.body.setLinearVelocity({ x: this.claw.vx * 0.6, y: 0 });
    }
    if (held.length) this.events.push({ t: 'release', n: held.length, x: this.claw.x, y: this.clawTip });
  }

  private explode(s: Spirit): void {
    const p = s.body.getPosition().clone();
    s.state = 'lost';
    this.world.destroyBody(s.body);
    this.events.push({ t: 'boom', id: s.id, x: p.x, y: p.y, r: this.cfg.bombR });
    for (const q of this.spirits) {
      if (q.state !== 'pile' && q.state !== 'ball') continue;
      const qp = q.body.getPosition();
      const dx = qp.x - p.x, dy = qp.y - p.y, d = Math.hypot(dx, dy);
      if (d > this.cfg.bombR || d < 1e-4) continue;
      const k = this.cfg.bombForce * (1 - d / this.cfg.bombR) + 1;
      if (q.bomb) { this.explode(q); continue; }
      const v = q.body.getLinearVelocity();
      q.body.setLinearVelocity({ x: v.x + (dx / d) * k, y: v.y + (dy / d) * k - 1 });
      q.body.setAwake(true);
    }
  }

  private afterStep(): void {
    // 爆弾：強くぶつかると爆発
    for (const h of this.hits) if (h.a.bomb && (h.a.state === 'pile' || h.a.state === 'ball') && h.speed > this.cfg.bombSpeed) this.explode(h.a);
    this.hits = [];
    for (const { s, i } of this.bumps) {
      if (s.state !== 'ball' && s.state !== 'pile') continue;
      const post = this.stage.posts![i];
      const p = s.body.getPosition();
      const dx = p.x - post.x, dy = p.y - post.y, d = Math.hypot(dx, dy) || 1;
      s.body.setLinearVelocity({ x: (dx / d) * post.kick!, y: (dy / d) * post.kick! });
      this.events.push({ t: 'bump', x: post.x, y: post.y });
    }
    this.bumps = [];
    for (const s of this.spirits) {
      if (s.state === 'held' || s.state === 'home' || s.state === 'lost') continue;
      const p = s.body.getPosition();
      // 落とし口を通って下の段へ
      if (s.state === 'pile' && p.y > SHELF_Y + 0.4) {
        s.state = 'ball';
        s.fellAt = this.tick;
        this.events.push({ t: 'fall', id: s.id, x: p.x, y: p.y });
      }
      // 巣穴
      if (s.state === 'ball') {
        const g = this.stage.goals.find((q) => { const gx = this.goalX(q); return Math.hypot(p.x - gx, p.y - q.y) < q.r; });
        if (g) {
          s.state = 'home';
          this.score += g.mult;
          this.world.destroyBody(s.body);
          this.events.push({ t: 'home', id: s.id, x: this.goalX(g), y: g.y, mult: g.mult, total: this.score });
          continue;
        }
      }
      // 光が尽きた精霊は消える
      const faded = s.state === 'ball' && this.cfg.ballLife > 0 && this.tick - s.fellAt > this.cfg.ballLife * HZ;
      if (faded || p.y > WORLD_H + 1 || p.x < -1 || p.x > WORLD_W + 1) {
        s.state = 'lost';
        this.world.destroyBody(s.body);
        this.events.push({ t: 'lost', id: s.id, x: p.x, y: p.y, faded });
      }
    }
    if (this.phase !== 'play') return;
    if (this.score >= this.stage.need) {
      this.phase = 'clear';
      this.events.push({ t: 'clear' });
      return;
    }
    // 時間切れ、または届く分の精霊がもう残っていない
    const left = this.spirits.filter((s) => s.state !== 'home' && s.state !== 'lost').length;
    const best = Math.max(...this.stage.goals.map((g) => g.mult));
    if (this.timeLeft <= 0 || this.score + left * best < this.stage.need) {
      this.phase = 'fail';
      this.events.push({ t: 'fail' });
    }
  }

  /** 下の段の精霊の残りの光 0..1（描画用） */
  lifeOf(s: Spirit): number {
    if (s.state !== 'ball' || this.cfg.ballLife <= 0) return 1;
    return Math.max(0, 1 - (this.tick - s.fellAt) / (this.cfg.ballLife * HZ));
  }

  /** 巣穴の今の x（揺れる巣穴） */
  goalX(g: GoalDef, at = this.time): number {
    return g.move ? g.x + Math.sin(at * g.move.speed + (g.move.phase ?? 0)) * g.move.amp : g.x;
  }

  /** フリッパーの位置と角度（描画用） */
  flipperPoses(): { side: 'L' | 'R'; x: number; y: number; angle: number; length: number }[] {
    return this.flippers.map((f) => ({ side: f.side, x: f.body.getPosition().x, y: f.body.getPosition().y, angle: f.body.getAngle(), length: this.cfg.flipperLength }));
  }

  /** 爪の状態（描画用） */
  get clawMode(): 'idle' | 'down' | 'up' {
    return this.clawState;
  }

  digest(): number[] {
    const out = [this.tick, this.score, this.claw.x, this.claw.y];
    for (const s of this.spirits) {
      if (s.state === 'home' || s.state === 'lost') { out.push(-1); continue; }
      const p = s.body.getPosition();
      out.push(p.x, p.y);
    }
    return out;
  }
}
