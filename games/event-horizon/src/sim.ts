/**
 * Event Horizon のシミュレーション（描画なし）。
 *
 * - 爪の代わりに小さなブラックホールを動かす。引く（ボタンを押している間）と、近くの星のかけらを引き寄せる
 * - 近づきすぎて事象の地平の内側に入ったかけらは吸い込まれて消える。速すぎても遅すぎてもだめ — 周回させる
 * - 地平の近くにかけらがある間は、世界の時間が遅れる（全体がスローになる → 解放の瞬間を狙いやすい）
 * - 解放（ホワイトホール）：周りのかけらをまとめて外へ弾き飛ばす。その後しばらく引力が消える
 * - かけらを星座の穴（ゴール）へ入れる。続けて入ると連鎖。穴はブラックホールを寄せつけないので、投げ入れるしかない
 *
 * 入力はティックごとの { x, y, bits }（ブラックホールの目標位置と、引く・解放のボタン）。
 * 同じ入力の列なら同じ結果になる（決定的）。
 */
import { World, Circle, Edge, type Body, type Contact } from 'planck';
import { Rng } from '@engine/rng';
import type { HorizonConfig } from './config';

export const HZ = 120;
export const DT = 1 / HZ;
export const WORLD_W = 20;
export const WORLD_H = 12;

/** 入力のボタン */
export const IN_PULL = 1;
export const IN_BURST = 2;

export interface HorizonInput {
  x: number;
  y: number;
  bits: number;
}

export type ShardKind = 'dust' | 'heavy';

export interface ShardDef {
  kind?: ShardKind;
  x: number;
  y: number;
}

export interface GoalDef {
  x: number;
  y: number;
  r: number;
}

export interface StageDef {
  id: string;
  name: string;
  hint: string;
  shards: ShardDef[];
  goals: GoalDef[];
  /** クリアに必要なかけらの数（省略時は全部） */
  need?: number;
  /** 固定の壁・足場（折れ線） */
  walls?: { x: number; y: number }[][];
  /** 床の穴（この x の範囲には床がない。落ちたかけらは失われる） */
  pits?: [number, number][];
  /** ブラックホールの最初の位置 */
  start?: { x: number; y: number };
  /** スコアアタック：穴に入ったり失ったりしたかけらの代わりが空から降ってくる。制限時間まで遊んでスコアを競う */
  attack?: { seed: number };
}

export interface Shard {
  id: number;
  kind: ShardKind;
  r: number;
  body: Body;
  /** 'free' 遊んでいる / 'captured' 穴に入った / 'lost' 吸い込まれた・落ちた / 'held' ひねり1：地平の内に抱えている */
  state: 'free' | 'captured' | 'lost' | 'held';
  /** 'held' の時：この世界時刻を過ぎると蒸発する */
  heldUntil?: number;
  /** 引力の効きやすさ（重いかけらは鈍い） */
  pullScale: number;
}

export type HorizonEvent =
  | { t: 'swallow'; id: number; x: number; y: number }
  | { t: 'fall'; id: number; x: number; y: number }
  | { t: 'capture'; id: number; goal: number; x: number; y: number; chain: number }
  | { t: 'burst'; x: number; y: number; n: number; r: number }
  | { t: 'chainEnd'; chain: number }
  | { t: 'spawn'; id: number }
  /** ひねり1：地平の内に抱えた（まだ失っていない） */
  | { t: 'hold'; id: number; x: number; y: number }
  /** ひねり1：抱えていたかけらを吐き出した */
  | { t: 'spit'; n: number; x: number; y: number }
  /** ひねり1：抱えすぎて蒸発した */
  | { t: 'evaporate'; id: number; x: number; y: number }
  | { t: 'clink'; x: number; y: number; v: number }
  | { t: 'clear' }
  | { t: 'fail'; why: 'lost' | 'time' };

export type Phase = 'play' | 'clear' | 'fail';

const RADIUS: Record<ShardKind, number> = { dust: 0.28, heavy: 0.42 };
const PULL_SCALE: Record<ShardKind, number> = { dust: 1, heavy: 0.55 };

