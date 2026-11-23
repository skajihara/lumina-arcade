/**
 * 自動プレイヤー。難易度測定と自動テストに使う。
 *
 * 狙い撃ち：ボールがフリッパーの上にある間、毎ティック「今弾いたらどこへ飛ぶか」を
 * 星のない小さな盤面（シャドウ）で先読みし、価値の高い星に当たる瞬間に弾く。
 * ボールが落ちそうになったら、狙いが無くても弾いて救う。
 *
 * skill（0..1）が低いほど：先読みの頻度が下がり、反応が遅れ（押すまでの遅延がぶれる）、
 * 救いの弾きを外す。これで上手さの差がクリア率に出る。
 */
import { Rng } from '@engine/rng';
import { BALL_R, IN_LAUNCH, IN_LEFT, IN_RIGHT, NovaSim, PIVOT_L, PIVOT_R, type Ball } from './sim';
import type { StageDef } from './stages';

type Side = 'L' | 'R';
const SIDES: Side[] = ['L', 'R'];
const bitOf = (s: Side) => (s === 'L' ? IN_LEFT : IN_RIGHT);
const pivotOf = (s: Side) => (s === 'L' ? PIVOT_L : PIVOT_R);

const SHADOW_STAGE: StageDef = { id: 'shadow', name: 'shadow', hint: '', stars: [{ x: 0.2, y: 0.2, r: 0.05 }], links: [] };

export interface BotStats {
  aimed: number;
  saves: number;
  predictions: number;
}

export class NovaBot {
  private rng: Rng;
  private holdLaunch = 0;
  private flipHold = { L: 0, R: 0 };
  /** 押す予定（反応の遅れ）：残りティック。-1 なら予定なし */
  private pending = { L: -1, R: -1 };
  private shadow: NovaSim | null = null;
  /** 0..1。低いほど反応が遅く、狙いがぶれる */
  skill: number;
  /** 狙い撃ちを使うか（false なら反射的に弾くだけ） */
  aim = true;
  /** 直近の狙い（デバッグ用） */
  lastTarget = -1;
  stats: BotStats = { aimed: 0, saves: 0, predictions: 0 };
  /** 操作するボールとフリッパーの持ち主（Echo Loop：今のループ番号） */
  owner = 0;
  /** 星ごとの狙いやすさの補正（Echo Loop：残響が壊してくれる星は後回しにする） */
  bias: ((id: number) => number) | null = null;

  constructor(seed = 1, skill = 0.8) {
    this.rng = new Rng(seed);
    this.skill = skill;
  }

  input(sim: NovaSim): number {
    let m = 0;
    for (const side of SIDES) {
      const bit = bitOf(side);
      if (this.flipHold[side] > 0) {
        this.flipHold[side]--;
        m |= bit;
        continue;
      }
      if (this.pending[side] >= 0) {
        if (this.pending[side]-- === 0) {
          this.flipHold[side] = 18 + this.rng.int(0, 8);
          m |= bit;
        }
        continue;
      }
      const ball = this.ballOver(sim, side);
      if (!ball) continue;
      if (this.decide(sim, side, ball)) {
        // 反応の遅れ：上手いほど短く、ぶれも小さい
        const lag = Math.max(0, Math.round((1 - this.skill) * 7 + this.rng.gauss() * (1 - this.skill) * 5));
        if (lag === 0) {
          this.flipHold[side] = 18 + this.rng.int(0, 8);
          m |= bit;
        } else this.pending[side] = lag - 1;
      }
    }
    const lane = sim.balls.some((b) => b.owner === this.owner && sim.inLane(b));
    if (lane) {
      if (this.holdLaunch === 0) this.holdLaunch = 20 + this.rng.int(0, 90);
      this.holdLaunch--;
      if (this.holdLaunch > 0) m |= IN_LAUNCH;
    } else this.holdLaunch = 0;
    return m;
  }

  /** このフリッパーの上（弾ける範囲）にあるボール */
  private ballOver(sim: NovaSim, side: Side): Ball | undefined {
    const pv = pivotOf(side);
    const L = sim.cfg.flipperLength;
    for (const b of sim.balls) {
      if (b.owner !== this.owner) continue;
      const p = b.body.getPosition();
      const v = b.body.getLinearVelocity();
      if (p.x > 13.2) continue;
      const dx = (p.x - pv.x) * (side === 'L' ? 1 : -1);
      if (dx > -0.2 && dx < L + 0.45 && p.y > 20.2 && p.y < 23.2 && v.y > -2) return b;
    }
    return undefined;
  }

  /** 今弾くべきか */
  private decide(sim: NovaSim, side: Side, ball: Ball): boolean {
    const p = ball.body.getPosition();
    const v = ball.body.getLinearVelocity();
    const dx = (p.x - pivotOf(side).x) * (side === 'L' ? 1 : -1);
    const L = sim.cfg.flipperLength;
    const speed = Math.hypot(v.x, v.y);
    // 支点の上で止まっているボールは叩かない（転がり落ちるのを待つ）
    if (dx < 0.6 && speed < 0.6) return false;
    // 落ちる直前：狙いが無くても救う
    const leaving = dx > L - 0.15 || p.y > 22.6;
    if (leaving) {
      if (this.rng.next() < 0.45 + 0.55 * this.skill) {
        this.stats.saves++;
        return true;
      }
      return false;
    }
    if (!this.aim) return dx > 0.8 && this.rng.next() < 0.08;
    // 先読みは上手いほど頻繁に行う
    if (this.rng.next() > 0.25 + 0.75 * this.skill) return false;
    const path = this.predict(sim, side, ball);
    const target = this.firstStar(sim, path);
    const val = target >= 0 ? this.value(sim, target) + (this.bias?.(target) ?? 0) : 0;
    // ボールがまだ十分フリッパーの上にある間は、良い狙いだけを待つ。端に近づくほど妥協する
    const urgency = Math.min(1, Math.max(0, dx / L));
    const need = 2.6 - 2.0 * urgency;
    if (val >= need) {
      this.lastTarget = target;
      this.stats.aimed++;
      return true;
    }
    return false;
  }

