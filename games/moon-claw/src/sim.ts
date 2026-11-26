/**
 * Moon Claw（月の爪クレーン）のシミュレーション（描画なし）。MC-10 で作り直した。
 *
 * - ピンボールの段はやめて、1つの部屋で「宝石を運んで宝石箱に納める」クレーンゲームに
 * - 爪は物理で作る：爪の頭（キネマティック。プレイヤーが動かす）に、左右の指を回転ジョイントのモーターでつなぐ。
 *   指と宝石は本当にぶつかり、摩擦と指先の鉤で持ち上がる（前の「近くの物を爪の位置へ瞬間移動」はやめた）
 * - 操作の自由度：左右・上下は押している間だけ動く（少し慣性あり）。開く／閉じるも押している間だけ動き、
 *   放すとその角度で止まる（半開きで持てる）。マウスでは「目標の位置」へ爪の頭が向かう
 * - 宝石は種類ごとに形・重さ・滑りやすさ・点数が違う。宝石箱の中で落ち着くと納まり、点数（箱の倍率つき）
 * - 目的：制限時間内に need 点
 *
 * 入力はビットマスク＋（任意で）爪の頭の目標の位置。同じ入力なら同じ結果（決定的）。
 */
import { World, Circle, Box, Polygon, Edge, RevoluteJoint, GearJoint, type Body } from 'planck';

export const HZ = 120;
export const DT = 1 / HZ;
export const WORLD_W = 22;
export const WORLD_H = 14;
/** 床の高さ */
export const FLOOR_Y = WORLD_H - 0.4;
/** 爪のレール（天井）の高さ */
export const RAIL_Y = 0.5;

export const IN_LEFT = 1;
export const IN_RIGHT = 2;
export const IN_UP = 4;
export const IN_DOWN = 8;
export const IN_OPEN = 16;
export const IN_CLOSE = 32;

/** 指の長さ（ピボットから鉤の下まで） */
export const FINGER_L = 1.45;

export interface ClawConfig {
  gravity: number;
  /** 爪の頭の最高速度（m/s）と加速（m/s²） */
  clawSpeed: number;
  clawAccel: number;
  /** 指のモーターの速さ（rad/s）と力（N·m）。力が強いほどしっかり挟む */
  fingerSpeed: number;
  fingerTorque: number;
  /** 指と宝石の摩擦 */
  fingerFriction: number;
  /** 制限時間（秒） */
  timeLimit: number;
  /** 宝石箱の中で何秒落ち着いたら納まるか */
  settle: number;
}

export const defaults: ClawConfig = {
  gravity: 16, clawSpeed: 5.5, clawAccel: 14, fingerSpeed: 3.2, fingerTorque: 90, fingerFriction: 0.9,
  timeLimit: 90, settle: 0.35,
};

export type GemKind = 'crystal' | 'pearl' | 'moonstone' | 'shard';
/** 宝石の種類：形・大きさ・重さ（密度）・摩擦・点数 */
export const GEMS: Record<GemKind, { name: string; shape: 'box' | 'circle'; w: number; h: number; density: number; friction: number; value: number; color: number }> = {
  crystal: { name: '水晶', shape: 'box', w: 0.62, h: 0.5, density: 1, friction: 0.7, value: 1, color: 0x9fe3ff },
  pearl: { name: '真珠', shape: 'circle', w: 0.34, h: 0.34, density: 1.3, friction: 0.12, value: 2, color: 0xfff3e6 },
  moonstone: { name: '月長石', shape: 'circle', w: 0.52, h: 0.52, density: 3.2, friction: 0.5, value: 3, color: 0xc9b8ff },
  shard: { name: '星の結晶', shape: 'box', w: 1.25, h: 0.26, density: 1, friction: 0.6, value: 2, color: 0xffd98a },
};

export interface GemDef { kind: GemKind; x: number; y: number; angle?: number }
/** 宝石箱：上が開いた箱。x, y は口の左上、w, h は中の広さ。mult は点数の倍率 */
export interface BoxDef { x: number; y: number; w: number; h: number; mult: number }
/** 足場・台（四角）。x, y は左上 */
export interface BlockDef { x: number; y: number; w: number; h: number }

export interface ClawStage {
  id: string;
  name: string;
  hint: string;
  gems: GemDef[];
  boxes: BoxDef[];
  blocks?: BlockDef[];
  need: number;
  /** 制限時間の倍率 */
  timeScale?: number;
  /** 爪の頭の始めの x */
  startX?: number;
}