export class HorizonSim {
  world: World;
  tick = 0;
  /** 世界の時間（遅れを含む） */
  worldTime = 0;
  phase: Phase = 'play';
  shards: Shard[] = [];
  bh: { x: number; y: number };
  pulling = false;
  /** ブラックホールの速度（このティックの動き） */
  bhVel = { x: 0, y: 0 };
  /** 引力が戻るまでの残り（秒、実時間） */
  cooldown = 0;
  /** 今の時間の速さ（1 で通常、地平の近くにかけらがあると小さくなる） */
  timeScale = 1;
  captured = 0;
  score = 0;
  chain = 0;
  bestChain = 0;
  /** 1回の解放で弾いたかけらの最大数 */
  bestBurst = 0;
  events: HorizonEvent[] = [];
  private chainUntil = -1;
  private prevBits = 0;
  private rng: Rng;
  private clinks: HorizonEvent[] = [];
  /** ひねり2：かけらが1つでも入った穴 */
  goalFilled: boolean[] = [];

  constructor(public stage: StageDef, public cfg: HorizonConfig) {
    this.world = new World({ gravity: { x: 0, y: cfg.gravity } });
    this.bh = { ...(stage.start ?? { x: WORLD_W / 2, y: 3 }) };
    const ground = this.world.createBody({ type: 'static' });
    // 床（穴の部分は抜く）・左右の壁・天井
    const pits = [...(stage.pits ?? [])].sort((a, b) => a[0] - b[0]);
    let x0 = 0;
    for (const [a, b] of pits) {
      if (a > x0) ground.createFixture(new Edge({ x: x0, y: WORLD_H }, { x: a, y: WORLD_H }), { friction: 0.5 });
      x0 = b;
    }
    if (x0 < WORLD_W) ground.createFixture(new Edge({ x: x0, y: WORLD_H }, { x: WORLD_W, y: WORLD_H }), { friction: 0.5 });
    ground.createFixture(new Edge({ x: 0, y: 0 }, { x: 0, y: WORLD_H }), { friction: 0.2 });
    ground.createFixture(new Edge({ x: WORLD_W, y: 0 }, { x: WORLD_W, y: WORLD_H }), { friction: 0.2 });
    ground.createFixture(new Edge({ x: 0, y: 0 }, { x: WORLD_W, y: 0 }), { friction: 0.2 });
    for (const line of stage.walls ?? []) {
      for (let i = 1; i < line.length; i++) ground.createFixture(new Edge(line[i - 1], line[i]), { friction: 0.5, restitution: 0.3 });
    }
    this.rng = new Rng(stage.attack?.seed ?? 1);
    // かけらが何かに強くぶつかった時（音と光のため）
    this.world.on('begin-contact', (c: Contact) => {
      const a = c.getFixtureA().getBody(), b = c.getFixtureB().getBody();
      const va = a.getLinearVelocity(), vb = b.getLinearVelocity();
      const v = Math.hypot(va.x - vb.x, va.y - vb.y);
      if (v < 3) return;
      const m = c.getWorldManifold(null);
      const p = m?.points[0] ?? a.getPosition();
      this.clinks.push({ t: 'clink', x: p.x, y: p.y, v });
    });
    for (const d of stage.shards) this.addShard(d);
  }

  private addShard(d: ShardDef): Shard {
    const kind = d.kind ?? 'dust';
    const r = RADIUS[kind];
    const body = this.world.createBody({ type: 'dynamic', position: { x: d.x, y: d.y }, bullet: true, linearDamping: 0.02, angularDamping: 0.5 });
    body.createFixture(new Circle(r), { density: kind === 'heavy' ? 3 : 1, friction: 0.3, restitution: 0.5 });
    const s: Shard = { id: this.shards.length, kind, r, body, state: 'free', pullScale: PULL_SCALE[kind] };
    this.shards.push(s);
    return s;
  }

  /** スコアアタック：代わりのかけらを空から降らせる */
  private respawn(): void {
    if (!this.stage.attack) return;
    const kind: ShardKind = this.rng.next() < 0.2 ? 'heavy' : 'dust';
    const s = this.addShard({ kind, x: this.rng.range(2, WORLD_W - 2), y: 0.8 });
    this.events.push({ t: 'spawn', id: s.id });
  }

  get time(): number {
    return this.tick / HZ;
  }

  get need(): number {
    if (this.stage.attack) return Infinity;
    return this.stage.need ?? this.stage.shards.length;
  }

  get spits(): boolean {
    const t = Math.round(this.cfg.twist ?? 0);
    return t === 1 || t === 3;
  }

