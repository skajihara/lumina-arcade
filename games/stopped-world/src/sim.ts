/**
 * Stopped World のシミュレーション（描画なし）。
 *
 * - 時間を止めている間は世界が進まない（ゲージだけ減る）。止めた世界で物体を叩くと、その場では動かず「力の矢印」が溜まる
 * - 時間を戻した瞬間、溜めた力が全部同時に効く（速度の変化として加える）
 * - 爆弾は叩くと爆発する。止めている間に叩いた爆弾は、膨らみかけで止まり、時間が戻った瞬間に爆発する
 * - 目的：卵を巣へ運ぶ（強くぶつけると割れる）／箱を全部壊す
 *
 * 入力はティックごとの「操作」の列（停止の切り替え・叩く）。同じ操作の列なら同じ結果になる（決定的）。
 */
import { World, Box, Circle, Edge, type Body, type Contact } from 'planck';
import type { StopConfig } from './config';

export const HZ = 120;
export const DT = 1 / HZ;
export const WORLD_W = 20;
export const WORLD_H = 12;

export type Kind = 'egg' | 'crate' | 'bomb' | 'rock' | 'ball' | 'plank';

export interface ObjDef {
  kind: Kind;
  x: number;
  y: number;
  /** 箱・板：幅と高さ。丸：半径 w */
  w: number;
  h?: number;
  angle?: number;
  /** 固定（動かない足場） */
  fixed?: boolean;
}

export interface StageDef {
  id: string;
  name: string;
  hint: string;
  goal: 'nest' | 'destroy';
  /** 巣（卵を運ぶ先）の範囲 */
  nest?: { x: number; y: number; w: number; h: number };
  objects: ObjDef[];
  /** 地面以外の固定の足場（折れ線） */
  ground?: { x: number; y: number }[][];
}

export interface Obj {
  id: number;
  def: ObjDef;
  body: Body;
  alive: boolean;
  /** 溜めている力（速度の変化） */
  force: { x: number; y: number };
  /** 叩いた場所（矢印の根元。物体の中心からのずれ） */
  at: { x: number; y: number };
  /** 爆弾：時間が戻ったら爆発する */
  armed: boolean;
}

export type Action =
  | { t: 'stop' }
  | { t: 'resume' }
  | { t: 'hit'; id: number; dx: number; dy: number; px?: number; py?: number; power?: number };

export type StopEvent =
  | { t: 'stop' }
  | { t: 'resume'; forces: number }
  | { t: 'hit'; id: number; x: number; y: number }
  | { t: 'break'; id: number; kind: Kind; x: number; y: number }
  | { t: 'boom'; id: number; x: number; y: number; r: number }
  | { t: 'nest' }
  /** ひねり1：壊した分だけ時間停止ゲージが戻った */
  | { t: 'refill'; x: number; y: number; amount: number }
  | { t: 'clear' }
  | { t: 'fail'; why: 'egg' | 'stuck' | 'fall' };

export type Phase = 'play' | 'clear' | 'fail';

type Tag = { kind: 'obj'; id: number } | { kind: 'wall' };

export class StopSim {
  world: World;
  tick = 0;
  /** 世界が進んだティック数（止めている間は増えない） */
  worldTick = 0;
  phase: Phase = 'play';
  stopped = false;
  gauge: number;
  forcesThisStop = 0;
  objs: Obj[] = [];
  events: StopEvent[] = [];
  /** 卵が巣の中で静かにしている時間 */
  private nestTime = 0;
  /** 全部が止まっていて、ゲージも尽きている時間 */
  private stillTime = 0;
  private hits: { a: Obj | null; b: Obj | null; speed: number }[] = [];

  constructor(public stage: StageDef, public cfg: StopConfig) {
    this.world = new World({ gravity: { x: 0, y: cfg.gravity } });
    this.gauge = cfg.stopGauge;
    const ground = this.world.createBody({ type: 'static', userData: { kind: 'wall' } as Tag });
    // 床・左右の壁（上は開いている）
    ground.createFixture(new Edge({ x: 0, y: WORLD_H }, { x: WORLD_W, y: WORLD_H }), { friction: 0.6 });
    ground.createFixture(new Edge({ x: 0, y: -10 }, { x: 0, y: WORLD_H }), { friction: 0.3 });
    ground.createFixture(new Edge({ x: WORLD_W, y: -10 }, { x: WORLD_W, y: WORLD_H }), { friction: 0.3 });
    for (const line of stage.ground ?? []) {
      for (let i = 1; i < line.length; i++) ground.createFixture(new Edge(line[i - 1], line[i]), { friction: 0.6 });
    }
    stage.objects.forEach((d) => this.addObj(d));
    this.world.on('begin-contact', (c: Contact) => this.onImpact(c));
  }