export interface Gem {
  id: number;
  kind: GemKind;
  body: Body;
  state: 'free' | 'home';
  /** 宝石箱の中で落ち着いているティック数 */
  calm: number;
}

export type ClawEvent =
  | { t: 'grip'; x: number; y: number }
  | { t: 'drop'; id: number; x: number; y: number }
  | { t: 'clack'; x: number; y: number; speed: number }
  | { t: 'home'; id: number; x: number; y: number; value: number; mult: number; total: number; combo: number }
  | { t: 'clear' }
  | { t: 'fail' };

type Tag = { kind: 'gem'; id: number } | { kind: 'wall' } | { kind: 'finger'; side: 'L' | 'R' } | { kind: 'head' };

export interface Finger { side: 'L' | 'R'; body: Body; joint: RevoluteJoint }

export class ClawSim {
  world: World;
  cfg: ClawConfig;
  tick = 0;
  phase: 'play' | 'clear' | 'fail' = 'play';
  score = 0;
  gems: Gem[] = [];
  events: ClawEvent[] = [];
  head: Body;
  fingers: Finger[] = [];
  /** 爪の頭の速さ（入力から作る。慣性） */
  vel = { x: 0, y: 0 };
  /** 続けて納めた数（同じ種類が続くとコンボ） */
  combo = 0;
  private lastKind: GemKind | null = null;
  /** 指に触れている宝石（ティックごとに数える） */
  private touching = new Map<number, number>();
  private wasHeld = new Set<number>();

  constructor(public stage: ClawStage, cfg: ClawConfig = defaults) {
    this.cfg = { ...cfg };
    this.cfg.timeLimit *= stage.timeScale ?? 1;
    this.world = new World({ gravity: { x: 0, y: this.cfg.gravity } });
    const ground = this.world.createBody({ type: 'static', userData: { kind: 'wall' } as Tag });
    const fd = { friction: 0.6, restitution: 0.1 };
    ground.createFixture(new Edge({ x: 0, y: FLOOR_Y }, { x: WORLD_W, y: FLOOR_Y }), fd);
    ground.createFixture(new Edge({ x: 0, y: -4 }, { x: 0, y: FLOOR_Y }), fd);
    ground.createFixture(new Edge({ x: WORLD_W, y: -4 }, { x: WORLD_W, y: FLOOR_Y }), fd);
    for (const b of stage.blocks ?? []) ground.createFixture(new Box(b.w / 2, b.h / 2, { x: b.x + b.w / 2, y: b.y + b.h / 2 }, 0), fd);
    // 宝石箱：底と左右の壁（厚さ 0.2）
    for (const bx of stage.boxes) {
      const t = 0.2;
      ground.createFixture(new Box(bx.w / 2 + t, t / 2, { x: bx.x + bx.w / 2, y: bx.y + bx.h + t / 2 }, 0), fd);
      ground.createFixture(new Box(t / 2, bx.h / 2, { x: bx.x - t / 2, y: bx.y + bx.h / 2 }, 0), fd);
      ground.createFixture(new Box(t / 2, bx.h / 2, { x: bx.x + bx.w + t / 2, y: bx.y + bx.h / 2 }, 0), fd);
    }
    // 爪の頭（キネマティック）と2本の指
    const hx = stage.startX ?? WORLD_W / 2, hy = 2.2;
    this.head = this.world.createBody({ type: 'kinematic', position: { x: hx, y: hy }, userData: { kind: 'head' } as Tag });
    this.head.createFixture(new Box(0.45, 0.18), { isSensor: true });
    for (const side of ['L', 'R'] as const) {
      const s = side === 'L' ? 1 : -1; // 内向き
      const pivot = { x: hx - s * 0.3, y: hy + 0.15 };
      const body = this.world.createBody({ type: 'dynamic', position: pivot, bullet: true, angularDamping: 2, userData: { kind: 'finger', side } as Tag });
      const ff = { density: 1.5, friction: this.cfg.fingerFriction, restitution: 0.05 };
      body.createFixture(new Box(0.07, FINGER_L / 2 - 0.05, { x: 0, y: FINGER_L / 2 - 0.05 }, 0), ff);
      // 指先の鉤（内向き）
      body.createFixture(new Polygon([{ x: -s * 0.07, y: FINGER_L - 0.22 }, { x: s * 0.36, y: FINGER_L - 0.1 }, { x: s * 0.36, y: FINGER_L }, { x: -s * 0.07, y: FINGER_L }]), ff);
      const joint = this.world.createJoint(new RevoluteJoint({
        // 角度の範囲とモーターは左の指だけ（右は歯車で左の鏡になる。両方に付けると拘束がぶつかって指が固まった）
        enableLimit: side === 'L',
        lowerAngle: side === 'L' ? -0.28 : -0.95,
        upperAngle: side === 'L' ? 0.95 : 0.28,
        enableMotor: side === 'L', maxMotorTorque: this.cfg.fingerTorque * 2, motorSpeed: 0,
      }, this.head, body, pivot))!;
      // 始めは開いている（ジョイントを作った後で回す。ジョイントの角度 0 ＝まっすぐ下）
      body.setTransform(pivot, s * 0.55);
      this.fingers.push({ side, body, joint });
    }
    // 2本の指は歯車でつなぐ（左の角度＋右の角度＝0）。挟んだまま2本が一緒に振れないように（本物のクレーンの爪と同じ）
    this.world.createJoint(new GearJoint({}, this.fingers[0].body, this.fingers[1].body, this.fingers[0].joint, this.fingers[1].joint, 1));
    stage.gems.forEach((d, id) => {
      const g = GEMS[d.kind];
      const body = this.world.createBody({ type: 'dynamic', position: { x: d.x, y: d.y }, angle: d.angle ?? 0, bullet: true, angularDamping: 0.6, linearDamping: 0.05, userData: { kind: 'gem', id } as Tag });
      const shape = g.shape === 'circle' ? new Circle(g.w) : new Box(g.w / 2, g.h / 2);
      body.createFixture(shape, { density: g.density, friction: g.friction, restitution: 0.15 });
      this.gems.push({ id, kind: d.kind, body, state: 'free', calm: 0 });
    });
    this.world.on('begin-contact', (c) => {
      const ua = c.getFixtureA().getBody().getUserData() as Tag | null;
      const ub = c.getFixtureB().getBody().getUserData() as Tag | null;
      const gem = ua?.kind === 'gem' ? ua : ub?.kind === 'gem' ? ub : null;
      if (!gem) return;
      const other = gem === ua ? ub : ua;
      const va = c.getFixtureA().getBody().getLinearVelocity(), vb = c.getFixtureB().getBody().getLinearVelocity();
      const speed = Math.hypot(va.x - vb.x, va.y - vb.y);
      if (speed > 2.5 && other?.kind !== 'finger') {
        const p = this.gems[gem.id].body.getPosition();
        this.events.push({ t: 'clack', x: p.x, y: p.y, speed });
      }
    });
  }

