/**
 * Blast Courier のステージ（NEW-07：10面）。
 * 世界は 幅 32 × 高さ 18 m（y は下向き）。下は雲海（落ちると最後に止まった所へ戻り、爆風 +1）
 */
import type { CourierStage, Pt } from './sim';

/** 上が平らな島：左 x0〜右 x1、上の面の高さ y、厚み h（下に向かって少しすぼまる） */
export const flat = (x0: number, x1: number, y: number, h = 2.4): Pt[] => [
  { x: x0, y }, { x: x1, y }, { x: x1 - 0.8, y: y + h * 0.6 }, { x: (x0 + x1) / 2, y: y + h }, { x: x0 + 0.8, y: y + h * 0.6 },
];
/** 傾いた島：左の高さ yl、右の高さ yr */
export const slope = (x0: number, x1: number, yl: number, yr: number, h = 2.2): Pt[] => [
  { x: x0, y: yl }, { x: x1, y: yr }, { x: x1 - 0.8, y: Math.max(yl, yr) + h * 0.6 }, { x: (x0 + x1) / 2, y: Math.max(yl, yr) + h }, { x: x0 + 0.8, y: Math.max(yl, yr) + h * 0.6 },
];
/** 棘：底の左右と先 */
export const spike = (x: number, w: number, base: number, top: number): { pts: Pt[] } => ({ pts: [{ x: x - w / 2, y: base }, { x, y: top }, { x: x + w / 2, y: base }] });

