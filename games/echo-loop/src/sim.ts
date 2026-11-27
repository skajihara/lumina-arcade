/**
 * Echo Loop（残響ループ）のシミュレーション（描画なし）。EL-20b で「一筆のループ」に作り直した。
 *
 * - 球は1つだけ。自分のフリッパーで最後まで操作する（残響＝過去の自分の再生は出さない）
 * - 球が落ちると「次の周」：同じ球が発射レーンへ戻る。前の周で灯した星はそのまま残る
 * - 星座の線の両端が灯ると、その線が「光の弦」になって球を弾く（盤面が自分の進みで変わる）
 *   → 弦は助けにも壁にもなる。灯す順番を考えないと、奥の星への道を自分で塞ぐ
 *   → 速い球（snapSpeed 以上）で弦に当たると、弦が切れて通り抜ける（その周のあいだだけ。次の周で張り直す）
 * - 灯った星にもう一度当てると、ポップバンパーとして強く弾く
 * - 星座の星が全部灯ると「完成」：その星座の弦が一斉に鳴り、球が大きく弾かれる
 * - 全部の星を灯せばクリア。周（球）の数には上限があり、少ない周でクリアするほど★
 *
 * Nova Pinball の盤面の形（boardWalls・フリッパーの位置）を流用する。決定的（固定ステップ・乱数なし）。
 * 前の「10 秒のループで過去の自分（残響）が再生される」仕組みは、11/27 の感想（画面が忙しい・自分の腕で攻略したい）でやめた。
 */
import { World, Chain, Circle, Polygon, Edge, RevoluteJoint, type Body, type Contact } from 'planck';
import { boardWalls, PIVOT_L, PIVOT_R, BALL_R, FIELD_RIGHT, BOARD_H } from '../../nova-pinball/src/sim';

export const HZ = 120;
export const DT = 1 / HZ;
export const IN_LEFT = 1;
export const IN_RIGHT = 2;
export const IN_LAUNCH = 4;

export interface EchoSimConfig {
  gravity: number;
  flipperSpeed: number;
  flipperTorque: number;
  flipperLength: number;
  ballRestitution: number;
  /** 灯っていない星に当たった時の弾き */
  hitKick: number;
  /** 灯った星（バンパー）の弾き */
  bumperKick: number;
  /** 光の弦の弾き（反発に足す速さ） */
  stringKick: number;
  /** 星座の完成で球に足す速さ */
  completeKick: number;
  launchMin: number;
  launchMax: number;
  /** 周（球）の上限 */
  maxLoops: number;
  /** この速さ以上で当たると弦が切れる */
  snapSpeed: number;
}

export const defaults: EchoSimConfig = {
  gravity: 21, flipperSpeed: 24, flipperTorque: 2600, flipperLength: 2.2, ballRestitution: 0.45,
  hitKick: 3.5, bumperKick: 7, stringKick: 4, completeKick: 12,
  launchMin: 24, launchMax: 34, maxLoops: 5, snapSpeed: 15,
};

export interface StarDef { x: number; y: number; group: number }
export interface EchoStage {
  id: string;
  name: string;
  hint: string;
  stars: StarDef[];
  /** 星座の線（星の番号の組）。両端が灯ると光の弦になる */
  links: [number, number][];
  groupNames: string[];
  /** ★3 の周の数（これ以内） */
  par: number;
}

export const STAR_R = 0.42;

export type EchoEvent =
  | { t: 'flip'; side: 'L' | 'R' }
  | { t: 'launch'; power: number }
  | { t: 'light'; star: number; x: number; y: number; loop: number }
  | { t: 'bump'; star: number; x: number; y: number }
  | { t: 'string'; link: number; x: number; y: number; speed: number }
  | { t: 'strung'; link: number }
  | { t: 'snap'; link: number; x: number; y: number }
  | { t: 'complete'; group: number; x: number; y: number }
  | { t: 'drain'; loop: number }
  | { t: 'loop'; loop: number }
  | { t: 'clear'; loops: number }
  | { t: 'fail' };

