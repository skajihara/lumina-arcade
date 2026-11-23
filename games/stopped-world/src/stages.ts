/**
 * Stopped World のステージ（世界は 20×12。y は下向き、床は y=12）。
 * 10面。どの面もランダム探索のボット（bot.ts）で解けることを確かめている（reports/stopped-world-balance.md）。
 */
import type { StageDef } from './sim';

export const stages: StageDef[] = [
  {
    id: 'sw-roll',
    name: '最初のひと押し',
    hint: 'Space で時間を止め、卵をドラッグして矢印を置く。もう一度 Space で解放',
    goal: 'nest',
    nest: { x: 15.5, y: 11.2, w: 3.2, h: 1.8 },
    objects: [{ kind: 'egg', x: 4, y: 11.5, w: 0.45 }],
  },
  {
    id: 'sw-boom',
    name: '止まった爆発',
    hint: '止めている間に爆弾を叩くと、解放の瞬間に爆発する',
    goal: 'destroy',
    objects: [
      { kind: 'crate', x: 7.6, y: 11.4, w: 1.2 },
      { kind: 'bomb', x: 10, y: 11.55, w: 0.45 },
      { kind: 'crate', x: 12.4, y: 11.4, w: 1.2 },
      { kind: 'crate', x: 12.4, y: 10.2, w: 1.2 },
    ],
  },
  {
    id: 'sw-fuse',
    name: '導火線',
    hint: '離れた爆弾は誘爆しない。止めている間に、爆弾どうしを寄せておけ',
    goal: 'destroy',
    objects: [
      { kind: 'bomb', x: 3, y: 11.55, w: 0.45 },
      { kind: 'bomb', x: 9, y: 11.55, w: 0.45 },
      { kind: 'crate', x: 11, y: 11.4, w: 1.2 },
      { kind: 'crate', x: 17, y: 11.4, w: 1.2 },
      { kind: 'bomb', x: 15, y: 11.55, w: 0.45 },
    ],
  },
  {
    id: 'sw-billiard',
    name: '玉突き',
    hint: '光の玉をぶつけて箱を落とす。玉の矢印は長く、箱は叩けない高さにある',
    goal: 'destroy',
    ground: [[{ x: 12, y: 6 }, { x: 18, y: 6 }]],
    objects: [
      { kind: 'ball', x: 3, y: 11.4, w: 0.6 },
      { kind: 'crate', x: 14, y: 5.4, w: 1.2 },
      { kind: 'crate', x: 16.5, y: 5.4, w: 1.2 },
    ],
  },
  {
    id: 'sw-wall',
    name: '箱の壁',
    hint: '巣の前に壁。爆弾で壁を壊すのと、卵を転がすのを、同じ一瞬に',
    goal: 'nest',
    nest: { x: 17.5, y: 11.2, w: 3, h: 1.8 },
    objects: [
      { kind: 'egg', x: 3, y: 11.55, w: 0.45 },
      { kind: 'crate', x: 13, y: 11.4, w: 1.2 },
      { kind: 'crate', x: 13, y: 10.2, w: 1.2 },
      { kind: 'bomb', x: 11.5, y: 11.55, w: 0.45 },
    ],
  },
  {
    id: 'sw-shelf',
    name: '棚の上',
    hint: '卵を棚から下ろす。強く落とすと割れる — 下で受け止める力を同時に置け',
    goal: 'nest',
    nest: { x: 16.5, y: 11.2, w: 3, h: 1.8 },
    ground: [[{ x: 2, y: 6 }, { x: 8, y: 6 }]],
    objects: [
      { kind: 'egg', x: 3, y: 5.5, w: 0.45 },
      { kind: 'plank', x: 12, y: 11.75, w: 3, h: 0.5 },
    ],
  },
  {
    id: 'sw-tower',
    name: '星の塔',
    hint: '積み上げた箱。爆弾を塔の根元へ運んでから点火',
    goal: 'destroy',
    objects: [
      { kind: 'crate', x: 14, y: 11.4, w: 1.2 },
      { kind: 'crate', x: 14, y: 10.2, w: 1.2 },
      { kind: 'crate', x: 14, y: 9.0, w: 1.2 },
      { kind: 'crate', x: 14, y: 7.8, w: 1.2 },
      { kind: 'bomb', x: 6, y: 11.55, w: 0.45 },
    ],
  },
  {
    id: 'sw-seesaw',
    name: '板の上の卵',
    hint: '卵は板の上。板ごと運ぶか、卵だけを運ぶか',
    goal: 'nest',
    nest: { x: 16.5, y: 11.2, w: 3, h: 1.8 },
    ground: [[{ x: 2, y: 8 }, { x: 7, y: 8 }]],
    objects: [
      { kind: 'plank', x: 4.5, y: 7.7, w: 4, h: 0.5 },
      { kind: 'egg', x: 4.5, y: 7.0, w: 0.45 },
    ],
  },
  {
    id: 'sw-ledge',
    name: '高い巣',
    hint: '巣は棚の上。卵を高く放り、着地の前にもう一度止めて勢いを殺せ',
    goal: 'nest',
    nest: { x: 15.5, y: 6.2, w: 3, h: 1.6 },
    ground: [[{ x: 13.5, y: 7 }, { x: 17.5, y: 7 }]],
    objects: [{ kind: 'egg', x: 4, y: 11.55, w: 0.45 }],
  },
  {
    id: 'sw-finale',
    name: '止まった夜',
    hint: '爆弾・箱・卵。全部の力を、たった一度の解放で',
    goal: 'nest',
    nest: { x: 17.5, y: 11.2, w: 3, h: 1.8 },
    ground: [[{ x: 1.5, y: 7.5 }, { x: 6, y: 7.5 }]],
    objects: [
      { kind: 'egg', x: 3, y: 7.0, w: 0.45 },
      { kind: 'crate', x: 11, y: 11.4, w: 1.2 },
      { kind: 'crate', x: 11, y: 10.2, w: 1.2 },
      { kind: 'crate', x: 11, y: 9.0, w: 1.2 },
      { kind: 'bomb', x: 9.6, y: 11.55, w: 0.45 },
      { kind: 'rock', x: 14, y: 11.4, w: 0.6 },
    ],
  },
];