  get goalGravity(): boolean {
    const t = Math.round(this.cfg.twist ?? 0);
    return t === 2 || t === 3;
  }

  /** ひねり1：地平の内に抱えているかけら */
  held(): Shard[] {
    return this.shards.filter((s) => s.state === 'held');
  }

  free(): Shard[] {
    return this.shards.filter((s) => s.state === 'free');
  }

  /** 地平からの距離が一番近いかけらまでの距離（なければ Infinity） */
  nearest(): number {
    let best = Infinity;
    for (const s of this.shards) {
      if (s.state !== 'free') continue;
      const p = s.body.getPosition();
      best = Math.min(best, Math.hypot(p.x - this.bh.x, p.y - this.bh.y) - this.cfg.horizon - s.r);
    }
    return best;
  }

  /** 1ティック進める */
  step(input: HorizonInput = { x: this.bh.x, y: this.bh.y, bits: 0 }): void {
    this.events = [];
    this.tick++;
    const cfg = this.cfg;
    const rise = input.bits & ~this.prevBits;
    this.prevBits = input.bits;

    const tx = Math.min(WORLD_W - 0.3, Math.max(0.3, input.x));
    const ty = Math.min(WORLD_H - 0.3, Math.max(0.3, input.y));
    const dx = tx - this.bh.x, dy = ty - this.bh.y;
    const d = Math.hypot(dx, dy);
    // 時間の遅れは世界全体のスロー（ブラックホールも同じ速さで遅くなる → 人間には考える時間が増える）
    const maxStep = cfg.bhSpeed * DT * this.timeScale;
    const ox = this.bh.x, oy = this.bh.y;
    if (d > maxStep) {
      this.bh.x += (dx / d) * maxStep;
      this.bh.y += (dy / d) * maxStep;
    } else {
      this.bh.x = tx;
      this.bh.y = ty;
    }
    // 星座の穴はブラックホールを寄せつけない
    for (const g of this.stage.goals) {
      const gx = this.bh.x - g.x, gy = this.bh.y - g.y;
      const gd = Math.hypot(gx, gy);
      const min = g.r + cfg.goalGuard;
      if (gd < min) {
        const k = gd > 1e-4 ? min / gd : 0;
        this.bh.x = k ? g.x + gx * k : g.x + min;
        this.bh.y = k ? g.y + gy * k : g.y;
      }
    }
    this.cooldown = Math.max(0, this.cooldown - DT);
    // 世界の時間で測った速度
    const wdt = DT * Math.max(0.05, this.timeScale);
    this.bhVel = { x: (this.bh.x - ox) / wdt, y: (this.bh.y - oy) / wdt };

    if (this.phase !== 'play') {
      this.world.step(DT * this.timeScale);
      return;
    }

    // 解放（ホワイトホール）
    if (rise & IN_BURST && this.cooldown <= 0) this.burst();

    // 引力：遠くは 1/r²、輪（ringR）の近くまで来たら輪に乗せて回す。
    // 速さはブラックホールに対する相対速度で測る → 動かすと輪ごと運べる。速く動かしすぎると輪からこぼれたり、内へ突っ込んで吸い込まれる
    this.pulling = (input.bits & IN_PULL) !== 0 && this.cooldown <= 0;
    if (this.pulling) {
      const diskR = cfg.ringR * 1.8;
      for (const s of this.shards) {
        if (s.state !== 'free') continue;
        const p = s.body.getPosition();
        const ex = this.bh.x - p.x, ey = this.bh.y - p.y;
        const r = Math.hypot(ex, ey);
        if (r > cfg.bhReach || r < 1e-4) continue;
        const ux = ex / r, uy = ey / r; // 内向き
        const tx2 = -uy, ty2 = ux; // 回る向き
        const v = s.body.getLinearVelocity();
        const rvx = v.x - this.bhVel.x, rvy = v.y - this.bhVel.y;
        const vIn = rvx * ux + rvy * uy;
        const vT = rvx * tx2 + rvy * ty2;
        const soft = Math.max(r, 0.6);
        const edge = Math.min(1, (cfg.bhReach - r) / 1.0);
        let aIn = (cfg.bhPull / (soft * soft)) * edge;
        let aT = 0;
        if (r < diskR) {
          // 輪の内側ほど輪の働きが強く、外側ほど 1/r² の引力に戻る
          const w = Math.min(1, (diskR - r) / (diskR - cfg.ringR));
          const ring = cfg.ringK * (r - cfg.ringR) - cfg.ringDamp * vIn;
          aIn = aIn * (1 - w) + ring * w;
          aT = (cfg.orbitSpeed - vT) * 3 * w;
        }
        aIn *= s.pullScale;
        aT *= s.pullScale;
        const m = s.body.getMass();
        s.body.applyForceToCenter({ x: (ux * aIn + tx2 * aT) * m, y: (uy * aIn + ty2 * aT) * m }, true);
      }
    }

    // ひねり2：かけらを1つでも入れた穴は、縁の近くのかけらを引き込む（入れるほど連鎖しやすい）
    if (this.goalGravity && cfg.goalPull > 0) {
      this.stage.goals.forEach((g, gi) => {
        if (!this.goalFilled[gi]) return;
        for (const s of this.shards) {
          if (s.state !== 'free') continue;
          const p = s.body.getPosition();
          const ex = g.x - p.x, ey = g.y - p.y;
          const r = Math.hypot(ex, ey);
          if (r > g.r + cfg.goalPullR || r < 1e-4) continue;
          const k = cfg.goalPull * (1 - (r - g.r) / cfg.goalPullR) * s.pullScale * s.body.getMass();
          s.body.applyForceToCenter({ x: (ex / r) * k, y: (ey / r) * k }, true);
        }
      });
    }

    // 時間の遅れ：地平の近くにかけらがあるほど遅く（急に変わらないよう滑らかに）
    const near = this.nearest();
    let target = 1;
    if (cfg.dilateRange > 0 && near < cfg.dilateRange) {
      const k = Math.max(0, near) / cfg.dilateRange;
      target = cfg.dilateMin + (1 - cfg.dilateMin) * k * k;
    }
    this.timeScale += (target - this.timeScale) * 0.08;

    const dt = DT * this.timeScale;
    this.world.step(dt, 8, 3);
    this.worldTime += dt;
    // 1ティックに出す衝突は強い方から3つまで
    if (this.clinks.length) {
      this.clinks.sort((a, b) => (b as { v: number }).v - (a as { v: number }).v);
      this.events.push(...this.clinks.slice(0, 3));
      this.clinks = [];
    }

    // 吸い込み・穴・落下
    for (const s of this.shards) {
      if (s.state !== 'free') continue;
      const p = s.body.getPosition();
      if (Math.hypot(p.x - this.bh.x, p.y - this.bh.y) < cfg.horizon) {
        if (this.spits) this.hold(s);
        else this.lose(s, 'swallow');
        continue;
      }
      const gi = this.stage.goals.findIndex((g) => Math.hypot(p.x - g.x, p.y - g.y) < g.r);
      if (gi >= 0) {
        this.capture(s, gi);
        continue;
      }
      if (p.y > WORLD_H + 1 || p.x < -1 || p.x > WORLD_W + 1) this.lose(s, 'fall');
    }
    // ひねり1：抱えすぎたかけらは蒸発する
    for (const s of this.shards) {
      if (s.state === 'held' && this.worldTime > (s.heldUntil ?? 0)) {
        s.state = 'lost';
        this.events.push({ t: 'evaporate', id: s.id, x: this.bh.x, y: this.bh.y });
        this.world.destroyBody(s.body);
        this.respawn();
      }
    }
    if (this.chainUntil >= 0 && this.worldTime > this.chainUntil) {
      this.events.push({ t: 'chainEnd', chain: this.chain });
      this.chain = 0;
      this.chainUntil = -1;
    }
    this.checkEnd();
  }

