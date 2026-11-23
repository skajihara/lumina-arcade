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

  /** 放した（or 解放した）後の放物線が穴に入るかけらの数 */
  private hits(sim: HorizonSim, burst: boolean): number {
    const cfg = sim.cfg;
    const g = sim.stage.goals[this.goal];
    let n = 0;
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
      for (let t = 0; t < 2.2; t += 1 / 30) {
        const x = p.x + vx * t, y = p.y + vy * t + 0.5 * cfg.gravity * t * t;
        if (x < 0 || x > WORLD_W || y > WORLD_H || y < 0) break;
        if (Math.hypot(x - g.x, y - g.y) < g.r * 0.85) {
          n++;
          break;
        }
      }
    }
    return n;
  }

  input(sim: HorizonSim): HorizonInput {
    const cfg = sim.cfg;
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
      const step = speed * dt * 1.5;
      return d <= step ? { x: gx, y: gy, bits } : { x: sim.bh.x + (dx / d) * step, y: sim.bh.y + (dy / d) * step, bits };
    };

    if (this.mode === 'wait') {
      // 投げた後：かけらが飛んでいく間は引かない
      if (sim.time < this.waitUntil) return { x: sim.bh.x, y: sim.bh.y, bits: 0 };
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
        const rest = free.filter((s) => !orb.includes(s));
        let best = rest[0] ?? free[0], bd = Infinity;
        for (const s of rest) {
          const p = s.body.getPosition();
          const d = Math.hypot(p.x - sim.bh.x, p.y - sim.bh.y);
          if (d < bd) { bd = d; best = s; }
        }
        const p = best.body.getPosition();
        this.home = { x: Math.min(WORLD_W - 1.5, Math.max(1.5, p.x)), y: Math.max(2, Math.min(p.y - 3.2, 8.6)) };
        this.homeTime = 0;
      }
      this.orbitTime = orb.length ? this.orbitTime + dt : 0;
      // 周りのかけらも集めたいので、少し待ってから運ぶ（残りが少なければすぐ）
      const enough = orb.length >= Math.min(free.length, 3) || this.orbitTime > 2.5;
      if (orb.length && this.orbitTime > 0.8 && enough) {
        this.mode = 'carry';
        this.carryTime = 0;
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
    if (!orb.length) {
      this.mode = 'gather';
      this.orbitTime = 0;
      return { x: sim.bh.x, y: sim.bh.y, bits: IN_PULL };
    }
    const g = sim.stage.goals[this.goal];
    const away = g.r + cfg.goalGuard + 1.6;
    const ax = g.x < WORLD_W / 2 ? 1 : -1;
    const lx = Math.min(WORLD_W - 1.5, Math.max(1.5, g.x + ax * away * 0.7));
    const ly = Math.min(WORLD_H - 1.5, g.y + away * 0.7);
    const atLaunch = Math.hypot(sim.bh.x - (lx + Math.cos(this.angle) * R), sim.bh.y - (ly + Math.sin(this.angle) * R)) < 1.6;
    if (atLaunch || this.carryTime > 6) {
      const every = this.skill > 0.7 ? 2 : 6;
      if (sim.tick % every === 0) {
        const drop = this.hits(sim, false);
        const burst = sim.cooldown <= 0 ? this.hits(sim, true) : 0;
        const want = Math.max(1, Math.ceil(orb.length * (this.carryTime > 8 ? 0.2 : 0.5)));
        if (Math.max(drop, burst) >= want || this.carryTime > 12) {
          this.mode = 'wait';
          this.waitUntil = sim.time + 1.2;
          if (burst > drop) {
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
