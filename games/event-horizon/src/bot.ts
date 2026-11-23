/**
 * Event Horizon の自動プレイヤー。難易度測定と自動プレイに使う。
 *
 * 1. 集める：一番近いかけらの上で、小さな円を描きながら引く（かき混ぜて周回させる）
 * 2. 運ぶ：周回させたまま、穴から少し離れた投げる位置へ移る
 * 3. 投げる：数ティックごとに「今放したら／今解放したら」かけらがどう飛ぶかを放物線で先読みし、
 *    穴に入るかけらが一番多い方を選ぶ
 *
 * skill（0..1）が低いほど：円がぶれ、先読みの頻度が下がり、投げる判断が遅れる。
 */
import { Rng } from '@engine/rng';
import { HorizonSim, IN_BURST, IN_PULL, WORLD_H, WORLD_W, type HorizonInput, type Shard } from './sim';

type Mode = 'gather' | 'carry' | 'wait';

export class HorizonBot {
  private rng: Rng;
  private mode: Mode = 'gather';
  private angle = 0;
  private orbitTime = 0;
  private waitUntil = 0;
  private goal = 0;
  private carryTime = 0;
  private home: { x: number; y: number } | null = null;
  private homeTime = 0;
  private emptyTime = 0;
  private launch: { x: number; y: number } | null = null;
  skill: number;
  stats = { drops: 0, bursts: 0 };

  constructor(seed = 1, skill = 0.8) {
    this.rng = new Rng(seed);
    this.skill = skill;
  }

  /** ブラックホールの近く（周回している）かけら */
  private orbiting(sim: HorizonSim, R = 2.6): Shard[] {
    return sim.shards.filter((s) => {
      if (s.state !== 'free') return false;
      const p = s.body.getPosition();
      return Math.hypot(p.x - sim.bh.x, p.y - sim.bh.y) < R;
    });
  }

  /**
   * 放した（or 解放した）後の放物線の評価：穴に入るかけらの数から、奈落・画面の外へ落ちる数を引く。
   * 壁は無視する（ざっくりした先読み）
   */
  private hits(sim: HorizonSim, burst: boolean): { hit: number; fall: number } {
    const cfg = sim.cfg;
    const pits = sim.stage.pits ?? [];
    let hit = 0, fall = 0;
    for (const s of this.orbiting(sim, burst ? cfg.burstRadius : 3)) {
      const p = s.body.getPosition();
      let { x: vx, y: vy } = s.body.getLinearVelocity();
      if (burst) {
        const ex = p.x - sim.bh.x, ey = p.y - sim.bh.y;
        const r = Math.hypot(ex, ey) || 1e-3;
        const k = cfg.burstForce * (1 - 0.55 * (r / cfg.burstRadius)) * (s.kind === 'heavy' ? 0.7 : 1);
        vx += (ex / r) * k;
        vy += (ey / r) * k;
      }
      let px = p.x, py = p.y;
      for (let t = 0; t < 2.5; t += 1 / 30) {
        const x = p.x + vx * t, y = p.y + vy * t + 0.5 * cfg.gravity * t * t;
        // 壁に当たったら、その先は読まない
        if (t > 0 && this.blocked(sim, px, py, x, y)) break;
        px = x;
        py = y;
        if (sim.stage.goals.some((g) => Math.hypot(x - g.x, y - g.y) < g.r * 0.85)) {
          hit++;
          break;
        }
        if (y > WORLD_H) {
          if (pits.some(([a, b]) => x > a && x < b)) fall++;
          break;
        }
        if (x < 0 || x > WORLD_W) {
          // 横の壁に当たって落ちる：その下が奈落なら落ちたとみなす
          const ex = x < 0 ? 0.3 : WORLD_W - 0.3;
          if (pits.some(([a, b]) => ex > a && ex < b)) fall++;
          break;
        }
        if (y < 0) break;
      }
    }
    return { hit, fall };
  }

