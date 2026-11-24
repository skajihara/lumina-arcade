/**
 * Stopped World のステージ（世界は 30×18。y は下向き、床は y=18）。
 * 10面。どの面もランダム探索のボット（bot.ts）で解けることを確かめている（reports/stopped-world-balance.md）。
 */
import type { StageDef } from './sim';

export const stages: StageDef[] = [
  {
    id: 'sw-roll',
    name: '最初のひと押し',
    hint: 'Space で時間を止め、卵を引っぱって放す（逆向きに力が溜まる）。もう一度 Space で解放',
    goal: 'nest',
    nest: { x: 22.7, y: 17.2, w: 3.2, h: 1.8 },
    objects: [{ kind: 'egg', x: 6.6, y: 17.5, w: 0.45 }],
  },
  {
    id: 'sw-boom',
    name: '止まった爆発',
    hint: '止めている間に爆弾を叩くと、解放の瞬間に爆発する',
    goal: 'destroy',
    objects: [
      { kind: 'crate', x: 11.64, y: 17.4, w: 1.2 },
      { kind: 'bomb', x: 15, y: 17.55, w: 0.45 },
      { kind: 'crate', x: 18.36, y: 17.4, w: 1.2 },
      { kind: 'crate', x: 18.36, y: 16.2, w: 1.2 },
    ],
  },
  {
    id: 'sw-fuse',
    name: '導火線',
    hint: '離れた爆弾は誘爆しない。止めている間に、爆弾どうしを寄せておけ',
    goal: 'destroy',
    objects: [
      { kind: 'bomb', x: 5.2, y: 17.55, w: 0.45 },
      { kind: 'bomb', x: 13.6, y: 17.55, w: 0.45 },
      { kind: 'crate', x: 16.4, y: 17.4, w: 1.2 },
      { kind: 'crate', x: 24.8, y: 17.4, w: 1.2 },
      { kind: 'bomb', x: 22, y: 17.55, w: 0.45 },
    ],
  },
  {
    id: 'sw-billiard',
    name: '玉突き',
    hint: '光の玉をぶつけて箱を落とす。玉の矢印は長く、箱は叩けない高さにある',
    goal: 'destroy',
    ground: [[{ x: 17.8, y: 12 }, { x: 26.2, y: 12 }]],
    objects: [
      { kind: 'ball', x: 5.2, y: 17.4, w: 0.6 },
      { kind: 'crate', x: 20.6, y: 11.4, w: 1.2 },
      { kind: 'crate', x: 24.1, y: 11.4, w: 1.2 },
    ],
  },
  {
    id: 'sw-wall',
    name: '箱の壁',
    hint: '巣の前に壁。爆弾で壁を壊すのと、卵を転がすのを、同じ一瞬に',
    goal: 'nest',
    nest: { x: 25.5, y: 17.2, w: 3, h: 1.8 },
    objects: [
      { kind: 'egg', x: 5.2, y: 17.55, w: 0.45 },
      { kind: 'crate', x: 19.2, y: 17.4, w: 1.2 },
      { kind: 'crate', x: 19.2, y: 16.2, w: 1.2 },
      { kind: 'bomb', x: 17.1, y: 17.55, w: 0.45 },
    ],
  },
  {
    id: 'sw-shelf',
    name: '棚の上',
    hint: '卵を棚から下ろす。強く落とすと割れる — 下で受け止める力を同時に置け',
    goal: 'nest',
    nest: { x: 24.1, y: 17.2, w: 3, h: 1.8 },
    ground: [[{ x: 3.8, y: 12 }, { x: 12.2, y: 12 }]],
    objects: [
      { kind: 'egg', x: 5.2, y: 11.5, w: 0.45 },
      { kind: 'plank', x: 17.8, y: 17.75, w: 3, h: 0.5 },
    ],
  },
  {
    id: 'sw-tower',
    name: '星の塔',
    hint: '積み上げた箱。爆風は塔の上まで届かない — 根元は爆弾で、上は光の玉をぶつけて',
    goal: 'destroy',
    objects: [
      { kind: 'ball', x: 14, y: 17.4, w: 0.6 },
      { kind: 'crate', x: 20.6, y: 17.4, w: 1.2 },
      { kind: 'crate', x: 20.6, y: 16.2, w: 1.2 },
      { kind: 'crate', x: 20.6, y: 15, w: 1.2 },
      { kind: 'bomb', x: 19.1, y: 17.55, w: 0.45 },
    ],
  },
  {
    id: 'sw-seesaw',
    name: '板の上の卵',
    hint: '卵は板の上。板ごと運ぶか、卵だけを運ぶか',
    goal: 'nest',
    nest: { x: 24.1, y: 17.2, w: 3, h: 1.8 },
    ground: [[{ x: 3.8, y: 14 }, { x: 10.8, y: 14 }]],
    objects: [
      { kind: 'plank', x: 7.3, y: 13.7, w: 4, h: 0.5 },
      { kind: 'egg', x: 7.3, y: 13, w: 0.45 },
    ],
  },
  {
    id: 'sw-ledge',
    name: '高い巣',
    hint: '巣は棚の上。卵を高く放り、着地の前にもう一度止めて勢いを殺せ',
    goal: 'nest',
    nest: { x: 22.7, y: 12.2, w: 3, h: 1.6 },
    ground: [[{ x: 19.9, y: 13 }, { x: 25.5, y: 13 }]],
    objects: [{ kind: 'egg', x: 6.6, y: 17.55, w: 0.45 }],
  },
  {
    id: 'sw-finale',
    name: '止まった夜',
    hint: '爆弾・箱・卵。全部の力を、たった一度の解放で',
    goal: 'nest',
    nest: { x: 25.5, y: 17.2, w: 3, h: 1.8 },
    ground: [[{ x: 3.1, y: 13.5 }, { x: 9.4, y: 13.5 }]],
    objects: [
      { kind: 'egg', x: 5.2, y: 13, w: 0.45 },
      { kind: 'crate', x: 16.4, y: 17.4, w: 1.2 },
      { kind: 'crate', x: 16.4, y: 16.2, w: 1.2 },
      { kind: 'crate', x: 16.4, y: 15, w: 1.2 },
      { kind: 'bomb', x: 14.44, y: 17.55, w: 0.45 },
      { kind: 'rock', x: 20.6, y: 17.4, w: 0.6 },
    ],
  },
];
