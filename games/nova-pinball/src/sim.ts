/**
 * Nova Pinball のシミュレーション（描画なし）。
 * 入力ビットを1ティックずつ与えると進む。同じ入力なら同じ結果になる（決定的）。
 * テスト・ボット・リプレイ・Echo Loop からも使う。
 */
import { World, Circle, Polygon, Chain, RevoluteJoint, type Body, type Contact } from 'planck';
import type { NovaConfig } from './config';
import type { StageDef } from './stages';

export const HZ = 120;
export const DT = 1 / HZ;
export const BOARD_W = 15;
export const BOARD_H = 25;
export const FIELD_RIGHT = 13.2;
export const BALL_R = 0.3;

export const IN_LEFT = 1;
export const IN_RIGHT = 2;
export const IN_LAUNCH = 4;

type Tag =
  | { kind: 'ball'; id: number }
  | { kind: 'star'; id: number }
  | { kind: 'bumper'; id: number }
  | { kind: 'wall' }
  | { kind: 'flipper'; side: 'L' | 'R' };

export interface Ball {
  id: number;
  body: Body;
  saveUntil: number;
  launched: boolean;
  trail: { x: number; y: number }[];
  still: number;
}

export interface Star {
  id: number;
  body: Body;
  r: number;
  loose: boolean;
  charge: number;
  decay: number;
  alive: boolean;
  pendingAt: number;
  pendingChain: number;
  exploded: boolean;
  explodedChain: number;
  lastHit: number;
  /** 最後に爆風チャージを受けた連鎖ID（1つの連鎖で受けるのは1回だけ） */
  blastChain: number;
}

export interface Flipper {
  side: 'L' | 'R';
  body: Body;
  joint: RevoluteJoint;
  pivot: { x: number; y: number };
  length: number;
}

export type SimEvent =
  | { t: 'hit'; star: number; charge: number; x: number; y: number }
  | { t: 'bump'; x: number; y: number }
  | { t: 'explode'; star: number; x: number; y: number; r: number; chain: number; last: boolean }
  | { t: 'link'; a: number; b: number }
  | { t: 'supernova' }
  | { t: 'flip'; side: 'L' | 'R' }
  | { t: 'launch'; power: number }
  | { t: 'drain'; saved: boolean }
  | { t: 'newball' }
  | { t: 'decay'; star: number }
  | { t: 'fizzle'; star: number; x: number; y: number }
  | { t: 'clear' }
  | { t: 'gameover' }
  | { t: 'chainEnd'; chain: number };

export type Phase = 'play' | 'clear' | 'gameover';

/** 盤面の壁（折れ線）。描画にも使う */
export function boardWalls(): { x: number; y: number }[][] {
  const arcPts = (cx: number, cy: number, r: number, a0: number, a1: number, n = 10) => {
    const p: { x: number; y: number }[] = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      p.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    return p;
  };
  const outer = [
    { x: 0.6, y: 19.0 },
    ...arcPts(3.2, 3.2, 2.6, Math.PI, Math.PI * 1.5),
    ...arcPts(11.8, 3.2, 2.6, Math.PI * 1.5, Math.PI * 2),
    { x: 14.4, y: 24.4 },
    { x: 13.2, y: 24.4 },
    { x: 13.2, y: 6.4 },
  ];
  // 斜面の終点はフリッパー支点の真上より少し先。ボールが支点との隙間に挟まらず、そのままフリッパーへ転がる
  const leftSlope = [{ x: 0.6, y: 19.0 }, { x: 4.58, y: 21.76 }];
  const rightSlope = [{ x: FIELD_RIGHT, y: 19.0 }, { x: 9.22, y: 21.76 }];
  return [outer, leftSlope, rightSlope];
}

export const PIVOT_L = { x: 4.45, y: 22.05 };
export const PIVOT_R = { x: 9.35, y: 22.05 };

