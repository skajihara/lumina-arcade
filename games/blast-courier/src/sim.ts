/**
 * Blast Courier（爆風便）のシミュレーション（描画なし）。NEW-05。
 *
 * 割れやすい「灯の卵」を、雲海に浮かぶ島から島へ運び、星の巣まで届ける。卵には触れない — クリックした所の爆風だけで動かす。
 *   - 押す（push）：その場で弾ける。近いほど強く飛ぶが、強すぎる爆風は卵にひびを入れる
 *   - 吸う（pull）：その場へ引き寄せる（ひびは入らない）
 *   - 昇る（lift）：その場から上へ、しばらく上昇気流の柱が立つ
 *   - 遅れ（delay）：1 秒後に、押すより強く弾ける（先に置いて、卵が通る時に合わせる）
 * 卵は強くぶつかってもひびが入る。ひびが cracksMax に達すると割れて失敗。雲に入るとふわりと受け止められる（ひびが入らない）。
 * 画面の外（雲海の下）へ落ちると、最後に止まっていた所へ戻る（爆風を1回ぶん足される）。
 * 巣の中でしばらく止まればクリア。使った爆風の数がスコア（少ないほど良い：爆風ゴルフ）。
 *
 * 動くのは卵だけ（島・巣は動かない、動く島は時間の関数）なので、状態の写し（ボットの先読み）は卵の状態だけで作れる。
 */
import { World, Circle, Polygon, Edge, type Body, type Contact } from 'planck';

export const HZ = 120;
export const DT = 1 / HZ;
export const WORLD_W = 32;
export const WORLD_H = 18;

export type BlastKind = 'push' | 'pull' | 'lift' | 'delay';
export const BLAST_KINDS: BlastKind[] = ['push', 'pull', 'lift', 'delay'];

export interface CourierConfig {
  gravity: number;
  /** 空気抵抗（卵の速さの減り方） */
  air: number;
  eggR: number;
  restitution: number;
  /** 爆風：半径・強さ（中心での速さの変化 m/s） */
  blastR: number;
  blastForce: number;
  pullForce: number;
  /** 昇る：柱の幅・続く秒・上向きの加速（重力の何倍） */
  liftW: number;
  liftTime: number;
  liftAccel: number;
  /** 遅れ：何秒後に弾けるか・押すの何倍か */
  delayTime: number;
  delayMul: number;
  /** 次の爆風までの待ち（秒） */
  cooldown: number;
  /** この速さの変化を超える爆風で、ひびが入る */
  blastCrack: number;
  /** この速さを超えてぶつかると、ひびが入る */
  crackSpeed: number;
  /** ひびがいくつで割れるか */
  cracksMax: number;
  /** 巣の中で何秒止まればクリアか */
  nestHold: number;
}

export const defaults: CourierConfig = {
  gravity: 9, air: 0.25, eggR: 0.45, restitution: 0.3,
  blastR: 3.2, blastForce: 12, pullForce: 6,
  liftW: 1.6, liftTime: 1.4, liftAccel: 2.1,
  delayTime: 1.0, delayMul: 1.3,
  cooldown: 0.5, blastCrack: 11, crackSpeed: 9, cracksMax: 3, nestHold: 0.6,
};

export interface Pt { x: number; y: number }
/** 島：多角形（時計回りでも反時計回りでもよい）。move があると左右／上下に往復する */
export interface IslandDef { pts: Pt[]; move?: { dx: number; dy: number; period: number } }
/** 雲：楕円（卵を受け止める、ひびが入らない） */
export interface CloudDef { x: number; y: number; rx: number; ry: number }
/** 棘：触れると割れる */
export interface ThornDef { pts: Pt[] }

export interface CourierStage {
  id: string;
  name: string;
  hint: string;
  start: Pt;
  /** 巣：真ん中の x、底の y、幅 */
  nest: { x: number; y: number; w: number };
  islands: IslandDef[];
  clouds?: CloudDef[];
  thorns?: ThornDef[];
  /** 使える爆風の種類 */
  kinds: BlastKind[];
  /** 爆風の数の目安（★3） */
  par: number;
  /** これを超えたら失敗 */
  maxBlasts: number;
  cfg?: Partial<CourierConfig>;
}

export interface Zone { x: number; y: number; age: number }
export interface Pending { x: number; y: number; at: number }

export type CourierEvent =
  | { t: 'blast'; kind: BlastKind; x: number; y: number; dv: number; n: number }
  | { t: 'boom'; x: number; y: number; dv: number }
  | { t: 'crack'; x: number; y: number; n: number; why: 'blast' | 'hit' }
  | { t: 'bounce'; x: number; y: number; speed: number }
  | { t: 'cloud'; x: number; y: number }
  | { t: 'ob'; x: number; y: number }
  | { t: 'nest'; x: number; y: number }
  | { t: 'clear' }
  | { t: 'fail'; why: 'broken' | 'blasts' };

