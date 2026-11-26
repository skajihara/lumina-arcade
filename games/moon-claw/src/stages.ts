/**
 * Moon Claw のステージ（MC-10：物理の爪で作り直した最初の6面。MC-12 で 8〜10 面に作り直す）。
 * 座標は物理の世界（幅 22 × 高さ 14 m）。床は y = FLOOR_Y。宝石箱は口の左上と中の広さ
 */
import { FLOOR_Y, GEMS, type BoxDef, type ClawStage, type GemDef, type GemKind } from './sim';

/** 床の上に横一列 */
function row(kind: GemKind, x0: number, n: number, gap: number, y = FLOOR_Y): GemDef[] {
  const g = GEMS[kind];
  const hh = g.shape === 'circle' ? g.w : g.h / 2;
  return Array.from({ length: n }, (_, i) => ({ kind, x: +(x0 + i * gap).toFixed(2), y: +(y - hh - 0.01).toFixed(2) }));
}
/** 床の上の宝石箱 */
function floorBox(x: number, w: number, h: number, mult: number): BoxDef {
  return { x, y: FLOOR_Y - h - 0.2, w, h, mult };
}

export const clawStages: ClawStage[] = [
  {
    id: 'mc-1', name: '月の爪',
    hint: '爪を水晶の真上へ。開いて（Z）下ろし（↓）、閉じて（X）持ち上げる。宝石箱の上で開けば納まる',
    gems: row('crystal', 3, 4, 1.8),
    boxes: [floorBox(15.5, 3.6, 1.4, 1)],
    need: 3, startX: 6,
  },
  {
    id: 'mc-2', name: '転がる真珠',
    hint: '真珠は丸くて滑る（2点）。指先の鉤の上に乗せるように、深く下ろしてから閉じよう',
    gems: [...row('pearl', 2.5, 3, 1.7), ...row('crystal', 8.5, 2, 1.8)],
    boxes: [floorBox(16, 3.4, 1.4, 1)],
    need: 6, startX: 5,
  },
  {
    id: 'mc-3', name: '高い台',
    hint: '台の上の宝石箱は ×2。高く持ち上げてから運ぼう',
    gems: [...row('crystal', 2.5, 3, 1.8), ...row('pearl', 8, 2, 1.7)],
    blocks: [{ x: 16.6, y: 7.6, w: 4.2, h: FLOOR_Y - 7.6 }],
    boxes: [{ x: 16.9, y: 7.6 - 1.4 - 0.2, w: 3.6, h: 1.4, mult: 2 }, floorBox(11.2, 3.2, 1.2, 1)],
    need: 10, startX: 6,
  },
  {
    id: 'mc-4', name: '月長石',
    hint: '月長石は重い（3点）。しっかり閉じて、ゆっくり動かそう — 急に動くと振れて落ちる',
    gems: [...row('moonstone', 3, 3, 2.0), ...row('crystal', 9.4, 2, 1.8)],
    boxes: [floorBox(16, 3.6, 1.4, 1)],
    need: 9, startX: 6,
  },
  {
    id: 'mc-5', name: '星の結晶',
    hint: '星の結晶は細長い（2点）。真ん中を挟まないと傾いて抜ける。細い宝石箱は ×2',
    gems: [...row('shard', 2.6, 3, 2.2), ...row('pearl', 9.6, 2, 1.7)],
    boxes: [floorBox(17.5, 1.6, 1.6, 2), floorBox(12.6, 3.4, 1.2, 1)],
    need: 10, startX: 6,
  },
  {
    id: 'mc-6', name: '宝石の山',
    hint: '台の上の宝石の山。崩さないように上から順に。宙に浮かぶ宝石箱は ×2',
    blocks: [{ x: 2, y: 10.4, w: 6, h: FLOOR_Y - 10.4 }],
    gems: [
      ...row('crystal', 2.6, 4, 1.5, 10.4), ...row('pearl', 3.3, 3, 1.5, 10.4 - 0.5),
      ...row('moonstone', 10.2, 2, 2.0),
    ],
    boxes: [floorBox(17.4, 3.4, 1.4, 1), { x: 12.8, y: 6.2, w: 2.6, h: 1.2, mult: 2 }],
    need: 11, startX: 5,
  },
];