export class NovaSim {
  world: World;
  tick = 0;
  phase: Phase = 'play';
  score = 0;
  ballsLeft: number;
  balls: Ball[] = [];
  stars: Star[] = [];
  bumpers: { x: number; y: number; r: number }[] = [];
  flippers: Flipper[] = [];
  litLinks = new Set<number>();
  supernova = false;
  events: SimEvent[] = [];
  launchCharge = 0;
  chainId = 0;
  chainCount = 0;
  chainUntil = -1;
  bestChain = 0;
  private prevInput = 0;
  private nextBallId = 1;
  private contacts: { a: Tag; b: Tag; rel: number; ba: Body; bb: Body }[] = [];
  private gravityNow = 0;

  constructor(public stage: StageDef, public cfg: NovaConfig) {
    this.world = new World({ gravity: { x: 0, y: cfg.gravity } });
    this.gravityNow = cfg.gravity;
    this.ballsLeft = Math.max(0, Math.round(cfg.balls) - 1);
    this.buildBoard();
    this.buildStage();
    this.spawnBall();
    this.world.on('begin-contact', (c: Contact) => this.onContact(c));
  }

  private buildBoard(): void {
    const ground = this.world.createBody({ type: 'static', userData: { kind: 'wall' } as Tag });
    for (const line of boardWalls()) {
      ground.createFixture(new Chain(line, false), { friction: 0.1, restitution: 0.3 });
    }
    const L = this.cfg.flipperLength;
    const mk = (side: 'L' | 'R', pivot: { x: number; y: number }) => {
      const s = side === 'L' ? 1 : -1;
      const body = this.world.createBody({ type: 'dynamic', position: pivot, bullet: true, gravityScale: 0, userData: { kind: 'flipper', side } as Tag });
      const fd = { density: 3, friction: 0.2, restitution: 0.15 };
      body.createFixture(new Polygon([
        { x: 0, y: -0.26 }, { x: s * L, y: -0.11 }, { x: s * L, y: 0.11 }, { x: 0, y: 0.26 },
      ]), fd);
      body.createFixture(new Circle({ x: 0, y: 0 }, 0.26), fd);
      body.createFixture(new Circle({ x: s * L, y: 0 }, 0.11), fd);
      const joint = this.world.createJoint(new RevoluteJoint({
        enableLimit: true,
        lowerAngle: side === 'L' ? -0.45 : -0.5,
        upperAngle: side === 'L' ? 0.5 : 0.45,
        enableMotor: true,
        maxMotorTorque: this.cfg.flipperTorque,
        motorSpeed: 0,
      }, ground, body, pivot))!;
      this.flippers.push({ side, body, joint, pivot, length: L });
    };
    mk('L', PIVOT_L);
    mk('R', PIVOT_R);
  }

  private buildStage(): void {
    this.stage.stars.forEach((d, i) => {
      const r = d.r ?? 0.55;
      const body = this.world.createBody({
        type: d.loose ? 'dynamic' : 'static',
        position: { x: d.x, y: d.y },
        linearDamping: 1.2,
        angularDamping: 2,
        gravityScale: 0,
        userData: { kind: 'star', id: i } as Tag,
      });
      body.createFixture(new Circle(r), { density: 0.6, restitution: 0.85, friction: 0.05 });
      this.stars.push({
        id: i, body, r, loose: !!d.loose, charge: d.charge ?? 0, decay: 0, alive: true,
        pendingAt: -1, pendingChain: 0, exploded: false, explodedChain: -1, lastHit: -999, blastChain: -1,
      });
    });
    (this.stage.bumpers ?? []).forEach((b, i) => {
      const body = this.world.createBody({ type: 'static', position: { x: b.x, y: b.y }, userData: { kind: 'bumper', id: i } as Tag });
      body.createFixture(new Circle(b.r), { restitution: 0.9 });
      this.bumpers.push({ ...b });
    });
  }