type Tag = { kind: 'wall' } | { kind: 'ball' } | { kind: 'star'; id: number } | { kind: 'string'; id: number } | { kind: 'flipper'; side: 'L' | 'R' };

export interface EchoStar extends StarDef { id: number; lit: boolean; litLoop: number; lastHit: number }

export class EchoSim {
  world: World;
  cfg: EchoSimConfig;
  tick = 0;
  /** 今の周（1 始まり） */
  loop = 1;
  phase: 'play' | 'clear' | 'fail' = 'play';
  stars: EchoStar[];
  /** 弦になった線（links の番号） */
  strung = new Set<number>();
  /** 星座ごとの完成 */
  complete: boolean[];
  ball: Body;
  launched = false;
  launchCharge = 0;
  events: EchoEvent[] = [];
  flippers: { side: 'L' | 'R'; body: Body; joint: RevoluteJoint; pivot: { x: number; y: number } }[] = [];
  /** 弦が最後に弾いた時刻（描画の震え用） */
  pluck = new Map<number, number>();
  private ground: Body;
  private prevInput = 0;
  private contacts: { a: Tag; b: Tag; ba: Body; bb: Body; rel: number }[] = [];
  /** 弦の両端（星の縁から縁） */
  strings = new Map<number, { x1: number; y1: number; x2: number; y2: number }>();
  /** この周で切れた弦 */
  snapped = new Set<number>();
  private stringBodies = new Map<number, Body>();

  constructor(public stage: EchoStage, cfg: EchoSimConfig = defaults) {
    this.cfg = { ...cfg };
    this.world = new World({ gravity: { x: 0, y: this.cfg.gravity } });
    this.ground = this.world.createBody({ type: 'static', userData: { kind: 'wall' } as Tag });
    for (const line of boardWalls({})) this.ground.createFixture(new Chain(line, false), { friction: 0.1, restitution: 0.3 });
    this.stars = stage.stars.map((d, id) => ({ ...d, id, lit: false, litLoop: 0, lastHit: -999 }));
    for (const s of this.stars) {
      const b = this.world.createBody({ type: 'static', position: { x: s.x, y: s.y }, userData: { kind: 'star', id: s.id } as Tag });
      b.createFixture(new Circle(STAR_R), { restitution: 0.5, friction: 0.05 });
    }
    this.complete = stage.groupNames.map(() => false);
    this.addFlippers();
    this.ball = this.world.createBody({ type: 'dynamic', position: { x: 13.8, y: 23.8 }, bullet: true, userData: { kind: 'ball' } as Tag });
    this.ball.createFixture(new Circle(BALL_R), { density: 1, friction: 0.08, restitution: this.cfg.ballRestitution });
    this.world.on('begin-contact', (c: Contact) => {
      const ba = c.getFixtureA().getBody(), bb = c.getFixtureB().getBody();
      const a = ba.getUserData() as Tag, b = bb.getUserData() as Tag;
      const va = ba.getLinearVelocity(), vb = bb.getLinearVelocity();
      this.contacts.push({ a, b, ba, bb, rel: Math.hypot(va.x - vb.x, va.y - vb.y) });
    });
    // 速い球は弦を切って通り抜ける
    this.world.on('pre-solve', (c: Contact) => {
      const a = c.getFixtureA().getBody().getUserData() as Tag, b = c.getFixtureB().getBody().getUserData() as Tag;
      const st = a.kind === 'string' ? a : b.kind === 'string' ? b : null;
      if (!st || st.kind !== 'string') return;
      if (this.snapped.has(st.id)) { c.setEnabled(false); return; }
      const v = this.ball.getLinearVelocity();
      if (Math.hypot(v.x, v.y) >= this.cfg.snapSpeed) {
        c.setEnabled(false);
        this.snapped.add(st.id);
        const p = this.ball.getPosition();
        this.events.push({ t: 'snap', link: st.id, x: p.x, y: p.y });
      }
    });
  }

