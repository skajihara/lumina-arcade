/**
 * Event Horizon（地平すれすれ・EH-20b）のステージ。
 * 世界は 幅 32 × 高さ 18。船は最初、ブラックホールから半径 5.5 前後の円軌道に乗っている。
 * 最初の軌道の近く（何もしなくても通る所）にはかけらを置かない — 減速して潜るか、加速して膨らむと届く。
 */
import type { StageDef } from './sim';

const C = { x: 16, y: 9 };
const ONE = { x: C.x, y: C.y, gm: 150, rs: 1.3 };

export const stages: StageDef[] = [
  {
    id: 'eh2-first', name: '最初の地平',
    hint: '↓（減速）を短く押すと軌道が縮んで地平へ潜る。近いほど倍率が上がる。↑（加速）で離れる',
    holes: [ONE], start: { around: 0, r: 5.5 },
    rings: [{ hole: 0, r: 3.6, count: 4 }, { hole: 0, r: 7.4, count: 3, spin: -0.3 }, { hole: 0, r: 2.7, count: 2 }],
    stars: [250, 600, 1000],
  },
  {
    id: 'eh2-inner', name: '内側の輪',
    hint: 'かけらは地平のすぐ外を回っている。すれすれで拾えば ×3 以上 — でも潜りすぎると戻れない',
    holes: [ONE], start: { around: 0, r: 5.5, angle: Math.PI / 2 },
    rings: [{ hole: 0, r: 2.0, count: 6, spin: 0.45 }, { hole: 0, r: 2.7, count: 3, spin: -0.35 }],
    stars: [400, 1000, 1800], intro: 'inner',
  },
  {
    id: 'eh2-fuel', name: '燃料ぎりぎり',
    hint: '燃料が少ない。一度潜ったら、離脱の分を残しておけ（燃料が切れると軌道は変えられない）',
    holes: [ONE], start: { around: 0, r: 6.2, angle: 0 },
    rings: [{ hole: 0, r: 2.4, count: 4 }, { hole: 0, r: 3.5, count: 3, spin: -0.4 }],
    fuel: 6, stars: [300, 800, 1500], intro: 'fuel',
  },
  {
    id: 'eh2-binary', name: '連星',
    hint: '二つのブラックホールが回り合う。重力の向きが刻々と変わる — 片方の地平をかすめて、もう片方へ',
    holes: [
      { x: C.x, y: C.y, gm: 80, rs: 0.95, orbit: { r: 2.3, period: 9, phase: 0 } },
      { x: C.x, y: C.y, gm: 80, rs: 0.95, orbit: { r: 2.3, period: 9, phase: Math.PI } },
    ],
    start: { around: C, r: 7.2 },
    rings: [{ hole: 0, r: 1.7, count: 3, spin: 0.4 }, { hole: 1, r: 1.7, count: 3, spin: 0.4 }],
    stars: [150, 400, 750], intro: 'binary',
  },
];