  spawnBall(at = { x: 13.8, y: 23.8 }): Ball {
    const body = this.world.createBody({ type: 'dynamic', position: at, bullet: true });
    const ball: Ball = { id: this.nextBallId++, body, saveUntil: -1, launched: false, trail: [], still: 0 };
    body.setUserData({ kind: 'ball', id: ball.id } as Tag);
    body.createFixture(new Circle(BALL_R), { density: 1, friction: 0.08, restitution: this.cfg.ballRestitution });
    this.balls.push(ball);
    this.events.push({ t: 'newball' });
    return ball;
  }

  private onContact(c: Contact): void {
    const ba = c.getFixtureA().getBody();
    const bb = c.getFixtureB().getBody();
    const a = ba.getUserData() as Tag | null;
    const b = bb.getUserData() as Tag | null;
    if (!a || !b) return;
    const va = ba.getLinearVelocity(), vb = bb.getLinearVelocity();
    const rel = Math.hypot(va.x - vb.x, va.y - vb.y);
    this.contacts.push({ a, b, rel, ba, bb });
  }

  get time(): number {
    return this.tick * DT;
  }

  starsAlive(): number {
    let n = 0;
    for (const s of this.stars) if (s.alive) n++;
    return n;
  }

  /** 1ティック進める */
  step(input: number): void {
    const cfg = this.cfg;
    this.events.length = 0;
    if (cfg.gravity !== this.gravityNow) {
      this.world.setGravity({ x: 0, y: cfg.gravity });
      this.gravityNow = cfg.gravity;
    }
    const pressed = input & ~this.prevInput;
    const released = ~input & this.prevInput;

    // フリッパー
    for (const f of this.flippers) {
      const bit = f.side === 'L' ? IN_LEFT : IN_RIGHT;
      const on = (input & bit) !== 0;
      const dir = f.side === 'L' ? -1 : 1;
      f.joint.setMaxMotorTorque(cfg.flipperTorque);
      f.joint.setMotorSpeed(on ? dir * cfg.flipperSpeed : -dir * cfg.flipperSpeed * 0.7);
      if (pressed & bit) this.events.push({ t: 'flip', side: f.side });
    }

    // 発射（レーンにいるボールだけ）
    const laneBall = this.balls.find((b) => this.inLane(b));
    if (input & IN_LAUNCH) this.launchCharge = Math.min(1, this.launchCharge + DT / 0.9);
    if (released & IN_LAUNCH) {
      if (laneBall) {
        const power = this.launchCharge;
        const v = cfg.launchMin + (cfg.launchMax - cfg.launchMin) * power;
        laneBall.body.setLinearVelocity({ x: 0, y: -v });
        laneBall.body.setAwake(true);
        laneBall.launched = true;
        laneBall.saveUntil = this.tick + Math.round(cfg.ballSave * HZ);
        this.events.push({ t: 'launch', power });
      }
      this.launchCharge = 0;
    }
    this.prevInput = input;

    for (const b of this.balls) {
      const f = b.body.getFixtureList();
      if (f) f.setRestitution(cfg.ballRestitution);
    }

    this.world.step(DT, 8, 3);
    this.tick++;
    if (this.phase !== 'play') {
      this.contacts.length = 0;
      return;
    }
    this.processContacts();
    this.updateStars();
    this.processPending();
    this.updateBalls();
    this.checkEnd();
  }

  inLane(b: Ball): boolean {
    const p = b.body.getPosition();
    const v = b.body.getLinearVelocity();
    return p.x > FIELD_RIGHT && p.y > 20 && Math.hypot(v.x, v.y) < 1.5;
  }

