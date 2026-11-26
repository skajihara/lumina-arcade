/**
 * 時空の絵筆のボット（先読み）。
 * 少しごとに、籠に入らない星を探し、その星の行く手のいくつかの場所に3色を試し塗りして先を読む。
 * 一番多く籠に入る塗り方が今より良ければ、本当に塗る。ステージが遊べるかの測定と自動プレイに使う。
 */
import { ChronoSim, HZ, type Brush } from './sim';

const BRUSHES: Brush[] = ['slow', 'fast', 'rewind'];

/** 先読み：horizon 秒進めて、id の星が籠に入るか（と全体の捕まえた数） */
function look(sim: ChronoSim, horizon: number, id: number): { got: boolean; caught: number; miss: number; path: { x: number; y: number }[] } {
  const c = sim.clone();
  const path: { x: number; y: number }[] = [];
  const n = Math.round(horizon * HZ);
  let miss = 0;
  for (let i = 0; i < n && !c.done; i++) {
    c.step();
    const s = c.stars[id];
    if (i % 12 === 0 && s.alive) path.push({ x: s.x, y: s.y });
    // 籠の高さを過ぎた時、籠からどれだけ離れていたか
    if (!s.alive && !s.caught && miss === 0) miss = c.basketDist(s.x) + 1;
  }
  const s = c.stars[id];
  if (s.alive) miss = 300; // まだ落ちていない（待たせすぎ）
  return { got: s.caught, caught: c.caught, miss, path };
}

export class ChronoBot {
  /** skill：低いほど判断の間隔が長く、試す場所が少ない */
  constructor(public skill = 0.85) {}

  act(sim: ChronoSim): void {
    const every = Math.round(HZ * (0.5 - 0.3 * this.skill));
    if (sim.tick % every !== 0 || sim.ink <= 0 || sim.done) return;
    const horizon = 3.5;
    // 床に近い星から
    const order = sim.stars.map((s, i) => ({ s, i })).filter(({ s }) => s.alive && s.y > 40).sort((a, b) => b.s.y - a.s.y);
    for (const { i } of order.slice(0, 2)) {
      const base = look(sim, horizon, i);
      if (base.got) continue;
      // 籠に入る塗り方が一番。なければ、籠に一番近づく塗り方（重ねて塗れば届く）
      const score = (r: { got: boolean; caught: number; miss: number }) => (r.got ? 10000 + r.caught * 100 : r.caught * 100 - r.miss);
      const s0 = score(base);
      let best: { x: number; y: number; k: Brush; sc: number } | null = null;
      const tries = this.skill > 0.7 ? [1, 2, 3, 5] : [2, 4];
      for (const j of tries) {
        const p = base.path[j];
        if (!p) continue;
        for (const k of BRUSHES) {
          const c = sim.clone();
          c.paint(p.x, p.y, k);
          const r = look(c, horizon, i);
          const sc = score(r);
          if (sc > s0 + 40 && (!best || sc > best.sc)) best = { x: p.x, y: p.y, k, sc };
        }
      }
      if (best) {
        sim.paint(best.x, best.y, best.k);
        return;
      }
    }
  }
}
