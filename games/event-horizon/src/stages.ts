/**
 * Event Horizon のステージ。
 * かけらの置き場所・星座の穴・壁・床の穴だけで作れる。
 */
import type { StageDef } from './sim';

/** 床の上に横一列に並べる */
const row = (x0: number, x1: number, n: number, kind: 'dust' | 'heavy' = 'dust', y = 11.7) =>
  Array.from({ length: n }, (_, i) => ({ kind, x: n === 1 ? x0 : x0 + ((x1 - x0) * i) / (n - 1), y }));

export const stages: StageDef[] = [
  {
    id: 'eh-first',
    name: '最初の軌道',
    hint: 'クリックしている間だけ引き寄せる。かけらが輪に乗ったら、穴の手前まで運んで放せ',
    shards: row(2.5, 5.5, 4),
    goals: [{ x: 16, y: 4, r: 1.3 }],
    need: 2,
    start: { x: 4, y: 7 },
  },
  {
    id: 'eh-white',
    name: 'ホワイトホール',
    hint: '周回させたまま Space（右クリック）で解放。輪の全部が外へ弾け飛ぶ',
    shards: row(8, 12, 6),
    goals: [{ x: 3, y: 3.5, r: 1.2 }, { x: 17, y: 3.5, r: 1.2 }],
    need: 4,
    start: { x: 10, y: 6 },
  },
  {
    id: 'eh-abyss',
    name: '奈落の上',
    hint: '床の真ん中は奈落。落とさずに向こう岸の高い穴へ',
    shards: [...row(1.5, 4, 3), { kind: 'heavy', x: 5, y: 11.6 }],
    goals: [{ x: 17, y: 3, r: 1.2 }],
    need: 3,
    pits: [[6.5, 13.5]],
    walls: [[{ x: 14.5, y: 5 }, { x: 19.9, y: 5 }]],
    start: { x: 4, y: 7 },
  },
];
