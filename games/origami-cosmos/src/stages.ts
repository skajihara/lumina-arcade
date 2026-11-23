/**
 * Origami Cosmos のパズル。
 * ignitions は「ふつう」の基準（ソルバーの最短）。点火回数はプリセットで上乗せされる。
 * 全問、tests/balance/origami-cosmos.test.ts でソルバーが解と最短手数を確かめる。
 */
import type { StageDef } from './sim';

const S = (pts: string): { x: number; y: number }[] =>
  pts.trim().split(/\s+/).map((p) => { const [x, y] = p.split(',').map(Number); return { x, y }; });

export const stages: StageDef[] = [
  {
    id: 'oc-01',
    name: '最初の折り目',
    hint: '線の片側をクリックすると、その側が線の向こうへ折り重なる。重なった星は同じ場所にある',
    w: 8, h: 4,
    stars: S('1,1 2,1 5,2 6,2'),
    folds: [{ axis: 'x', at: 4 }],
    ignitions: 1, maxFolds: 1,
    links: [[0, 1], [1, 2], [2, 3]],
  },
  {
    id: 'oc-02',
    name: '上と下',
    hint: '横の線でも折れる。星をクリックで点火',
    w: 6, h: 6,
    stars: S('1,0 3,1 2,4 4,5'),
    folds: [{ axis: 'y', at: 3 }],
    ignitions: 1, maxFolds: 1,
    links: [[0, 1], [1, 3], [3, 2], [2, 0]],
  },
  {
    id: 'oc-03',
    name: '四つ折り',
    hint: '1手に2回まで折れる。折った紙ごと、もう一度折れ',
    w: 8, h: 6,
    stars: S('0,0 7,0 0,5 7,5 1,1'),
    folds: [{ axis: 'x', at: 4 }, { axis: 'y', at: 3 }],
    ignitions: 1, maxFolds: 2,
    links: [[0, 1], [1, 3], [3, 2], [2, 0]],
  },
];
