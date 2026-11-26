/**
 * Blast Courier のボット（先読み）。卵が止まっている（または遅い）時、いくつかの向き・強さ・種類を試し撃ちして
 * 数秒先まで進め、巣に近く・割れず・落ちない撃ち方を選ぶ。skill が低いほど試す数が少なく、向きと強さがぶれる。
 * BC-10：人と同じ操作（押す＝向きと強さ、遅れ＝置く所・向き・強さ、吸う・昇る＝置く所）で撃つ。
 */
import { Rng } from '@engine/rng';
import { CourierSim, HZ, type CourierAction } from './sim';

export class CourierBot {
  private rng: Rng;
  constructor(public skill = 0.8, seed = 3) {
    this.rng = new Rng(seed);
  }

  /** 撃つ時はその爆風、撃たない時は null */
  act(sim: CourierSim): CourierAction | null {
    if (sim.phase !== 'play' || sim.cooldownLeft > 0) return null;
    if (sim.tick % Math.round(HZ * (0.5 - 0.3 * this.skill)) !== 0) return null;
    const v = sim.egg.getLinearVelocity();
    const moving = Math.hypot(v.x, v.y) > 0.35;
    const e = sim.eggPos;
    const n = sim.stage.nest;
    const cands: CourierAction[] = [];
    // 飛んでいる間は少なめに試す（空中でもう一吹き）
    const angs = moving ? 8 : this.skill > 0.7 ? 20 : 12;
    const pows = moving ? [0.35, 0.65] : this.skill > 0.7 ? [0.28, 0.44, 0.6, 0.76] : [0.35, 0.55, 0.75];
    for (const k of sim.stage.kinds) {
      if (k === 'push') {
        for (let i = 0; i < angs; i++) {
          const a = (i / angs) * Math.PI * 2;
          for (const p of pows) cands.push({ k, x: e.x, y: e.y, ax: Math.cos(a), ay: Math.sin(a), p });
        }
      } else if (k === 'delay') {
        // 遅れ：卵が 1 秒後に来る所に置く（今の速さで先回り）。止まっている時はその場
        const fx = e.x + v.x * sim.cfg.delayTime, fy = e.y + v.y * sim.cfg.delayTime;
        for (let i = 0; i < (moving ? 8 : 10); i++) {
          const a = (i / (moving ? 8 : 10)) * Math.PI * 2;
          for (const p of moving ? [0.45, 0.6] : [0.4, 0.6]) cands.push({ k, x: fx, y: fy, ax: Math.cos(a), ay: Math.sin(a), p });
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
      for (let i = 0; i < HZ * 3.5 && c.phase === 'play'; i++) {
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
    const raw = run(sim.clone());
    // 何もしなくても巣で落ち着くなら撃たない
    if (raw >= 1e6) return null;
    const base = raw + (moving ? 0 : -1e4);
    let best: { s: number; c: CourierAction } | null = null;
    for (const cand of cands) {
      const c = sim.clone();
      if (!c.act(cand)) continue;
      let s = run(c) - 45; // 1回撃つぶんの重み（巣まで 4.5 m 近づかないなら撃たない＝無駄撃ちしない）
      // 昇る：一番高い所で横へもう一吹きする続きまで読む（上がって→運ぶ、の組み合わせ）
      if (cand.k === 'lift' && sim.stage.kinds.includes('push')) {
        const up = sim.clone();
        up.act(cand);
        for (let i = 0; i < HZ * 4 && up.phase === 'play' && !(i > HZ * 0.6 && up.egg.getLinearVelocity().y > 0); i++) up.step();
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const c2 = up.clone();
          const q = c2.eggPos;
          c2.lastBlastTick = -1e9;
          for (const pw of [0.35, 0.55, 0.7]) {
            const c3 = c2.clone();
            if (!c3.act({ k: 'push', x: q.x, y: q.y, ax: Math.cos(a), ay: Math.sin(a), p: pw })) continue;
            s = Math.max(s, run(c3) - 90);
          }
        }
      }
      if (!best || s > best.s) best = { s, c: cand };
    }
    if (!best || best.s <= base + (moving ? 25 : 0)) return null;
    // 下手なほど、向き・強さ・置く所がぶれる
    const j = (1 - this.skill) * 0.6;
    const c = best.c;
    const out: CourierAction = { ...c, x: c.x + (this.rng.next() - 0.5) * j, y: c.y + (this.rng.next() - 0.5) * j };
    if (c.ax !== undefined && c.ay !== undefined) {
      const a = Math.atan2(c.ay, c.ax) + (this.rng.next() - 0.5) * j * 0.25;
      out.ax = Math.cos(a); out.ay = Math.sin(a);
      out.p = (c.p ?? 1) * (1 + (this.rng.next() - 0.5) * j * 0.15);
    }
    return out;
  }
}
