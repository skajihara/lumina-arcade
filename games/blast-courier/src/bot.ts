/**
 * Blast Courier のボット（先読み）。卵が止まっている（または遅い）時、卵の周りのいくつかの点と種類を試し撃ちして
 * 数秒先まで進め、巣に近く・割れず・落ちない撃ち方を選ぶ。skill が低いほど試す数が少なく、撃つ所がぶれる。
 */
import { Rng } from '@engine/rng';
import { CourierSim, HZ, type BlastKind } from './sim';

export class CourierBot {
  private rng: Rng;
  constructor(public skill = 0.8, seed = 3) {
    this.rng = new Rng(seed);
  }

  /** 撃つ時はその爆風、撃たない時は null */
  act(sim: CourierSim): { x: number; y: number; k: BlastKind } | null {
    if (sim.phase !== 'play' || sim.cooldownLeft > 0) return null;
    if (sim.tick % Math.round(HZ * (0.5 - 0.3 * this.skill)) !== 0) return null;
    const v = sim.egg.getLinearVelocity();
    const moving = Math.hypot(v.x, v.y) > 0.35;
    const e = sim.eggPos;
    const n = sim.stage.nest;
    const cands: { x: number; y: number; k: BlastKind }[] = [];
    // 飛んでいる間は少なめに試す（空中でもう一吹き）
    const angs = moving ? 8 : this.skill > 0.7 ? 16 : 10;
    const dists = moving ? [0.6, 1.2] : this.skill > 0.7 ? [0.5, 0.9, 1.4, 2.0] : [0.7, 1.4];
    for (const k of sim.stage.kinds) {
      if (k === 'push' || k === 'delay') {
        for (let i = 0; i < angs; i++) {
          const a = (i / angs) * Math.PI * 2;
          for (const d of dists) cands.push({ x: e.x + Math.cos(a) * d, y: e.y + Math.sin(a) * d, k });
        }
      } else if (k === 'pull') {
        for (let i = 0; i < angs; i++) {
          const a = (i / angs) * Math.PI * 2;
          for (const d of moving ? [2.5] : [1.5, 3, 4.2]) cands.push({ x: e.x + Math.cos(a) * d, y: e.y + Math.sin(a) * d, k });
        }
      } else if (!moving) {
        for (const dx of [-1, -0.5, 0, 0.5, 1]) cands.push({ x: e.x + dx * 0.5, y: e.y + 0.3, k });
      }
    }
    // 先読み：止まるか、雲海に落ちるか、5 秒まで
    const run = (c: CourierSim) => {
      let ob = false, still = 0, near = 1e9;
      for (let i = 0; i < HZ * 5 && c.phase === 'play'; i++) {
        c.step();
        if (c.events.some((q) => q.t === 'ob')) { ob = true; break; }
        const q = c.eggPos;
        near = Math.min(near, Math.hypot(q.x - n.x, q.y - (n.y - 0.5)));
        const w = c.egg.getLinearVelocity();
        still = Math.hypot(w.x, w.y) < 0.3 ? still + 1 : 0;
        if (still > HZ * 0.25) break;
      }
      if (c.phase === 'clear') return 1e6;
      const p = c.eggPos;
      const d = Math.hypot(p.x - n.x, p.y - (n.y - 0.5));
      // 止まった所と、途中で一番巣に近づいた所の両方を見る（上昇気流で上がってから、空中でもう一吹きできる）
      return -(d * 0.7 + near * 0.3) * 10 - c.cracks * 60 - (c.phase === 'fail' ? 1e5 : 0) - (ob ? 400 : 0);
    };
    const base = run(sim.clone()) + (moving ? 0 : -1e4);
    let best: { s: number; c: { x: number; y: number; k: BlastKind } } | null = null;
    for (const cand of cands) {
      const c = sim.clone();
      if (!c.blast(cand.x, cand.y, cand.k)) continue;
      let s = run(c) - 15; // 1回撃つぶんの重み
      // 昇る：一番高い所で横へもう一吹きする続きまで読む（上がって→運ぶ、の組み合わせ）
      if (cand.k === 'lift' && sim.stage.kinds.includes('push')) {
        const up = sim.clone();
        up.blast(cand.x, cand.y, cand.k);
        for (let i = 0; i < HZ * 4 && up.phase === 'play' && !(i > HZ * 0.6 && up.egg.getLinearVelocity().y > 0); i++) up.step();
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const c2 = up.clone();
          const q = c2.eggPos;
          c2.lastBlastTick = -1e9;
          if (!c2.blast(q.x + Math.cos(a) * 0.6, q.y + Math.sin(a) * 0.6, 'push')) continue;
          s = Math.max(s, run(c2) - 30);
        }
      }
      if (!best || s > best.s) best = { s, c: cand };
    }
    if (!best || best.s <= base) return null;
    // 下手なほど、撃つ所がぶれる
    const j = (1 - this.skill) * 0.6;
    return { x: best.c.x + (this.rng.next() - 0.5) * j, y: best.c.y + (this.rng.next() - 0.5) * j, k: best.c.k };
  }
}