  private processContacts(): void {
    for (const c of this.contacts) {
      const pairs: [Tag, Tag, Body, Body][] = [[c.a, c.b, c.ba, c.bb], [c.b, c.a, c.bb, c.ba]];
      for (const [x, y, bx, by] of pairs) {
        if (x.kind === 'ball' && y.kind === 'star') {
          const s = this.stars[y.id];
          if (!s.alive || this.tick - s.lastHit < 10) continue;
          s.lastHit = this.tick;
          s.decay = 0;
          this.addCharge(s, 1);
          const bp = bx.getPosition(), sp = by.getPosition();
          this.kick(bx, bp.x - sp.x, bp.y - sp.y, this.cfg.popKick);
          this.events.push({ t: 'hit', star: s.id, charge: s.charge, x: sp.x, y: sp.y });
        } else if (x.kind === 'ball' && y.kind === 'bumper') {
          const bp = bx.getPosition(), sp = by.getPosition();
          this.kick(bx, bp.x - sp.x, bp.y - sp.y, this.cfg.popKick * 1.3);
          this.events.push({ t: 'bump', x: sp.x, y: sp.y });
        } else if (x.kind === 'star' && y.kind === 'star' && x.id < y.id) {
          if (c.rel < this.cfg.looseHitSpeed) continue;
          for (const id of [x.id, y.id]) {
            const s = this.stars[id];
            if (!s.alive || this.tick - s.lastHit < 10) continue;
            s.lastHit = this.tick;
            s.decay = 0;
            this.addCharge(s, 1);
            const p = s.body.getPosition();
            this.events.push({ t: 'hit', star: s.id, charge: s.charge, x: p.x, y: p.y });
          }
        }
      }
    }
    this.contacts.length = 0;
  }

  private kick(body: Body, dx: number, dy: number, strength: number): void {
    const d = Math.hypot(dx, dy) || 1;
    const m = body.getMass();
    body.applyLinearImpulse({ x: (dx / d) * strength * m, y: (dy / d) * strength * m }, body.getWorldCenter(), true);
  }

  private addCharge(s: Star, n: number, chainFrom = -1, delay = 0): void {
    if (!s.alive) return;
    s.charge += n;
    const max = Math.round(this.cfg.maxCharge);
    if (s.charge >= max && s.pendingAt < 0) {
      s.charge = max;
      const d = chainFrom >= 0 ? delay : 0.04;
      s.pendingAt = this.tick + Math.max(1, Math.round(d * HZ));
      s.pendingChain = chainFrom;
    }
  }

  private updateStars(): void {
    const decayTicks = this.cfg.decayTime;
    for (const s of this.stars) {
      if (!s.alive) continue;
      if (s.loose) {
        const p = s.body.getPosition();
        if (p.x < 0 || p.x > BOARD_W || p.y < 0 || p.y > BOARD_H) {
          this.removeStar(s);
          this.events.push({ t: 'fizzle', star: s.id, x: p.x, y: p.y });
          continue;
        }
      }
      if (s.charge > Math.round(this.cfg.decayFloor) && s.pendingAt < 0) {
        s.decay += DT;
        if (s.decay >= decayTicks) {
          s.decay = 0;
          s.charge--;
          this.events.push({ t: 'decay', star: s.id });
        }
      }
    }
  }

  private processPending(): void {
    // 同じティックに複数爆発する場合は ID 順（決定性のため）
    for (const s of this.stars) {
      if (s.alive && s.pendingAt >= 0 && s.pendingAt <= this.tick) this.explode(s);
    }
    if (this.chainUntil >= 0 && this.tick > this.chainUntil) {
      this.events.push({ t: 'chainEnd', chain: this.chainCount });
      this.chainUntil = -1;
      this.chainCount = 0;
    }
  }

  private removeStar(s: Star): void {
    s.alive = false;
    this.world.destroyBody(s.body);
  }

