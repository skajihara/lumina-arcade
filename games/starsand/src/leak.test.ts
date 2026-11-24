import { describe, expect, it } from 'vitest';
import { presets, DEFAULT_PRESET } from './config';
import { SandSim, W, H, GR, closest, type StageDef } from './sim';

/**
 * 線の隙間から砂が漏れないこと（ユーザーの指摘 SS-10、SS-14 で粒子の流体＋なめらかな線に作り直した後も）。
 * いろいろな角度の線を、マウスの点の飛び（1〜12マス）で引き、上から砂を落とす。
 * 線より下に砂が1粒も来ないこと。
 */
const cfg = () => ({ ...presets[DEFAULT_PRESET], twist: 0 });
const stage = (sx: number): StageDef => ({
  id: 'leak', name: 'leak', hint: '', walls: [], cups: [], ink: 100000,
  sources: [{ x: sx, y: 1, color: 0, total: 300, rate: 3, width: 9 }],
});

/** マウスで引いたように：a→b を、jump マス間隔の点（少し揺らす）で、点から点へ線分でつなぐ */
function stroke(sim: SandSim, ax: number, ay: number, bx: number, by: number, jump: number) {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / jump));
  let px = ax, py = ay;
  sim.drawLineIds(px, py, px, py);
  for (let i = 1; i <= n; i++) {
    const x = ax + ((bx - ax) * i) / n + (i < n ? 0.37 * (i % 3) : 0), y = ay + ((by - ay) * i) / n + (i < n ? 0.29 * (i % 2) : 0);
    sim.drawLineIds(px, py, x, y);
    px = x; py = y;
  }
}

/** 線より下に来た砂：その x で一番下の線より下にある粒（＋画面の外へ落ちた数） */
function leaked(sim: SandSim): number {
  let n = sim.lost;
  for (let i = 0; i < sim.grains; i++) {
    const x = sim.gx[i], y = sim.gy[i];
    let low = -Infinity;
    for (const s of sim.segs) {
      if (!s.alive) continue;
      const x0 = Math.min(s.ax, s.bx), x1 = Math.max(s.ax, s.bx);
      if (x < x0 || x > x1 || x1 - x0 < 1e-6) continue;
      low = Math.max(low, s.ay + ((s.by - s.ay) * (x - s.ax)) / (s.bx - s.ax));
    }
    if (low > -Infinity && y > low + sim.lineR) n++;
  }
  return n;
}

describe('線の隙間から砂が漏れない', () => {
  // 器のように両端を上げた線（V字）で受け止める。角度いろいろ
  const angles = [0, 8, 17, 26, 33, 45, 52, 60, 70];
  for (const deg of angles) {
    for (const jump of [1, 3, 7, 12]) {
      it(`${deg}°の受け皿、点の間隔 ${jump}`, () => {
        const sim = new SandSim(stage(100), cfg(), 3);
        const t = Math.tan((deg * Math.PI) / 180);
        const half = Math.min(60, Math.round(40 / Math.max(t, 0.35)));
        const cy = 90;
        stroke(sim, 100 - half, Math.round(cy - half * t) - (deg === 0 ? 20 : 0), 100, cy, jump);
        stroke(sim, 100, cy, 100 + half, Math.round(cy - half * t) - (deg === 0 ? 20 : 0), jump);
        if (deg === 0) { stroke(sim, 100 - half, cy - 20, 100 - half, cy, jump); stroke(sim, 100 + half, cy - 20, 100 + half, cy, jump); }
        for (let i = 0; i < 1500; i++) sim.step();
        expect(leaked(sim)).toBe(0);
      });
    }
  }

  it('流れている砂の中を横切って線を引いても、すり抜けない', () => {
    const sim = new SandSim(stage(100), cfg(), 5);
    for (let i = 0; i < 120; i++) sim.step(); // 砂の柱ができている
    stroke(sim, 70, 60, 100, 80, 4);
    stroke(sim, 100, 80, 130, 60, 4);
    // 引いた時にすでに線より下にあった砂は数えない
    const below = new Set<number>();
    const before = leaked(sim);
    for (let i = 0; i < 1500; i++) sim.step();
    expect(leaked(sim)).toBeLessThanOrEqual(before + below.size);
  });

  it('止まっている砂の山を横切って引くと、線の中の砂は上へ押し出され、線に穴があかない', () => {
    const st: StageDef = { ...stage(100), walls: [{ x: 0, y: H - 2, w: W, h: 2 }] };
    const sim = new SandSim(st, { ...cfg(), friction: 0.5 }, 7);
    for (let i = 0; i < 1500; i++) sim.step(); // 床に砂が溜まる
    let top = H;
    for (let i = 0; i < sim.grains; i++) if (Math.abs(sim.gx[i] - 100) < 3) top = Math.min(top, sim.gy[i]);
    expect(H - 2 - top).toBeGreaterThan(1);
    const y0 = H - 2 - 0.5;
    const [id] = sim.drawLineIds(60, y0 - 1.2, 140, y0 - 1.2);
    const s = sim.segs[id];
    for (let i = 0; i < sim.grains; i++) {
      const q = closest(s, sim.gx[i], sim.gy[i]);
      expect(Math.hypot(sim.gx[i] - q.x, sim.gy[i] - q.y)).toBeGreaterThanOrEqual(sim.lineR + GR - 0.01);
    }
  });

  it('書き始め・書き終わりの近くの線や壁を見つける（触れていれば不要、今の一筆は除く）', () => {
    const st: StageDef = { ...stage(100), walls: [{ x: 50, y: 50, w: 4, h: 20 }] };
    const sim = new SandSim(st, cfg(), 1);
    expect(sim.nearestSolid(56, 60, 3)).toEqual({ x: 54, y: 60 }); // 2マスの隙間 → 壁へつなぐ
    expect(sim.nearestSolid(54.3, 60, 3)).toBeNull(); // 触れている
    expect(sim.nearestSolid(60, 60, 3)).toBeNull(); // 遠い（隙間6マス）
    const own = new Set(sim.drawLineIds(80, 30, 90, 30));
    expect(sim.nearestSolid(94, 30, 3, own)).toBeNull();
    expect(sim.nearestSolid(94, 30, 3)).toEqual({ x: 90, y: 30 });
  });
});