  get time(): number {
    return this.tick / HZ;
  }

  get timeLeft(): number {
    return Math.max(0, this.cfg.timeLimit - this.time);
  }

  /** 開き具合 0（閉）〜1（開）。描画とボット用 */
  get openness(): number {
    const L = this.fingers[0].joint.getJointAngle();
    return Math.max(0, Math.min(1, (L + 0.28) / (0.95 + 0.28)));
  }

  /** 指先（2本の鉤の真ん中）の位置 */
  get tip(): { x: number; y: number } {
    const p = this.head.getPosition();
    return { x: p.x, y: p.y + 0.15 + FINGER_L * Math.cos(this.openness * 0.9) };
  }

  /** 指に挟まれている（両方の指に触れている、または指の上に乗って持ち上がっている）宝石 */
  heldGems(): Gem[] {
    return this.gems.filter((g) => g.state === 'free' && this.wasHeld.has(g.id));
  }

  /**
   * 1ティック進める。target があれば爪の頭はその位置へ向かう（マウス・ボット）。なければビットの向きへ
   */
  step(bits: number, target?: { x: number; y: number }): void {
    this.events = [];
    this.tick++;
    const cfg = this.cfg;
    const playing = this.phase === 'play';
    // ---- 爪の頭：目標の速さへ加速（少し慣性） ----
    const p = this.head.getPosition();
    let want = { x: 0, y: 0 };
    if (playing) {
      if (target) {
        const dx = target.x - p.x, dy = target.y - p.y, d = Math.hypot(dx, dy);
        const sp = Math.min(cfg.clawSpeed, d * 6);
        if (d > 1e-3) want = { x: (dx / d) * sp, y: (dy / d) * sp };
      } else {
        const ix = ((bits & IN_RIGHT) ? 1 : 0) - ((bits & IN_LEFT) ? 1 : 0);
        const iy = ((bits & IN_DOWN) ? 1 : 0) - ((bits & IN_UP) ? 1 : 0);
        want = { x: ix * cfg.clawSpeed, y: iy * cfg.clawSpeed * 0.8 };
      }
    }
    const a = cfg.clawAccel * DT;
    this.vel.x += Math.max(-a, Math.min(a, want.x - this.vel.x));
    this.vel.y += Math.max(-a, Math.min(a, want.y - this.vel.y));
    // 動ける範囲（天井のレールから床の少し上まで、左右の壁の内側）
    const nx = p.x + this.vel.x * DT, ny = p.y + this.vel.y * DT;
    const minY = RAIL_Y + 0.6, maxY = FLOOR_Y - FINGER_L - 0.35;
    if (nx < 0.9 || nx > WORLD_W - 0.9) this.vel.x = 0;
    if (ny < minY || ny > maxY) this.vel.y = 0;
    this.head.setLinearVelocity({ x: this.vel.x, y: this.vel.y });
    // ---- 指：押している間だけ開く／閉じる。放すとその角度で止まる ----
    const dir = playing ? ((bits & IN_OPEN) ? 1 : 0) - ((bits & IN_CLOSE) ? 1 : 0) : 0;
    const fl = this.fingers[0].joint;
    fl.setMaxMotorTorque(cfg.fingerTorque * 2);
    fl.setMotorSpeed(dir * cfg.fingerSpeed);
    this.world.step(DT, 10, 4);
    this.afterStep();
  }