  private burst(): void {
    const cfg = this.cfg;
    let n = 0;
    for (const s of this.shards) {
      if (s.state !== 'free') continue;
      const p = s.body.getPosition();
      const ex = p.x - this.bh.x, ey = p.y - this.bh.y;
      const r = Math.hypot(ex, ey) || 1e-3;
      if (r > cfg.burstRadius) continue;
      n++;
      // 外向きに弾く。今の速度（周回の向き）は残す → 回っていた向きに投げ出される
      const k = cfg.burstForce * (1 - 0.55 * (r / cfg.burstRadius)) * (s.kind === 'heavy' ? 0.7 : 1);
      const v = s.body.getLinearVelocity();
      s.body.setLinearVelocity({ x: v.x + (ex / r) * k, y: v.y + (ey / r) * k });
      s.body.setAwake(true);
    }
    // ひねり1：抱えていたかけらを、動いている向きへ（止まっていれば全方向へ）吐き出す
    const held = this.held();
    if (held.length) {
      const sp = Math.hypot(this.bhVel.x, this.bhVel.y);
      const aim = sp > 1 ? Math.atan2(this.bhVel.y, this.bhVel.x) : -Math.PI / 2;
      const spread = sp > 1 ? 0.9 : Math.PI * 2;
      held.forEach((s, k) => {
        const a = held.length === 1 ? aim : aim - spread / 2 + (spread * (k + (sp > 1 ? 0 : 0.5))) / (held.length - (sp > 1 ? 1 : 0));
        const ux = Math.cos(a), uy = Math.sin(a);
        const r0 = cfg.horizon + s.r + 0.2;
        s.body.setTransform({ x: this.bh.x + ux * r0, y: this.bh.y + uy * r0 }, 0);
        const v = cfg.burstForce * 1.15 * (s.kind === 'heavy' ? 0.75 : 1);
        s.body.setLinearVelocity({ x: ux * v, y: uy * v });
        s.body.setActive(true);
        s.body.setAwake(true);
        s.state = 'free';
        s.heldUntil = undefined;
        n++;
      });
      this.events.push({ t: 'spit', n: held.length, x: this.bh.x, y: this.bh.y });
    }
    this.cooldown = cfg.burstCooldown;
    this.bestBurst = Math.max(this.bestBurst, n);
    this.events.push({ t: 'burst', x: this.bh.x, y: this.bh.y, n, r: cfg.burstRadius });
  }