type Tag = { kind: 'egg' } | { kind: 'land' } | { kind: 'thorn' };

/** 卵の状態（先読みの写しに使う） */
export interface EggState { x: number; y: number; vx: number; vy: number; a: number; w: number }

export class CourierSim {
  world: World;
  cfg: CourierConfig;
  egg: Body;
  tick = 0;
  phase: 'play' | 'clear' | 'fail' = 'play';
  blasts = 0;
  cracks = 0;
  events: CourierEvent[] = [];
  lifts: Zone[] = [];
  pending: Pending[] = [];
  lastBlastTick = -1e9;
  /** 最後に止まっていた所（雲海へ落ちたら戻る） */
  rest: Pt;
  private restTicks = 0;
  private nestTicks = 0;
  private hits: { speed: number; thorn: boolean; x: number; y: number }[] = [];
  private movers: { body: Body; def: IslandDef }[] = [];
  private inCloud = false;
  private lastCrackTick = -1e9;

  constructor(public stage: CourierStage, cfg: CourierConfig = defaults) {
    this.cfg = { ...cfg, ...stage.cfg };
    this.rest = { ...stage.start };
    this.world = new World({ gravity: { x: 0, y: this.cfg.gravity } });
    const ground = this.world.createBody({ type: 'static', userData: { kind: 'land' } as Tag });
    // 左右の壁（上と下は開いている）
    ground.createFixture(new Edge({ x: 0, y: -20 }, { x: 0, y: WORLD_H + 4 }), { friction: 0.4, restitution: 0.2 });
    ground.createFixture(new Edge({ x: WORLD_W, y: -20 }, { x: WORLD_W, y: WORLD_H + 4 }), { friction: 0.4, restitution: 0.2 });
    for (const isl of stage.islands) {
      if (isl.move) {
        const body = this.world.createBody({ type: 'kinematic', position: { x: 0, y: 0 }, userData: { kind: 'land' } as Tag });
        body.createFixture(new Polygon(isl.pts), { friction: 0.6, restitution: 0.15 });
        this.movers.push({ body, def: isl });
      } else {
        // 凹んだ形もあるので、縁を線（ループ）で作る
        for (let i = 0; i < isl.pts.length; i++) {
          const a = isl.pts[i], b = isl.pts[(i + 1) % isl.pts.length];
          ground.createFixture(new Edge(a, b), { friction: 0.6, restitution: 0.15 });
        }
      }
    }
    // 巣：U の字（左の縁・底・右の縁）
    const n = stage.nest;
    const nest = this.world.createBody({ type: 'static', userData: { kind: 'land' } as Tag });
    nest.createFixture(new Edge({ x: n.x - n.w / 2 - 0.3, y: n.y - 1.1 }, { x: n.x - n.w / 2, y: n.y }), { friction: 0.8, restitution: 0.05 });
    nest.createFixture(new Edge({ x: n.x - n.w / 2, y: n.y }, { x: n.x + n.w / 2, y: n.y }), { friction: 0.9, restitution: 0.05 });
    nest.createFixture(new Edge({ x: n.x + n.w / 2, y: n.y }, { x: n.x + n.w / 2 + 0.3, y: n.y - 1.1 }), { friction: 0.8, restitution: 0.05 });
    for (const th of stage.thorns ?? []) {
      const tb = this.world.createBody({ type: 'static', userData: { kind: 'thorn' } as Tag });
      tb.createFixture(new Polygon(th.pts), { friction: 0.2 });
    }
    this.egg = this.world.createBody({ type: 'dynamic', position: stage.start, linearDamping: this.cfg.air, angularDamping: 0.6, bullet: true, userData: { kind: 'egg' } as Tag });
    // 卵の形：丸（転がる）。見た目は描画で卵形にする
    this.egg.createFixture(new Circle(this.cfg.eggR), { density: 1, friction: 0.7, restitution: this.cfg.restitution });
    this.world.on('begin-contact', (c: Contact) => this.onContact(c));
    this.placeMovers();
  }

  get time(): number {
    return this.tick / HZ;
  }

  /** 次の爆風を撃てるまでの残り（秒） */
  get cooldownLeft(): number {
    return Math.max(0, this.cfg.cooldown - (this.tick - this.lastBlastTick) / HZ);
  }

  get eggPos(): Pt {
    const p = this.egg.getPosition();
    return { x: p.x, y: p.y };
  }

  /** 動く島の今の位置（なめらかに往復） */
  moverOffset(def: IslandDef, at = this.time): Pt {
    if (!def.move) return { x: 0, y: 0 };
    const k = (1 - Math.cos((at / def.move.period) * Math.PI * 2)) / 2;
    return { x: def.move.dx * k, y: def.move.dy * k };
  }