  private addFlippers(): void {
    const L = this.cfg.flipperLength;
    for (const [side, pivot] of [['L', PIVOT_L], ['R', PIVOT_R]] as const) {
      const s = side === 'L' ? 1 : -1;
      const body = this.world.createBody({ type: 'dynamic', position: pivot, bullet: true, gravityScale: 0, userData: { kind: 'flipper', side } as Tag });
      const fd = { density: 3, friction: 0.2, restitution: 0.15 };
      body.createFixture(new Polygon([{ x: 0, y: -0.26 }, { x: s * L, y: -0.11 }, { x: s * L, y: 0.11 }, { x: 0, y: 0.26 }]), fd);
      body.createFixture(new Circle({ x: 0, y: 0 }, 0.26), fd);
      body.createFixture(new Circle({ x: s * L, y: 0 }, 0.11), fd);
      const joint = this.world.createJoint(new RevoluteJoint({
        enableLimit: true, lowerAngle: side === 'L' ? -0.45 : -0.5, upperAngle: side === 'L' ? 0.5 : 0.45,
        enableMotor: true, maxMotorTorque: this.cfg.flipperTorque, motorSpeed: 0,
      }, this.ground, body, pivot))!;
      this.flippers.push({ side, body, joint, pivot });
    }
  }

  get time(): number { return this.tick / HZ; }
  get litCount(): number { return this.stars.filter((s) => s.lit).length; }

  /** 灯す：両端が灯った線を弦にし、星座の完成を調べる */
  private light(s: EchoStar): void {
    s.lit = true;
    s.litLoop = this.loop;
    this.events.push({ t: 'light', star: s.id, x: s.x, y: s.y, loop: this.loop });
    this.stage.links.forEach(([a, b], i) => {
      if (this.strung.has(i) || !this.stars[a].lit || !this.stars[b].lit) return;
      this.strung.add(i);
      // 弦：星の縁から縁までの線（星そのものとは重ならない）
      const A = this.stars[a], B = this.stars[b];
      const d = Math.hypot(B.x - A.x, B.y - A.y), ux = (B.x - A.x) / d, uy = (B.y - A.y) / d;
      const body = this.world.createBody({ type: 'static', userData: { kind: 'string', id: i } as Tag });
      const seg = { x1: A.x + ux * STAR_R, y1: A.y + uy * STAR_R, x2: B.x - ux * STAR_R, y2: B.y - uy * STAR_R };
      body.createFixture(new Edge({ x: seg.x1, y: seg.y1 }, { x: seg.x2, y: seg.y2 }), { restitution: 0.85, friction: 0 });
      this.strings.set(i, seg);
      this.stringBodies.set(i, body);
      this.events.push({ t: 'strung', link: i });
    });
    const g = s.group;
    if (!this.complete[g] && this.stars.every((q) => q.group !== g || q.lit)) {
      this.complete[g] = true;
      const ms = this.stars.filter((q) => q.group === g);
      const cx = ms.reduce((a, q) => a + q.x, 0) / ms.length, cy = ms.reduce((a, q) => a + q.y, 0) / ms.length;
      this.events.push({ t: 'complete', group: g, x: cx, y: cy });
      // 完成の衝撃：球を星座の中心から外へ弾く
      const p = this.ball.getPosition();
      this.kick(p.x - cx, p.y - cy, this.cfg.completeKick);
      for (const [i] of this.stage.links.entries()) if (this.strung.has(i) && ms.some((q) => q.id === this.stage.links[i][0])) this.pluck.set(i, this.tick);
    }
    if (this.stars.every((q) => q.lit)) {
      this.phase = 'clear';
      this.events.push({ t: 'clear', loops: this.loop });
    }
  }

  private kick(dx: number, dy: number, sp: number): void {
    const d = Math.hypot(dx, dy) || 1;
    const v = this.ball.getLinearVelocity();
    this.ball.setLinearVelocity({ x: v.x + (dx / d) * sp, y: v.y + (dy / d) * sp });
  }

  canLaunch(): boolean {
    const p = this.ball.getPosition(), v = this.ball.getLinearVelocity();
    return p.x > FIELD_RIGHT && p.y > BOARD_H * 0.45 && v.y > -4;
  }

