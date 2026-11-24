import { describe, expect, it } from 'vitest';
import { presets, DEFAULT_PRESET } from './config';
import { SandSim, W, H, SAND, type StageDef } from './sim';

/**
 * 線の隙間から砂が漏れないこと（ユーザーの指摘 SS-10）。
 * いろいろな角度の線を、マウスの点の飛び（1〜12マス）で引き、上から砂を落とす。
 * 線より下（線の真下の帯）に砂が1粒も来ないこと。
 */
const cfg = () => ({ ...presets[DEFAULT_PRESET], twist: 0 });
const stage = (sx: number): StageDef => ({
  id: 'leak', name: 'leak', hint: '', walls: [], cups: [], ink: 100000,
  sources: [{ x: sx, y: 1, color: 0, total: 300, rate: 3, width: 9 }],
});

/** マウスで引いたように：a→b を、jump マス間隔の点で、点から点へ drawLineCells でつなぐ */
function stroke(sim: SandSim, ax: number, ay: number, bx: number, by: number, jump: number) {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / jump));
  let px = ax, py = ay;
  sim.drawLineCells(px, py, px, py);
  for (let i = 1; i <= n; i++) {
    const x = Math.floor(ax + ((bx - ax) * i) / n + 0.37 * (i % 3)), y = Math.floor(ay + ((by - ay) * i) / n + 0.29 * (i % 2));
    sim.drawLineCells(px, py, x, y);
    px = x; py = y;
  }
}

/** 線の下側に来た砂の数：列 x で、線の一番下のマスより下にある砂 */
function leaked(sim: SandSim, x0: number, x1: number): number {
  let n = sim.lost;
  for (let x = x0; x <= x1; x++) {
    let lineBottom = -1;
    for (let y = 0; y < H; y++) if (sim.get(x, y) === 2) lineBottom = y;
    if (lineBottom < 0) continue;
    for (let y = lineBottom + 1; y < H; y++) if (sim.get(x, y) >= SAND) n++;
  }
  return n;
}

describe('線の隙間から砂が漏れない', () => {
  // 器のように両端を上げた線（V字・U字）で受け止める。角度いろいろ
  const angles = [0, 8, 17, 26, 33, 45, 52, 60, 70];
  for (const deg of angles) {
    for (const jump of [1, 3, 7, 12]) {
      it(`${deg}°の受け皿、点の間隔 ${jump}`, () => {
        const sim = new SandSim(stage(100), cfg(), 3);
        const t = Math.tan((deg * Math.PI) / 180);
        const half = Math.min(60, Math.round(40 / Math.max(t, 0.35)));
        const cy = 90;
        // 左の腕・右の腕（中心が一番低い V 字）。平らな時は両端に低い壁
        stroke(sim, 100 - half, Math.round(cy - half * t) - (deg === 0 ? 20 : 0), 100, cy, jump);
        stroke(sim, 100, cy, 100 + half, Math.round(cy - half * t) - (deg === 0 ? 20 : 0), jump);
        if (deg === 0) { stroke(sim, 100 - half, cy - 20, 100 - half, cy, jump); stroke(sim, 100 + half, cy - 20, 100 + half, cy, jump); }
        for (let i = 0; i < 1500; i++) sim.step();
        expect(leaked(sim, 0, W - 1)).toBe(0);
      });
    }
  }

  it('流れている砂の中を横切って線を引いても、隙間ができない', () => {
    const sim = new SandSim(stage(100), cfg(), 5);
    for (let i = 0; i < 120; i++) sim.step(); // 砂の柱ができている
    stroke(sim, 70, 60, 100, 80, 4);
    stroke(sim, 100, 80, 130, 60, 4);
    // 引いた時にすでに線より下にあった砂は数えない
    const before = leaked(sim, 0, W - 1);
    const lost0 = sim.lost;
    for (let i = 0; i < 1500; i++) sim.step();
    expect(leaked(sim, 0, W - 1) - lost0).toBeLessThanOrEqual(before - lost0);
    expect(sim.lost - lost0).toBeLessThanOrEqual(before - lost0);
  });

  it('止まっている砂の山を横切って引いても、線に穴があかない（砂を上へ押しのける）', () => {
    const st: StageDef = { ...stage(100), walls: [{ x: 0, y: H - 2, w: W, h: 2 }] };
    const sim = new SandSim(st, cfg(), 7);
    for (let i = 0; i < 1500; i++) sim.step(); // 床に山ができる
    let top = H;
    for (let y = 0; y < H; y++) if (sim.get(100, y) >= SAND) { top = y; break; }
    const y0 = Math.round((top + H - 2) / 2);
    expect(H - 2 - top).toBeGreaterThan(6);
    sim.drawLineCells(85, y0, 115, y0);
    // 線の帯（3行）の中に砂が1粒も残っていない＝全部が線
    for (let x = 86; x <= 114; x++) for (let y = y0 - 1; y <= y0 + 1; y++) {
      if (sim.get(x, y) >= SAND) throw new Error(`穴 (${x},${y})`);
    }
    for (let x = 85; x <= 115; x++) expect(sim.get(x, y0)).toBe(2);
  });

  it('書き始め・書き終わりの近くの線や壁を見つける（隣り合っていれば不要、今の一筆は除く）', () => {
    const st: StageDef = { ...stage(100), walls: [{ x: 50, y: 50, w: 4, h: 20 }] };
    const sim = new SandSim(st, cfg(), 1);
    expect(sim.nearestSolid(56, 60, 3)).toEqual({ x: 53, y: 60 }); // 2マスの隙間 → 壁へつなぐ
    expect(sim.nearestSolid(54, 60, 3)).toBeNull(); // 隣り合っている
    expect(sim.nearestSolid(60, 60, 3)).toBeNull(); // 遠い（隙間6マス）
    const own = new Set(sim.drawLineCells(80, 30, 90, 30));
    expect(sim.nearestSolid(94, 30, 3, own)).toBeNull();
    expect(sim.nearestSolid(94, 30, 3)).toEqual({ x: 91, y: 30 });
    // つなぐと、隙間を砂が通れない
    const t = sim.nearestSolid(56, 60, 3)!;
    sim.drawLineCells(t.x, t.y, 56, 60);
    expect(sim.get(55, 60)).toBe(2);
  });
});