  private placeMovers(): void {
    for (const m of this.movers) {
      const o = this.moverOffset(m.def, this.time);
      const o2 = this.moverOffset(m.def, this.time + DT);
      m.body.setTransform(o, 0);
      m.body.setLinearVelocity({ x: (o2.x - o.x) / DT, y: (o2.y - o.y) / DT });
    }
  }

  private onContact(c: Contact): void {
    const ua = c.getFixtureA().getBody().getUserData() as Tag | null;
    const ub = c.getFixtureB().getBody().getUserData() as Tag | null;
    if (ua?.kind !== 'egg' && ub?.kind !== 'egg') return;
    const other = ua?.kind === 'egg' ? ub : ua;
    const v = this.egg.getLinearVelocity();
    // ぶつかった面に向かう速さ（法線の向き）
    const wm = c.getWorldManifold(null);
    const nrm = wm?.normal ?? { x: 0, y: -1 };
    const speed = Math.abs(v.x * nrm.x + v.y * nrm.y);
    const p = this.egg.getPosition();
    this.hits.push({ speed, thorn: other?.kind === 'thorn', x: p.x, y: p.y });
  }

  /** 爆風を撃つ。撃てたら true */
  blast(x: number, y: number, kind: BlastKind): boolean {
    if (this.phase !== 'play' || this.cooldownLeft > 0 || !this.stage.kinds.includes(kind)) return false;
    this.blasts++;
    this.lastBlastTick = this.tick;
    let dv = 0;
    if (kind === 'push') dv = this.push(x, y, this.cfg.blastForce);
    else if (kind === 'pull') dv = this.pull(x, y);
    else if (kind === 'lift') this.lifts.push({ x, y, age: 0 });
    else this.pending.push({ x, y, at: this.tick + Math.round(this.cfg.delayTime * HZ) });
    this.events.push({ t: 'blast', kind, x, y, dv, n: this.blasts });
    if (this.blasts > this.stage.maxBlasts && this.phase === 'play') this.fail('blasts');
    return true;
  }

