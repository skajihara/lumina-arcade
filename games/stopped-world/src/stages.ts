/**
 * Stopped World のステージ（世界は 30×18。y は下向き、床は y=18）。
 * 10面。どの面もランダム探索のボット（bot.ts）で解けることを確かめている（reports/stopped-world-balance.md）。
 * 後半は「止められる回数」（stops）を絞り、1回の解放で全部を同時に動かす読みを求める（SW-13）。
 * 難しさの目安：ランダムな計画のうち解ける割合（ふつう）が、序盤 数%〜10% → 終盤 0.3〜0.7%。
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
  },  {
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
  },  {
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
  },  {
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
  },  {
    id: 'sw-catch',
    name: '箱の上の卵',
    hint: '巣の真上に、箱に乗った卵。下の箱だけを光の玉で抜けば、卵はそっと降りる（2回まで止められる）',
    goal: 'nest',
    stops: 2,
    nest: { x: 20, y: 17.1, w: 2.6, h: 1.2 },
    objects: [
      { kind: 'ball', x: 6, y: 17.4, w: 0.6 },
      { kind: 'crate', x: 20, y: 17.4, w: 1.2 },
      { kind: 'crate', x: 20, y: 16.2, w: 1.2 },
      { kind: 'crate', x: 20, y: 15.0, w: 1.2 },
      { kind: 'egg', x: 20, y: 13.9, w: 0.45 },
    ],
  },
  {
    id: 'sw-shelf',
    name: '棚の上',
    hint: '卵を棚から下ろす。強く落とすと割れる — 落ちる途中でもう一度止めて、勢いを殺せ（2回まで）',
    goal: 'nest',
    stops: 2,
    nest: { x: 24.1, y: 17.2, w: 3, h: 1.8 },
    ground: [[{ x: 3.8, y: 12 }, { x: 12.2, y: 12 }]],
    objects: [
      { kind: 'egg', x: 5.2, y: 11.5, w: 0.45 },
      { kind: 'plank', x: 17.8, y: 17.75, w: 3, h: 0.5 },
    ],
  },  {
    id: 'sw-once',
    name: '一度きり',
    hint: '止められるのは1回だけ。爆弾で壁を壊すのと、卵を送り出すのを、同じ解放で — 爆風に卵を巻き込むな',
    goal: 'nest',
    stops: 1,
    nest: { x: 25.5, y: 17.2, w: 3, h: 1.8 },
    objects: [
      { kind: 'egg', x: 5.2, y: 17.55, w: 0.45 },
      { kind: 'crate', x: 19.2, y: 17.4, w: 1.2 },
      { kind: 'crate', x: 19.2, y: 16.2, w: 1.2 },
      { kind: 'bomb', x: 17.1, y: 17.55, w: 0.45 },
    ],
  },  {
    id: 'sw-bounce',
    name: '軒下の箱',
    hint: '左上の箱は屋根の下。上からは届かない — 光の玉を壁や箱で跳ね返して、横から差し込め（2回まで）',
    goal: 'destroy',
    stops: 2,
    ground: [[{ x: 1, y: 10.5 }, { x: 8, y: 10.5 }], [{ x: 0, y: 8.1 }, { x: 10, y: 8.1 }]],
    objects: [
      { kind: 'ball', x: 24, y: 17.4, w: 0.6 },
      { kind: 'crate', x: 4, y: 9.9, w: 1.2 },
      { kind: 'crate', x: 14, y: 17.4, w: 1.2 },
    ],
  },
  {
    id: 'sw-ledge',
    name: '高い巣',
    hint: '巣は棚の上、止められるのは1回。空中で勢いを殺せない — 一投で巣に収まる弧を探せ（予測の点線を見て）',
    goal: 'nest',
    stops: 1,
    nest: { x: 22.7, y: 12.2, w: 3, h: 1.6 },
    ground: [[{ x: 19.9, y: 13 }, { x: 25.5, y: 13 }]],
    objects: [{ kind: 'egg', x: 6.6, y: 17.55, w: 0.45 }],
  },  {
    id: 'sw-finale',
    name: '止まった夜',
    hint: '屋根の下、巣の前に箱の壁。爆弾は壁に届かない — 爆弾・岩・箱をどう組み合わせるか、2回の停止で',
    goal: 'nest',
    stops: 2,
    forces: 3,
    nest: { x: 25.5, y: 17.2, w: 3, h: 1.8 },
    ground: [[{ x: 3.1, y: 13.5 }, { x: 9.4, y: 13.5 }], [{ x: 10, y: 12.6 }, { x: 30, y: 12.6 }]],
    objects: [
      { kind: 'egg', x: 5.2, y: 13, w: 0.45 },
      { kind: 'crate', x: 16.4, y: 17.4, w: 1.2 },
      { kind: 'crate', x: 16.4, y: 16.2, w: 1.2 },
      { kind: 'crate', x: 16.4, y: 15, w: 1.2 },
      { kind: 'crate', x: 16.4, y: 13.8, w: 1.2 },
      { kind: 'bomb', x: 14.44, y: 17.55, w: 0.45 },
      { kind: 'rock', x: 20.6, y: 17.4, w: 0.6 },
    ],
  },
];