  private addObj(d: ObjDef): void {
    const id = this.objs.length;
    const body = this.world.createBody({
      type: d.fixed ? 'static' : 'dynamic',
      position: { x: d.x, y: d.y },
      angle: d.angle ?? 0,
      // 丸いものは転がり続けないよう少しだけ減衰させる（卵が巣で止まれるように）
      angularDamping: 1.2,
      linearDamping: 0.15,
      userData: { kind: 'obj', id } as Tag,
    });
    const round = d.kind === 'egg' || d.kind === 'ball' || d.kind === 'bomb';
    const density = d.kind === 'rock' ? 3 : d.kind === 'egg' ? 0.8 : 1;
    if (round) body.createFixture(new Circle(d.w), { density, friction: 0.4, restitution: d.kind === 'ball' ? 0.6 : 0.2 });
    else body.createFixture(new Box(d.w / 2, (d.h ?? d.w) / 2), { density, friction: 0.6, restitution: 0.1 });
    this.objs.push({ id, def: d, body, alive: true, force: { x: 0, y: 0 }, at: { x: 0, y: 0 }, armed: false });
  }

  private onImpact(c: Contact): void {
    const ua = c.getFixtureA().getBody().getUserData() as Tag | null;
    const ub = c.getFixtureB().getBody().getUserData() as Tag | null;
    const a = ua?.kind === 'obj' ? this.objs[ua.id] : null;
    const b = ub?.kind === 'obj' ? this.objs[ub.id] : null;
    const va = c.getFixtureA().getBody().getLinearVelocity();
    const vb = c.getFixtureB().getBody().getLinearVelocity();
    // 衝撃の強さは「ぶつかる向き（法線）」の速さの差。床の上を転がるだけでは割れない
    const n = c.getWorldManifold(null)?.normal ?? { x: 0, y: 0 };
    const speed = Math.abs((va.x - vb.x) * n.x + (va.y - vb.y) * n.y);
    this.hits.push({ a, b, speed });
  }

  get time(): number {
    return this.tick / HZ;
  }

  obj(id: number): Obj | undefined {
    return this.objs[id];
  }

  /** 1ティック進める。actions はこのティックの操作 */
  step(actions: Action[] = []): void {
    this.events = [];
    this.tick++;
    if (this.phase !== 'play') {
      if (!this.stopped) this.advance();
      return;
    }
    for (const a of actions) this.apply(a);
    if (this.stopped) {
      this.gauge = Math.max(0, this.gauge - DT);
      if (this.gauge <= 0) this.resume();
      return;
    }
    this.advance();
    this.checkGoal();
  }

  private apply(a: Action): void {
    if (a.t === 'stop') {
      if (this.stopped || this.gauge <= 0) return;
      this.stopped = true;
      this.forcesThisStop = 0;
      this.events.push({ t: 'stop' });
    } else if (a.t === 'resume') {
      if (this.stopped) this.resume();
    } else if (a.t === 'hit') {
      const o = this.objs[a.id];
      if (!o || !o.alive || o.def.fixed) return;
      if (!this.stopped) return; // 叩けるのは止めている間だけ
      if (this.forcesThisStop >= Math.round(this.cfg.maxForces)) return;
      this.forcesThisStop++;
      const len = Math.hypot(a.dx, a.dy) || 1;
      // power：パチンコ式で引いた強さ（なければ 1＝一定の力）
      const k = this.cfg.forcePerHit * Math.max(0, a.power ?? 1);
      o.force.x += (a.dx / len) * k;
      o.force.y += (a.dy / len) * k;
      const m = Math.hypot(o.force.x, o.force.y);
      if (m > this.cfg.maxForce) {
        o.force.x *= this.cfg.maxForce / m;
        o.force.y *= this.cfg.maxForce / m;
      }
      o.at = { x: a.px ?? 0, y: a.py ?? 0 };
      if (o.def.kind === 'bomb') o.armed = true;
      const p = o.body.getPosition();
      this.events.push({ t: 'hit', id: o.id, x: p.x, y: p.y });
    }
  }

