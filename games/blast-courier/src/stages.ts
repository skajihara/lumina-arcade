/**
 * Blast Courier のステージ（NEW-05 では仮の4面。NEW-07 で増やして難易度を測る）。
 * 世界は 幅 32 × 高さ 18 m（y は下向き）。下は雲海（落ちると最後に止まった所へ戻る）
 */
import type { CourierStage, Pt } from './sim';

/** 上が平らな島：左 x0〜右 x1、上の面の高さ y、厚み h（下に向かって少しすぼまる） */
export const flat = (x0: number, x1: number, y: number, h = 2.4): Pt[] => [
  { x: x0, y }, { x: x1, y }, { x: x1 - 0.8, y: y + h * 0.6 }, { x: (x0 + x1) / 2, y: y + h }, { x: x0 + 0.8, y: y + h * 0.6 },
];

export const courierStages: CourierStage[] = [
  {
    id: 'bc-1', name: 'はじめの一吹き', hint: '卵の左下をクリックすると、爆風で右上へ飛ぶ。近いほど強い。星の巣まで届けよう',
    start: { x: 4, y: 11.9 }, nest: { x: 25.5, y: 12.5, w: 2.4 },
    islands: [{ pts: flat(1, 12, 12.4) }, { pts: flat(17, 31, 12.5) }],
    kinds: ['push'], par: 3, maxBlasts: 12,
  },
  {
    id: 'bc-2', name: '雲の橋', hint: '雲はふわりと卵を受け止める。強く飛ばしても、雲の上なら割れない',
    start: { x: 3, y: 9.9 }, nest: { x: 28.5, y: 8.5, w: 2.2 },
    islands: [{ pts: flat(1, 8, 10.4) }, { pts: flat(13, 18, 14) }, { pts: flat(22, 31, 8.5) }],
    clouds: [{ x: 15.5, y: 11.6, rx: 3.2, ry: 1.1 }],
    kinds: ['push'], par: 3, maxBlasts: 12,
  },
  {
    id: 'bc-3', name: '吸い寄せ', hint: '右クリックで「吸う」。その場へ卵を引き寄せる。崖の上へは、押して吸って',
    start: { x: 4, y: 13.9 }, nest: { x: 26, y: 6.5, w: 2.2 },
    islands: [{ pts: flat(1, 11, 14.4) }, { pts: flat(13, 20, 10.5) }, { pts: flat(22, 30, 6.5) }],
    kinds: ['push', 'pull'], par: 4, maxBlasts: 14,
  },
  {
    id: 'bc-4', name: '上昇気流', hint: '「昇る」爆風は、その場から上へ気流の柱を立てる。高い島へ',
    start: { x: 5, y: 14.9 }, nest: { x: 25, y: 4.5, w: 2.2 },
    islands: [{ pts: flat(1, 11, 15.4) }, { pts: flat(20, 29, 4.5, 2) }],
    thorns: [{ pts: [{ x: 13, y: 18 }, { x: 15, y: 9 }, { x: 17, y: 18 }] }],
    kinds: ['push', 'pull', 'lift'], par: 4, maxBlasts: 14,
  },
];