  step(input: number): void {
    this.events = [];
    const cfg = this.cfg;
    const pressed = input & ~this.prevInput, released = ~input & this.prevInput;
    for (const f of this.flippers) {
      const bit = f.side === 'L' ? IN_LEFT : IN_RIGHT;
      const dir = f.side === 'L' ? -1 : 1;
      f.joint.setMotorSpeed((input & bit) ? dir * cfg.flipperSpeed : -dir * cfg.flipperSpeed * 0.7);
      if (pressed & bit) this.events.push({ t: 'flip', side: f.side });
    }
    if (input & IN_LAUNCH) this.launchCharge = Math.min(1, this.launchCharge + DT / 0.9);
    if (released & IN_LAUNCH) {
      if (this.canLaunch() && this.phase === 'play') {
        const v = cfg.launchMin + (cfg.launchMax - cfg.launchMin) * this.launchCharge;
        this.ball.setLinearVelocity({ x: 0, y: -v });
        this.ball.setAwake(true);
        this.launched = true;
        this.events.push({ t: 'launch', power: this.launchCharge });
      }
      this.launchCharge = 0;
    }
    this.prevInput = input;
    this.world.step(DT, 8, 3);
    this.tick++;
    for (const c of this.contacts) {
      const ball = c.a.kind === 'ball' ? c.ba : c.b.kind === 'ball' ? c.bb : null;
      const other = c.a.kind === 'ball' ? c.b : c.a;
      if (!ball || this.phase !== 'play') continue;
      if (other.kind === 'star') {
        const s = this.stars[other.id];
        if (this.tick - s.lastHit < 10) continue;
        s.lastHit = this.tick;
        const p = ball.getPosition();
        if (!s.lit) {
          this.kick(p.x - s.x, p.y - s.y, cfg.hitKick);
          this.light(s);
        } else {
          this.kick(p.x - s.x, p.y - s.y, cfg.bumperKick);
          this.events.push({ t: 'bump', star: s.id, x: s.x, y: s.y });
        }
      } else if (other.kind === 'string' && !this.snapped.has(other.id)) {
        // 弦：はじく。少し速さを足して、鳴る
        const p = ball.getPosition();
        const g = this.strings.get(other.id)!;
        const nx = -(g.y2 - g.y1), ny = g.x2 - g.x1;
        const side = (p.x - g.x1) * nx + (p.y - g.y1) * ny > 0 ? 1 : -1;
        this.kick(nx * side, ny * side, cfg.stringKick);
        this.pluck.set(other.id, this.tick);
        this.events.push({ t: 'string', link: other.id, x: p.x, y: p.y, speed: c.rel });
      }
    }
    this.contacts = [];
    if (this.phase !== 'play') return;
    // 落ちた：次の周へ（灯した星と弦はそのまま）
    const p = this.ball.getPosition();
    if (p.y > BOARD_H + 0.8) {
      this.events.push({ t: 'drain', loop: this.loop });
      if (this.loop >= cfg.maxLoops) {
        this.phase = 'fail';
        this.events.push({ t: 'fail' });
        return;
      }
      this.loop++;
      this.ball.setTransform({ x: 13.8, y: 23.8 }, 0);
      this.ball.setLinearVelocity({ x: 0, y: 0 });
      this.ball.setAngularVelocity(0);
      this.launched = false;
      this.snapped.clear();
      this.events.push({ t: 'loop', loop: this.loop });
    }
  }

  /** ★：目安（par）以内で★3、目安＋1 以内で★2、それ以外のクリアで★1 */
  rating(): number {
    if (this.phase !== 'clear') return 0;
    return this.loop <= this.stage.par ? 3 : this.loop <= this.stage.par + 1 ? 2 : 1;
  }

  /** 決定性の確認用 */
  digest(): number[] {
    const p = this.ball.getPosition(), v = this.ball.getLinearVelocity();
    return [this.tick, this.loop, this.litCount, this.strung.size, p.x, p.y, v.x, v.y];
  }
}