  /** 投げる位置：穴を囲む円の上で、穴との間に壁がなく、今の位置から近い所 */
  private pickLaunch(sim: HorizonSim, g: { x: number; y: number; r: number }): { x: number; y: number } {
    const R = g.r + sim.cfg.goalGuard + 1.2;
    let best = { x: g.x, y: g.y + R }, bd = Infinity;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const x = g.x + Math.cos(a) * R, y = g.y + Math.sin(a) * R;
      if (x < 1.5 || x > WORLD_W - 1.5 || y < 1.8 || y > WORLD_H - 2.2) continue;
      if (this.blocked(sim, x, y, g.x, g.y)) continue;
      // 周回の輪が壁にこすれない所
      if (this.wallDist(sim, x, y) < sim.cfg.ringR + 0.6) continue;
      // 下から投げ上げるより、横か上からの方が入りやすい
      const d = Math.hypot(x - sim.bh.x, y - sim.bh.y) + Math.max(0, y - g.y) * 0.8;
      if (d < bd) { bd = d; best = { x, y }; }
    }
    return best;
  }

  /** 点から一番近い壁までの距離 */
  private wallDist(sim: HorizonSim, x: number, y: number): number {
    let best = Infinity;
    for (const line of sim.stage.walls ?? []) {
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1], b = line[i];
        const dx = b.x - a.x, dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
        best = Math.min(best, Math.hypot(x - a.x - dx * t, y - a.y - dy * t));
      }
    }
    return best;
  }

  /** 2点の間に壁があるか */
  private blocked(sim: HorizonSim, x0: number, y0: number, x1: number, y1: number): boolean {
    const cross = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    for (const line of sim.stage.walls ?? []) {
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1], b = line[i];
        const d1 = cross(x0, y0, x1, y1, a.x, a.y), d2 = cross(x0, y0, x1, y1, b.x, b.y);
        const d3 = cross(a.x, a.y, b.x, b.y, x0, y0), d4 = cross(a.x, a.y, b.x, b.y, x1, y1);
        if (d1 * d2 < 0 && d3 * d4 < 0) return true;
      }
    }
    return false;
  }

  input(sim: HorizonSim): HorizonInput {
    const dt = 1 / 120;
    const free = sim.free();
    if (!free.length) return { x: sim.bh.x, y: sim.bh.y, bits: 0 };
    // 円の速さと半径：上手いほど安定
    const w = 3.6 + (1 - this.skill) * this.rng.gauss() * 0.8;
    this.angle += w * dt;
    const R = 0.25 + (1 - this.skill) * 0.3 * Math.abs(this.rng.gauss());
    // 目標へ「運ぶ速さ」でしか動かさない（速すぎると輪からこぼれる）
    const speed = this.mode === 'carry' ? 5 + 2 * this.skill : 9;
    const circle = (cx: number, cy: number, bits: number): HorizonInput => {
      const gx = cx + Math.cos(this.angle) * R, gy = cy + Math.sin(this.angle) * R;
      const dx = gx - sim.bh.x, dy = gy - sim.bh.y;
      const d = Math.hypot(dx, dy);
      // 運んでいる時は、目標の手前でゆっくり減速する（急に止まると輪からこぼれる）
      const sp = this.mode === 'carry' ? Math.min(speed, 0.6 + d * 2.2) : speed;
      const step = sp * dt * 1.5;
      return d <= step ? { x: gx, y: gy, bits } : { x: sim.bh.x + (dx / d) * step, y: sim.bh.y + (dy / d) * step, bits };
    };

    if (this.mode === 'wait') {
      // 投げた後：かけらが飛んでいく間は引かない
      if (sim.worldTime < this.waitUntil) return { x: sim.bh.x, y: sim.bh.y, bits: 0 };
      this.mode = 'gather';
      this.orbitTime = 0;
      this.home = null;
    }

    const orb = this.orbiting(sim);
    if (this.mode === 'gather') {
      // まだ周回していないかけらのうち、一番近いものの上でかき混ぜる。
      // 周回が始まったら中心を固定する（自分の周りを回るかけらを追いかけない）
      // 中心は「集めに行く時」に1回だけ決め、周回が始まらないまま3秒たったら決め直す
      this.homeTime += dt;
      if (!this.home || (!orb.length && this.homeTime > 3)) {
        // 飛んでいるかけらより、止まっているかけらを選ぶ
        const still = free.filter((s) => !orb.includes(s) && Math.hypot(s.body.getLinearVelocity().x, s.body.getLinearVelocity().y) < 2);
        const rest = still.length ? still : free.filter((s) => !orb.includes(s));
        let best = rest[0] ?? free[0], bd = Infinity;
        for (const s of rest) {
          const p = s.body.getPosition();
          const d = Math.hypot(p.x - sim.bh.x, p.y - sim.bh.y);
          if (d < bd) { bd = d; best = s; }
        }
        const p = best.body.getPosition();
        // 引力が重力に勝てる高さで待つ（重いかけらは近くまで降りる）
        const lift = Math.min(3.2, 0.85 * Math.sqrt((sim.cfg.bhPull * best.pullScale) / Math.max(0.1, sim.cfg.gravity)));
        this.home = { x: Math.min(WORLD_W - 1.5, Math.max(1.5, p.x)), y: Math.max(2, Math.min(p.y - lift, 9.2)) };
        this.homeTime = 0;
      }
      this.orbitTime = orb.length ? this.orbitTime + dt : 0;
      // 周りのかけらも集めたいので、少し待ってから運ぶ（残りが少なければすぐ）
      const enough = orb.length >= Math.min(free.length, 3) || this.orbitTime > 2.5;
      if (orb.length && this.orbitTime > 0.8 && enough) {
        this.mode = 'carry';
        this.carryTime = 0;
        this.launch = null;
        this.home = null;
        // 近い穴を選ぶ
        let gd = Infinity;
        sim.stage.goals.forEach((g, i) => {
          const d = Math.hypot(g.x - sim.bh.x, g.y - sim.bh.y);
          if (d < gd) { gd = d; this.goal = i; }
        });
      }
      const h = this.home ?? { x: sim.bh.x, y: sim.bh.y };
      return circle(h.x, h.y, IN_PULL);
    }

    // carry：穴の手前（守りの外、下側から）へ運ぶ
    this.carryTime += dt;
    // 輪が一瞬空になっても、すぐには諦めない（はねたかけらが戻ってくる）
    this.emptyTime = orb.length ? 0 : this.emptyTime + dt;
    if (this.emptyTime > 0.6) {
      this.mode = 'gather';
      this.orbitTime = 0;
      this.home = null;
      return { x: sim.bh.x, y: sim.bh.y, bits: IN_PULL };
    }
    const g = sim.stage.goals[this.goal];
    if (!this.launch) this.launch = this.pickLaunch(sim, g);
    const lx = this.launch.x, ly = this.launch.y;
    const atLaunch = Math.hypot(sim.bh.x - (lx + Math.cos(this.angle) * R), sim.bh.y - (ly + Math.sin(this.angle) * R)) < 1.6;
    if (atLaunch || this.carryTime > 6) {
      const every = this.skill > 0.7 ? 2 : 6;
      if (sim.tick % every === 0) {
        const drop = this.hits(sim, false);
        const burst = sim.cooldown <= 0 ? this.hits(sim, true) : { hit: 0, fall: 99 };
        const score = (h: { hit: number; fall: number }) => h.hit - h.fall * (0.4 + 0.6 * this.skill);
        const want = Math.max(1, Math.ceil(orb.length * (this.carryTime > 8 ? 0.2 : 0.5)));
        const best = score(burst) > score(drop) ? burst : drop;
        if ((best.hit >= want && score(best) > 0) || this.carryTime > 14) {
          this.mode = 'wait';
          this.waitUntil = sim.worldTime + 1.2;
          if (best === burst) {
            this.stats.bursts++;
            return { x: sim.bh.x, y: sim.bh.y, bits: IN_BURST };
          }
          this.stats.drops++;
          return { x: sim.bh.x, y: sim.bh.y, bits: 0 };
        }
      }
    }
    return circle(lx, ly, IN_PULL);
  }
}