  /** 時間を戻す：溜めた力が全部同時に効く */
  private resume(): void {
    this.stopped = false;
    let n = 0;
    const ev: StopEvent = { t: 'resume', forces: 0 };
    this.events.push(ev);
    for (const o of this.objs) {
      if (!o.alive) continue;
      if (o.armed) {
        o.armed = false;
        this.explode(o);
        continue;
      }
      if (o.force.x !== 0 || o.force.y !== 0) {
        n++;
        const v = o.body.getLinearVelocity();
        if (this.redirect) {
          // ひねり2：今の速さを保ったまま、矢印の向きへ曲げてから力を足す（飛んでいる物を止めて向きを変える）
          const f = Math.hypot(o.force.x, o.force.y);
          const sp = Math.hypot(v.x, v.y) + f;
          o.body.setLinearVelocity({ x: (o.force.x / f) * sp, y: (o.force.y / f) * sp });
        } else o.body.setLinearVelocity({ x: v.x + o.force.x, y: v.y + o.force.y });
        // 端を叩いたら回る
        o.body.setAngularVelocity(o.body.getAngularVelocity() + (o.at.x * o.force.y - o.at.y * o.force.x) * 0.6);
        o.body.setAwake(true);
        o.force = { x: 0, y: 0 };
      }
    }
    ev.forces = n;
  }

  private get refills(): boolean {
    const t = Math.round(this.cfg.twist ?? 0);
    return t === 1 || t === 3;
  }

  private get redirect(): boolean {
    const t = Math.round(this.cfg.twist ?? 0);
    return t === 2 || t === 3;
  }

  /** ひねり1：壊すたびにゲージが少し戻る（連鎖するほど、もう一度止められる） */
  private refill(x: number, y: number): void {
    if (!this.refills || this.phase !== 'play') return;
    const before = this.gauge;
    this.gauge = Math.min(this.cfg.stopGauge, this.gauge + this.cfg.refill);
    if (this.gauge > before) this.events.push({ t: 'refill', x, y, amount: this.gauge - before });
  }