  /** 星の価値（狙う優先度） */
  private value(sim: NovaSim, id: number): number {
    const max = Math.round(sim.cfg.maxCharge);
    const s = sim.stars[id];
    if (s.charge >= max - 1) {
      // 起爆：連鎖で巻き込める星の数と、灯る星座の線で価値を決める。
      // 線の相手がまだチャージされていないなら、先にそちらを育てた方が得（減点）
      const chain = this.chainFrom(sim, id);
      let lit = 0, missed = 0;
      sim.links.forEach(([a, b], i) => {
        if (sim.litLinks.has(i)) return;
        const ia = chain.has(a), ib = chain.has(b);
        if (ia && ib) lit++;
        else if ((ia && sim.stars[b].alive) || (ib && sim.stars[a].alive)) missed++;
      });
      const all = sim.stars.filter((o) => o.alive).length;
      return 0.8 + chain.size * 0.7 + lit * 0.8 - missed * 0.9 * this.skill + (chain.size === all ? 3 : 0);
    }
    // チャージが減りかけている星を優先して育てる
    if (s.charge > 0) return 2.2 + s.decay / sim.cfg.decayTime;
    return 2.0;
  }

  /** 星 id を爆発させた時に連鎖する星の集合（爆風チャージで最大に届く星をたどる） */
  private chainFrom(sim: NovaSim, id: number): Set<number> {
    const max = Math.round(sim.cfg.maxCharge);
    const need = max - Math.round(sim.cfg.blastCharge);
    const R = sim.cfg.blastRadius;
    const set = new Set<number>([id]);
    const queue = [id];
    while (queue.length) {
      const s = sim.stars[queue.pop()!];
      const p = s.body.getPosition();
      const Rs = R * (0.75 + 0.45 * (s.r / 0.55));
      for (const o of sim.stars) {
        if (!o.alive || set.has(o.id) || o.charge < need) continue;
        const q = o.body.getPosition();
        if (Math.hypot(q.x - p.x, q.y - p.y) - o.r <= Rs) {
          set.add(o.id);
          queue.push(o.id);
        }
      }
    }
    return set;
  }

  /** シャドウ盤面で「今このフリッパーを弾いたら」のボールの軌跡を先読みする */
  private predict(sim: NovaSim, side: Side, ball: Ball): { x: number; y: number }[] {
    this.stats.predictions++;
    if (!this.shadow) this.shadow = new NovaSim({ ...SHADOW_STAGE, outlanes: sim.stage.outlanes, slings: sim.stage.slings }, { ...sim.cfg });
    const sh = this.shadow;
    sh.cfg = sim.cfg;
    const mine = sim.flippers.filter((f) => f.owner === this.owner);
    for (let i = 0; i < 2; i++) {
      const f = mine[i] ?? sim.flippers[i], g = sh.flippers[i];
      g.body.setTransform(f.body.getPosition(), f.body.getAngle());
      g.body.setAngularVelocity(f.body.getAngularVelocity());
      g.body.setLinearVelocity(f.body.getLinearVelocity());
      g.body.setAwake(true);
    }
    const sb = sh.balls[0] ?? sh.spawnBall();
    sb.body.setTransform(ball.body.getPosition(), 0);
    sb.body.setLinearVelocity(ball.body.getLinearVelocity());
    sb.body.setAngularVelocity(0);
    sb.body.setAwake(true);
    const bit = bitOf(side);
    const path: { x: number; y: number }[] = [];
    for (let i = 0; i < 60; i++) {
      sh.step(i < 22 ? bit : 0);
      const q = sb.body.getPosition();
      const w = sb.body.getLinearVelocity();
      path.push({ x: q.x, y: q.y });
      if (q.y < 19.8 && w.y < 0) break;
    }
    // 離れた後は放物線で外挿（壁は無視、1.2秒まで）
    const q = sb.body.getPosition();
    const w = sb.body.getLinearVelocity();
    const g = sim.cfg.gravity;
    for (let t = 1 / 60; t < 1.2; t += 1 / 60) {
      const x = q.x + w.x * t, y = q.y + w.y * t + 0.5 * g * t * t;
      if (x < 0.6 || x > 13.2 || y < 0.6) break;
      path.push({ x, y });
      if (y > 20) break;
    }
    return path;
  }

  private firstStar(sim: NovaSim, path: { x: number; y: number }[]): number {
    for (const p of path) {
      for (const s of sim.stars) {
        if (!s.alive) continue;
        const q = s.body.getPosition();
        if (Math.hypot(q.x - p.x, q.y - p.y) < s.r + BALL_R + 0.05) return s.id;
      }
      for (const b of sim.bumpers) if (Math.hypot(b.x - p.x, b.y - p.y) < b.r + BALL_R) return -1;
    }
    return -1;
  }
}
