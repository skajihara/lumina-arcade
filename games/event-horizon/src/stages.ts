/**
 * Event Horizon のステージ。
 * かけらの置き場所・星座の穴・壁・床の穴（奈落）だけで作れる。
 * 並びはボットの測定（reports/event-horizon-balance.md）で、易しい順に。
 */
import type { StageDef } from './sim';

/** 横一列に並べる（既定は床の上） */
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
  },  {
    id: 'eh-abyss',
    name: '奈落の上',
    hint: '床の真ん中は奈落。落とさずに向こう岸の高い穴へ',
    shards: [...row(1.2, 3.6, 3), { kind: 'heavy', x: 4.6, y: 11.6 }],
    goals: [{ x: 17, y: 3, r: 1.2 }],
    need: 3,
    pits: [[7, 13.5]],
    walls: [[{ x: 14.5, y: 5 }, { x: 19.9, y: 5 }]],
    start: { x: 3, y: 8 },
  },  {
    id: 'eh-white',
    name: 'ホワイトホール',
    hint: '周回させたまま Space（右クリック）で解放。輪の全部が外へ弾け飛ぶ',
    shards: row(8, 12, 6),
    goals: [{ x: 3, y: 3.5, r: 1.2 }, { x: 17, y: 3.5, r: 1.2 }],
    need: 4,
    start: { x: 10, y: 6 },
  },  {
    id: 'eh-heavy',
    name: '重いかけら',
    hint: '金のかけらは重く、引力が効きにくい。ゆっくり運べ',
    shards: [...row(5.5, 7, 2, 'heavy'), ...row(14.5, 17, 3)],
    goals: [{ x: 10, y: 3, r: 1.3 }],
    need: 4,
    start: { x: 10, y: 8 },
  },  {
    id: 'eh-shelf',
    name: '高い棚',
    hint: '棚の上のかけらを、下の穴へ。上から投げ下ろせ',
    shards: row(1.8, 5.2, 4, 'dust', 4.7),
    goals: [{ x: 15.5, y: 10, r: 1.2 }],
    need: 3,
    walls: [[{ x: 0, y: 5 }, { x: 6.5, y: 5 }]],
    start: { x: 4, y: 2 },
  },  {
    id: 'eh-vortex',
    name: '銀河の渦',
    hint: '十のかけら、三つの穴、両端の奈落。輪いっぱいに集めてから解放せよ',
    shards: [{ kind: 'heavy', x: 3.6, y: 11.6 }, ...row(5, 15, 8), { kind: 'heavy', x: 16.4, y: 11.6 }],
    goals: [{ x: 2.5, y: 3, r: 1.1 }, { x: 10, y: 1.6, r: 1.1 }, { x: 17.5, y: 3, r: 1.1 }],
    need: 7,
    pits: [[0, 2.5], [17.5, 20]],
    start: { x: 10, y: 6 },
  },  {
    id: 'eh-cup',
    name: '杯',
    hint: '穴は杯の底。縁を越えて、上から落とし込め',
    shards: row(2, 7, 5),
    goals: [{ x: 16.5, y: 9.3, r: 1.1 }],
    need: 3,
    walls: [[{ x: 13.8, y: 6.2 }, { x: 13.8, y: 10.8 }, { x: 19.2, y: 10.8 }, { x: 19.2, y: 6.2 }]],
    start: { x: 4.5, y: 7 },
  },  {
    id: 'eh-twins',
    name: '二つの星座',
    hint: '両側は奈落。真ん中の台から、左右の高い穴へ分けて投げろ',
    shards: row(8, 12, 8, 'dust', 8.6),
    goals: [{ x: 2, y: 2.5, r: 1.1 }, { x: 18, y: 2.5, r: 1.1 }],
    need: 4,
    pits: [[0, 4.5], [15.5, 20]],
    walls: [[{ x: 5.5, y: 9 }, { x: 14.5, y: 9 }]],
    start: { x: 10, y: 5 },
  },  {
    id: 'eh-attack',
    name: 'スコアアタック',
    hint: 'かけらは空から降り続ける。制限時間まで、連鎖でスコアを稼げ',
    shards: row(4, 16, 6),
    goals: [{ x: 2.5, y: 4, r: 1.2 }, { x: 10, y: 2, r: 1.2 }, { x: 17.5, y: 4, r: 1.2 }],
    start: { x: 10, y: 8 },
    attack: { seed: 7 },
  },








];