  private afterStep(): void {
    // 指に触れている宝石を数える（両方の指 → 挟んでいる）
    this.touching.clear();
    for (const f of this.fingers) {
      for (let ce = f.body.getContactList(); ce; ce = ce.next!) {
        if (!ce.contact.isTouching()) continue;
        const u = ce.other!.getUserData() as Tag | null;
        if (u?.kind !== 'gem') continue;
        this.touching.set(u.id, (this.touching.get(u.id) ?? 0) | (f.side === 'L' ? 1 : 2));
      }
    }
    const hp = this.head.getPosition();
    const nowHeld = new Set<number>();
    for (const [id, m] of this.touching) {
      const g = this.gems[id];
      if (g.state !== 'free') continue;
      // 両方の指に触れていて、床から浮いている（指の高さにある）
      const q = g.body.getPosition();
      if (m === 3 && q.y < hp.y + FINGER_L + 0.8) nowHeld.add(id);
    }
    for (const id of nowHeld) if (!this.wasHeld.has(id)) {
      const q = this.gems[id].body.getPosition();
      this.events.push({ t: 'grip', x: q.x, y: q.y });
    }
    for (const id of this.wasHeld) if (!nowHeld.has(id)) {
      const q = this.gems[id].body.getPosition();
      this.events.push({ t: 'drop', id, x: q.x, y: q.y });
    }
    this.wasHeld = nowHeld;
    // 宝石箱：中で落ち着いたら納まる
    for (const g of this.gems) {
      if (g.state !== 'free') continue;
      const q = g.body.getPosition();
      const box = this.stage.boxes.find((b) => q.x > b.x && q.x < b.x + b.w && q.y > b.y - 0.1 && q.y < b.y + b.h + 0.1);
      const v = g.body.getLinearVelocity();
      if (box && !this.touching.has(g.id) && Math.hypot(v.x, v.y) < 0.8) g.calm++;
      else g.calm = 0;
      if (box && g.calm >= Math.round(this.cfg.settle * HZ)) {
        g.state = 'home';
        this.combo = this.lastKind === g.kind ? this.combo + 1 : 1;
        this.lastKind = g.kind;
        const value = GEMS[g.kind].value;
        const gain = value * box.mult;
        this.score += gain;
        this.world.destroyBody(g.body);
        this.events.push({ t: 'home', id: g.id, x: q.x, y: q.y, value, mult: box.mult, total: this.score, combo: this.combo });
      }
      if (q.y > WORLD_H + 2) g.state = 'home';
    }
    if (this.phase !== 'play') return;
    if (this.score >= this.stage.need) {
      this.phase = 'clear';
      this.events.push({ t: 'clear' });
      return;
    }
    const best = Math.max(...this.stage.boxes.map((b) => b.mult));
    const left = this.gems.filter((g) => g.state === 'free').reduce((a, g) => a + GEMS[g.kind].value * best, 0);
    if (this.timeLeft <= 0 || this.score + left < this.stage.need) {
      this.phase = 'fail';
      this.events.push({ t: 'fail' });
    }
  }

  digest(): number[] {
    const p = this.head.getPosition();
    const out = [this.tick, this.score, p.x, p.y, this.openness];
    for (const g of this.gems) {
      if (g.state !== 'free') { out.push(-1); continue; }
      const q = g.body.getPosition();
      out.push(q.x, q.y, g.body.getAngle());
    }
    return out;
  }
}