  /** 押す爆風：中心から外へ。近いほど強い（距離に対して滑らかに減る） */
  private push(x: number, y: number, force: number): number {
    const p = this.egg.getPosition();
    const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy);
    if (d > this.cfg.blastR) return 0;
    const k = 1 - d / this.cfg.blastR;
    const dv = force * Math.sqrt(k);
    const ux = d > 1e-3 ? dx / d : 0, uy = d > 1e-3 ? dy / d : -1;
    const v = this.egg.getLinearVelocity();
    this.egg.setLinearVelocity({ x: v.x + ux * dv, y: v.y + uy * dv });
    this.egg.setAwake(true);
    if (dv > this.cfg.blastCrack) this.crack('blast');
    return dv;
  }

  /** 吸う爆風：その場へ引き寄せる（届く距離は押すの 1.4 倍、ひびは入らない） */
  private pull(x: number, y: number): number {
    const p = this.egg.getPosition();
    const R = this.cfg.blastR * 1.4;
    const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
    if (d > R || d < 1e-3) return 0;
    const dv = this.cfg.pullForce * (0.4 + 0.6 * (1 - d / R));
    const v = this.egg.getLinearVelocity();
    this.egg.setLinearVelocity({ x: v.x * 0.5 + (dx / d) * dv, y: v.y * 0.5 + (dy / d) * dv });
    this.egg.setAwake(true);
    return dv;
  }

  private crack(why: 'blast' | 'hit'): void {
    // 同じぶつかりで何度も数えない
    if (this.tick - this.lastCrackTick < HZ * 0.25) return;
    this.lastCrackTick = this.tick;
    this.cracks++;
    const p = this.egg.getPosition();
    this.events.push({ t: 'crack', x: p.x, y: p.y, n: this.cracks, why });
    if (this.cracks >= this.cfg.cracksMax) this.fail('broken');
  }

  private fail(why: 'broken' | 'blasts'): void {
    if (this.phase !== 'play') return;
    this.phase = 'fail';
    this.events.push({ t: 'fail', why });
  }

  /** 雲の中か */
  cloudAt(x: number, y: number): boolean {
    return (this.stage.clouds ?? []).some((c) => ((x - c.x) / c.rx) ** 2 + ((y - c.y) / c.ry) ** 2 < 1);
  }

  step(): void {
    this.events = [];
    this.tick++;
    this.placeMovers();
    const cfg = this.cfg;
    // 遅れ爆風
    for (const q of this.pending) if (q.at === this.tick) {
      const dv = this.push(q.x, q.y, cfg.blastForce * cfg.delayMul);
      this.events.push({ t: 'boom', x: q.x, y: q.y, dv });
    }
    this.pending = this.pending.filter((q) => q.at > this.tick);
    // 上昇気流
    const p0 = this.egg.getPosition();
    for (const z of this.lifts) {
      z.age += DT;
      if (Math.abs(p0.x - z.x) < cfg.liftW / 2 && p0.y < z.y + 0.6) {
        const v = this.egg.getLinearVelocity();
        this.egg.setLinearVelocity({ x: v.x * 0.99, y: v.y - cfg.gravity * cfg.liftAccel * DT });
        this.egg.setAwake(true);
      }
    }
    this.lifts = this.lifts.filter((z) => z.age < cfg.liftTime);
    // 雲：ふわりと受け止める（速さを強く減らす）
    const cloud = this.cloudAt(p0.x, p0.y);
    if (cloud) {
      const v = this.egg.getLinearVelocity();
      // 落ちる向きだけ強く受け止める（上や横へはそのまま抜けられる）
      this.egg.setLinearVelocity({ x: v.x * 0.985, y: v.y > 0 ? v.y * 0.9 : v.y });
      if (!this.inCloud) this.events.push({ t: 'cloud', x: p0.x, y: p0.y });
    }
    this.inCloud = cloud;
    this.world.step(DT, 8, 3);
    for (const h of this.hits) {
      if (h.thorn) { this.cracks = cfg.cracksMax - 1; this.lastCrackTick = -1e9; this.crack('hit'); continue; }
      if (h.speed > 2.5) this.events.push({ t: 'bounce', x: h.x, y: h.y, speed: h.speed });
      if (h.speed > cfg.crackSpeed && !this.inCloud) this.crack('hit');
    }
    this.hits = [];
    if (this.phase !== 'play') return;
    const p = this.egg.getPosition();
    const v = this.egg.getLinearVelocity();
    const still = Math.hypot(v.x, v.y) < 0.25;
    // 止まっている所を覚える（0.4 秒止まったら）
    this.restTicks = still ? this.restTicks + 1 : 0;
    if (this.restTicks > HZ * 0.4) this.rest = { x: p.x, y: p.y };
    // 雲海へ落ちた：最後に止まっていた所へ戻る（1回ぶん足す）
    if (p.y > WORLD_H + 1.5 || p.y < -12) {
      this.events.push({ t: 'ob', x: p.x, y: Math.min(WORLD_H, p.y) });
      this.egg.setTransform({ x: this.rest.x, y: this.rest.y - 0.1 }, 0);
      this.egg.setLinearVelocity({ x: 0, y: 0 });
      this.egg.setAngularVelocity(0);
      this.lifts = [];
      this.pending = [];
      this.blasts++;
      if (this.blasts > this.stage.maxBlasts) this.fail('blasts');
      return;
    }
    // 巣の中で止まればクリア
    const n = this.stage.nest;
    const inNest = Math.abs(p.x - n.x) < n.w / 2 + 0.1 && p.y > n.y - 1.2 && p.y < n.y + 0.1;
    this.nestTicks = inNest && Math.hypot(v.x, v.y) < 0.8 ? this.nestTicks + 1 : 0;
    if (this.nestTicks === 1) this.events.push({ t: 'nest', x: p.x, y: p.y });
    if (this.nestTicks > cfg.nestHold * HZ) {
      this.phase = 'clear';
      this.events.push({ t: 'clear' });
    }
  }

  /** 卵の状態（先読み用） */
  eggState(): EggState {
    const p = this.egg.getPosition(), v = this.egg.getLinearVelocity();
    return { x: p.x, y: p.y, vx: v.x, vy: v.y, a: this.egg.getAngle(), w: this.egg.getAngularVelocity() };
  }

  /** 先読み用の写し：同じステージで、卵・時刻・ひび・爆風の状態を写す */
  clone(): CourierSim {
    const c = new CourierSim(this.stage, this.cfg);
    c.cfg = this.cfg;
    const e = this.eggState();
    c.egg.setTransform({ x: e.x, y: e.y }, e.a);
    c.egg.setLinearVelocity({ x: e.vx, y: e.vy });
    c.egg.setAngularVelocity(e.w);
    c.tick = this.tick;
    c.phase = this.phase;
    c.blasts = this.blasts;
    c.cracks = this.cracks;
    c.lifts = this.lifts.map((z) => ({ ...z }));
    c.pending = this.pending.map((q) => ({ ...q }));
    c.lastBlastTick = this.lastBlastTick;
    c.rest = { ...this.rest };
    c.restTicks = this.restTicks;
    c.nestTicks = this.nestTicks;
    c.lastCrackTick = this.lastCrackTick;
    c.placeMovers();
    return c;
  }

  /** 決定性の確認用 */
  digest(): number[] {
    const e = this.eggState();
    return [this.tick, this.blasts, this.cracks, e.x, e.y, e.vx, e.vy];
  }
}