  /** ひねり1：地平の内に抱える（体は止めて隠す。解放で吐き出すまで、holdSec 秒） */
  private hold(s: Shard): void {
    const p = s.body.getPosition();
    s.state = 'held';
    s.heldUntil = this.worldTime + this.cfg.holdSec;
    s.body.setActive(false);
    this.events.push({ t: 'hold', id: s.id, x: p.x, y: p.y });
  }

  private lose(s: Shard, how: 'swallow' | 'fall'): void {
    const p = s.body.getPosition();
    s.state = 'lost';
    this.events.push({ t: how, id: s.id, x: p.x, y: p.y });
    this.world.destroyBody(s.body);
    this.respawn();
  }

  private capture(s: Shard, goal: number): void {
    const p = s.body.getPosition();
    s.state = 'captured';
    this.goalFilled[goal] = true;
    this.captured++;
    this.chain = this.chainUntil >= 0 ? this.chain + 1 : 1;
    this.chainUntil = this.worldTime + this.cfg.chainWindow;
    this.bestChain = Math.max(this.bestChain, this.chain);
    this.score += 100 * this.chain;
    this.events.push({ t: 'capture', id: s.id, goal, x: p.x, y: p.y, chain: this.chain });
    this.world.destroyBody(s.body);
    this.respawn();
  }

  private checkEnd(): void {
    if (this.phase !== 'play') return;
    if (this.stage.attack) {
      // スコアアタックは制限時間まで遊んで終わり（失敗はない）
      if (this.worldTime >= this.cfg.timeLimit) {
        this.phase = 'clear';
        this.events.push({ t: 'clear' });
      }
      return;
    }
    if (this.captured >= this.need) {
      this.phase = 'clear';
      this.score += Math.max(0, Math.round((this.cfg.timeLimit - this.worldTime) * 10));
      this.events.push({ t: 'clear' });
      return;
    }
    const alive = this.shards.filter((s) => s.state === 'free' || s.state === 'held').length;
    if (alive + this.captured < this.need) {
      this.phase = 'fail';
      this.events.push({ t: 'fail', why: 'lost' });
    } else if (this.worldTime >= this.cfg.timeLimit) {
      this.phase = 'fail';
      this.events.push({ t: 'fail', why: 'time' });
    }
  }

  digest(): number[] {
    const out = [this.tick, this.captured, this.score, this.bh.x, this.bh.y, this.timeScale];
    for (const s of this.shards) {
      if (s.state !== 'free') {
        out.push(s.state === 'captured' ? -1 : s.state === 'held' ? -3 : -2);
        continue;
      }
      const p = s.body.getPosition();
      out.push(p.x, p.y);
    }
    return out;
  }
}