  private explode(s: Star): void {
    const cfg = this.cfg;
    const p = s.body.getPosition().clone();
    if (this.chainUntil < 0) {
      this.chainId++;
      this.chainCount = 0;
    }
    this.chainCount++;
    this.bestChain = Math.max(this.bestChain, this.chainCount);
    this.chainUntil = this.tick + Math.round(cfg.chainWindow * HZ);
    s.exploded = true;
    s.explodedChain = this.chainId;
    s.pendingAt = -1;
    this.removeStar(s);
    this.score += 100 * this.chainCount;

    const R = cfg.blastRadius * (0.75 + 0.45 * (s.r / 0.55));
    for (const o of this.stars) {
      if (!o.alive) continue;
      const op = o.body.getPosition();
      const d = Math.hypot(op.x - p.x, op.y - p.y) - o.r;
      if (d <= R) {
        if (o.loose) this.blast(o.body, p.x, p.y, R);
        // 同じ連鎖で2回以上は爆風チャージを受けない → 先に当てておいた星だけが連鎖する
        if (o.blastChain === this.chainId) continue;
        o.blastChain = this.chainId;
        o.decay = 0;
        this.addCharge(o, Math.round(cfg.blastCharge), this.chainId, cfg.chainDelay * (0.6 + 0.8 * Math.max(0, d) / R));
      }
    }
    for (const b of this.balls) this.blast(b.body, p.x, p.y, R * 1.15);

    const last = this.starsAlive() === 0 && !this.stars.some((x) => x.alive && x.pendingAt >= 0);
    this.events.push({ t: 'explode', star: s.id, x: p.x, y: p.y, r: R, chain: this.chainCount, last });

    // 星座の線
    this.stage.links.forEach(([a, b], i) => {
      if (this.litLinks.has(i) || (a !== s.id && b !== s.id)) return;
      const other = this.stars[a === s.id ? b : a];
      if (other.exploded && other.explodedChain === this.chainId) {
        this.litLinks.add(i);
        this.score += 500;
        this.events.push({ t: 'link', a, b });
      }
    });
    if (!this.supernova && this.stage.links.length > 0 && this.litLinks.size === this.stage.links.length) {
      this.supernova = true;
      this.score += 5000;
      this.ballsLeft++;
      this.events.push({ t: 'supernova' });
    }
  }

  private blast(body: Body, x: number, y: number, R: number): void {
    const bp = body.getPosition();
    const dx = bp.x - x, dy = bp.y - y;
    const d = Math.hypot(dx, dy);
    if (d > R) return;
    const k = 1 - d / R;
    this.kick(body, dx || 0.001, dy || -1, this.cfg.blastForce * (0.35 + 0.65 * k));
  }

  private updateBalls(): void {
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      const p = b.body.getPosition();
      // どこかで止まって動かなくなったボールは軽く揺らす（フリッパーで抱えている時は除く）
      const v = b.body.getLinearVelocity();
      if (Math.hypot(v.x, v.y) < 0.15 && !this.inLane(b) && !(this.prevInput & (IN_LEFT | IN_RIGHT))) {
        if (++b.still > HZ * 2.5) {
          b.still = 0;
          this.kick(b.body, 6.9 - p.x, -3, 6);
        }
      } else b.still = 0;
      if (p.y > BOARD_H + 0.5 || p.x < -1 || p.x > BOARD_W + 1) {
        this.world.destroyBody(b.body);
        this.balls.splice(i, 1);
        const saved = b.saveUntil >= 0 && this.tick <= b.saveUntil;
        this.events.push({ t: 'drain', saved });
        if (saved) this.spawnBall();
        else if (this.balls.length === 0) {
          if (this.ballsLeft > 0) {
            this.ballsLeft--;
            this.spawnBall();
          } else if (this.starsAlive() > 0) {
            this.phase = 'gameover';
            this.events.push({ t: 'gameover' });
          }
        }
      }
    }
  }

  private checkEnd(): void {
    if (this.phase === 'play' && this.starsAlive() === 0) {
      this.phase = 'clear';
      this.score += 1000 * (this.ballsLeft + this.balls.length);
      this.events.push({ t: 'clear' });
    }
  }

  /** 状態の要約（決定性テスト用） */
  digest(): number[] {
    const out: number[] = [this.tick, this.score, this.ballsLeft];
    for (const b of this.balls) {
      const p = b.body.getPosition();
      out.push(p.x, p.y);
    }
    for (const s of this.stars) out.push(s.alive ? 1 : 0, s.charge);
    for (const f of this.flippers) out.push(f.body.getAngle());
    return out;
  }
}