  private explode(o: Obj): void {
    const p = o.body.getPosition().clone();
    this.kill(o);
    this.refill(p.x, p.y);
    const R = this.cfg.bombRadius;
    this.events.push({ t: 'boom', id: o.id, x: p.x, y: p.y, r: R });
    for (const q of this.objs) {
      if (!q.alive || q.def.fixed) continue;
      const qp = q.body.getPosition();
      const dx = qp.x - p.x, dy = qp.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > R) continue;
      const k = this.cfg.bombForce * (1 - d / R) + 2;
      if (q.def.kind === 'bomb') {
        q.armed = false;
        this.explode(q);
        continue;
      }
      if (q.def.kind === 'crate' && k > this.cfg.crateBreak) {
        this.breakObj(q);
        continue;
      }
      const v = q.body.getLinearVelocity();
      q.body.setLinearVelocity({ x: v.x + (dx / (d || 1)) * k, y: v.y + (dy / (d || 1)) * k - 2 });
      q.body.setAwake(true);
    }
  }

  private kill(o: Obj): void {
    o.alive = false;
    this.world.destroyBody(o.body);
  }

  private breakObj(o: Obj): void {
    const p = o.body.getPosition();
    this.events.push({ t: 'break', id: o.id, kind: o.def.kind, x: p.x, y: p.y });
    const x = p.x, y = p.y;
    this.kill(o);
    if (o.def.kind === 'egg') this.fail('egg');
    else if (o.def.kind === 'crate') this.refill(x, y);
  }

  private advance(): void {
    this.world.step(DT, 8, 3);
    this.worldTick++;
    // 衝撃で割れる・壊れる
    for (const h of this.hits) {
      for (const o of [h.a, h.b]) {
        if (!o || !o.alive) continue;
        if (o.def.kind === 'egg' && h.speed > this.cfg.eggBreak) this.breakObj(o);
        else if (o.def.kind === 'crate' && h.speed > this.cfg.crateBreak) this.breakObj(o);
        else if (o.def.kind === 'bomb' && h.speed > this.cfg.crateBreak * 1.4) this.explode(o);
      }
    }
    this.hits = [];
    // 巣は卵を受け止める：巣の中では卵の勢いが早く落ちる（ぴたりと収まる手触り）
    const egg = this.stage.nest ? this.objs.find((o) => o.def.kind === 'egg' && o.alive) : undefined;
    if (egg) {
      const inNest = this.eggInNest();
      egg.body.setLinearDamping(inNest ? this.cfg.nestGrip : 0.15);
      egg.body.setAngularDamping(inNest ? 1.2 + this.cfg.nestGrip : 1.2);
    }
    // 画面の外へ落ちた
    for (const o of this.objs) {
      if (!o.alive) continue;
      const p = o.body.getPosition();
      if (p.y > WORLD_H + 3 || p.x < -3 || p.x > WORLD_W + 3) {
        this.kill(o);
        if (o.def.kind === 'egg') this.fail('fall');
      }
    }
  }

  private fail(why: 'egg' | 'stuck' | 'fall'): void {
    if (this.phase !== 'play') return;
    this.phase = 'fail';
    this.events.push({ t: 'fail', why });
  }

  /** 卵が巣の中にあるか */
  eggInNest(): boolean {
    const n = this.stage.nest;
    if (!n) return false;
    const egg = this.objs.find((o) => o.def.kind === 'egg' && o.alive);
    if (!egg) return false;
    const p = egg.body.getPosition();
    return p.x > n.x - n.w / 2 && p.x < n.x + n.w / 2 && p.y > n.y - n.h / 2 && p.y < n.y + n.h / 2;
  }

  /** 全部の物体が止まっているか */
  settled(): boolean {
    return this.objs.every((o) => !o.alive || o.def.fixed || Math.hypot(o.body.getLinearVelocity().x, o.body.getLinearVelocity().y) < 0.08);
  }

  private checkGoal(): void {
    if (this.phase !== 'play') return;
    if (this.stage.goal === 'nest') {
      if (this.eggInNest()) {
        const v = this.objs.find((o) => o.def.kind === 'egg')!.body.getLinearVelocity();
        this.nestTime = Math.hypot(v.x, v.y) < 0.5 ? this.nestTime + DT : 0;
        if (this.nestTime > 0.6) this.win();
      } else this.nestTime = 0;
    } else if (this.objs.every((o) => o.def.kind !== 'crate' || !o.alive)) this.win();
    // ゲージが尽きて、全部止まって1.5秒たったら失敗
    if (this.phase === 'play' && this.gauge <= 0 && this.settled()) {
      this.stillTime += DT;
      if (this.stillTime > 1.5) this.fail('stuck');
    } else this.stillTime = 0;
  }

  private win(): void {
    this.phase = 'clear';
    if (this.stage.goal === 'nest') this.events.push({ t: 'nest' });
    this.events.push({ t: 'clear' });
  }

  /**
   * 今の状態を写した別の世界を作る（予測線用）。
   * 位置・速度・角度・溜めた力・点火を写す。接触の内部状態は写らないので、厳密には少しずれる。
   */
  clone(): StopSim {
    const c = new StopSim(this.stage, this.cfg);
    c.gauge = this.gauge;
    c.stopped = this.stopped;
    c.forcesThisStop = this.forcesThisStop;
    for (const o of this.objs) {
      const q = c.objs[o.id];
      if (!o.alive) {
        c.kill(q);
        continue;
      }
      q.body.setTransform(o.body.getPosition(), o.body.getAngle());
      q.body.setLinearVelocity(o.body.getLinearVelocity());
      q.body.setAngularVelocity(o.body.getAngularVelocity());
      q.body.setAwake(o.body.isAwake());
      q.force = { ...o.force };
      q.at = { ...o.at };
      q.armed = o.armed;
    }
    return c;
  }

  /**
   * 今すぐ時間を戻したら、各物体がどう動くかを先読みする（seconds 秒、every ティックごとの点）。
   * 動く物体だけを返す。爆発や破壊も先読みの中で起きる（消えた所で線が終わる）。
   * extra：先読みの前に足す操作（ドラッグ中の、まだ置いていない力）。
   */
  predict(seconds = 1, every = 4, extra: Action[] = []): { id: number; kind: Kind; pts: { x: number; y: number }[]; ends: 'alive' | 'gone' }[] {
    const c = this.clone();
    c.events = [];
    for (const a of extra) c.apply(a);
    if (c.stopped) c.resume();
    const start = this.objs.map((o) => (o.alive ? o.body.getPosition().clone() : null));
    const paths = this.objs.map((o) => (o.alive && !o.def.fixed ? [{ x: o.body.getPosition().x, y: o.body.getPosition().y }] : []));
    const n = Math.round(seconds * HZ);
    for (let i = 1; i <= n; i++) {
      c.advance();
      if (i % every !== 0 && i !== n) continue;
      for (const o of c.objs) {
        if (!o.alive || o.def.fixed) continue;
        const p = o.body.getPosition();
        paths[o.id].push({ x: p.x, y: p.y });
      }
    }
    const out: { id: number; kind: Kind; pts: { x: number; y: number }[]; ends: 'alive' | 'gone' }[] = [];
    for (const o of this.objs) {
      const pts = paths[o.id];
      const s0 = start[o.id];
      const gone = !c.objs[o.id].alive;
      if (!s0 || (pts.length < 2 && !gone)) continue;
      const moved = pts.some((p) => Math.hypot(p.x - s0.x, p.y - s0.y) > 0.15);
      if (!moved && !gone) continue;
      out.push({ id: o.id, kind: o.def.kind, pts, ends: gone ? 'gone' : 'alive' });
    }
    return out;
  }

  digest(): number[] {
    const out = [this.tick, this.worldTick, this.gauge];
    for (const o of this.objs) {
      if (!o.alive) {
        out.push(-1);
        continue;
      }
      const p = o.body.getPosition();
      out.push(p.x, p.y, o.body.getAngle());
    }
    return out;
  }
}