export const courierStages: CourierStage[] = [
  {
    id: 'bc-1', name: 'はじめの一吹き', hint: '画面を押さえて、飛ばしたい向きへドラッグ。長く押すほど強い（輪が赤い所まで溜めると割れる）。放すと撃つ',
    start: { x: 4, y: 11.9 }, nest: { x: 25.5, y: 12.5, w: 2.4 },
    islands: [{ pts: flat(1, 12, 12.4) }, { pts: flat(17, 31, 12.5) }],
    kinds: ['push'], par: 3, maxBlasts: 12,
  },
  {
    id: 'bc-2', name: '雲の橋', hint: '雲はふわりと卵を受け止める。強く飛ばしても、雲の上なら割れない',
    start: { x: 3, y: 9.9 }, nest: { x: 28.5, y: 8.5, w: 2.2 },
    islands: [{ pts: flat(1, 8, 10.4) }, { pts: flat(13, 18, 14) }, { pts: flat(22, 31, 8.5) }],
    clouds: [{ x: 15.5, y: 11.6, rx: 3.2, ry: 1.1 }],
    kinds: ['push'], par: 4, maxBlasts: 12,
  },
  {
    id: 'bc-3', name: '吸い寄せ', hint: '2（または下のボタン・ホイール）で「吸う」。クリックした所へ卵を引き寄せる（ひびは入らない）。崖の上へは、押して吸って',
    start: { x: 4, y: 13.9 }, nest: { x: 26, y: 6.5, w: 2.2 },
    islands: [{ pts: flat(1, 11, 14.4) }, { pts: flat(13, 20, 10.5) }, { pts: flat(22, 30, 6.5) }],
    kinds: ['push', 'pull'], par: 5, maxBlasts: 14,
  },
  {
    id: 'bc-4', name: '上昇気流', hint: '3 の「昇る」は、その場から上へ気流の柱を立てる。上がり切った所で横へ一吹き',
    start: { x: 5, y: 14.9 }, nest: { x: 25, y: 4.5, w: 2.2 },
    islands: [{ pts: flat(1, 11, 15.4) }, { pts: flat(20, 29, 4.5, 2) }],
    thorns: [spike(15, 4, 18, 9)],
    kinds: ['push', 'pull', 'lift'], par: 6, maxBlasts: 14,
  },
  {
    id: 'bc-5', name: '遅れ火', hint: '4 の「遅れ」は 1 秒後に強く弾ける。坂を転がる卵の先に置いて、通る時に合わせろ',
    start: { x: 2.5, y: 6.4 }, nest: { x: 27, y: 9.5, w: 2.2 },
    islands: [{ pts: [{ x: 1, y: 7 }, { x: 11.5, y: 10.6 }, { x: 13, y: 10.1 }, { x: 12.4, y: 12 }, { x: 7, y: 13 }, { x: 1.8, y: 10 }] }, { pts: flat(20, 31, 9.5) }],
    kinds: ['push', 'delay'], par: 4, maxBlasts: 12,
  },
  {
    id: 'bc-6', name: '渡し舟の島', hint: '小さな島が谷を行き来する。島が来た時に飛び乗り、向こう岸で降りろ',
    start: { x: 3, y: 10.9 }, nest: { x: 28, y: 10.5, w: 2.2 },
    islands: [{ pts: flat(1, 7, 11.4) }, { pts: flat(9, 12.5, 11.5, 1.4), move: { dx: 12, dy: 0, period: 7 } }, { pts: flat(25, 31, 10.5) }],
    kinds: ['push', 'pull'], par: 5, maxBlasts: 14,
  },
  {
    id: 'bc-7', name: '棘の谷', hint: '谷の底に棘。触れると一度で割れる。高い弧で越えるか、雲に預けて',
    start: { x: 3, y: 12.9 }, nest: { x: 28, y: 12.5, w: 2.2 },
    islands: [{ pts: flat(1, 8, 13.4) }, { pts: flat(14, 18, 9.5, 1.6) }, { pts: flat(24, 31, 12.5) }],
    thorns: [spike(11, 3, 18, 12), spike(21, 3, 18, 11.5)],
    clouds: [{ x: 16, y: 6.5, rx: 2.5, ry: 0.9 }],
    kinds: ['push', 'pull', 'lift'], par: 5, maxBlasts: 14,
  },
  {
    id: 'bc-8', name: '雲の階段', hint: '雲を踏み台に、高い巣へ。上昇気流は雲の中でも効く',
    start: { x: 3, y: 15.4 }, nest: { x: 28, y: 3.5, w: 2.2 },
    islands: [{ pts: flat(1, 9, 15.9) }, { pts: flat(15, 19, 11, 1.6) }, { pts: flat(24, 31, 3.5, 1.6) }],
    clouds: [{ x: 12, y: 12.5, rx: 3, ry: 1 }, { x: 21, y: 7, rx: 3, ry: 1 }],
    kinds: ['push', 'pull', 'lift'], par: 5, maxBlasts: 18,
  },
  {
    id: 'bc-9', name: '天の川渡し', hint: '動く島、棘、遠い巣。遅れ火で、島が来る時に合わせて飛ばせ',
    start: { x: 2.5, y: 9.9 }, nest: { x: 29, y: 7.5, w: 2.0 },
    islands: [{ pts: flat(1, 6, 10.4) }, { pts: flat(8, 11, 12, 1.3), move: { dx: 0, dy: -5, period: 5 } }, { pts: flat(14, 18, 10.5, 1.6) }, { pts: flat(21, 24, 9, 1.3), move: { dx: 0, dy: 4, period: 6 } }, { pts: flat(27, 31, 7.5) }],
    thorns: [spike(12.5, 2.5, 18, 13), spike(19.5, 2.5, 18, 12.5), spike(25.5, 2.5, 18, 12)],
    kinds: ['push', 'pull', 'delay'], par: 4, maxBlasts: 18,
  },
  {
    id: 'bc-10', name: '星の巣へ', hint: '四つの爆風、全部の技で。空の真ん中の巣まで',
    start: { x: 2.5, y: 15.4 }, nest: { x: 16, y: 5.5, w: 2.0 },
    islands: [{ pts: flat(1, 6, 15.9) }, { pts: flat(10, 15, 13, 1.3) }, { pts: flat(25, 31, 10.5) }, { pts: flat(13.5, 18.5, 5.5, 1.4) }],
    clouds: [{ x: 27, y: 6.5, rx: 2.2, ry: 0.8 }],
    thorns: [spike(9, 3, 18, 14), spike(22, 3, 18, 13)],
    kinds: ['push', 'pull', 'lift', 'delay'], par: 5, maxBlasts: 20,
  },
];
