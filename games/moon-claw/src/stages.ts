/**
 * Moon Claw のステージ。NEW-03 では仮の3面（NEW-04 で増やして難易度を測る）。
 * 座標は物理の世界（幅 14 × 高さ 24 m）。棚は y=9、落とし口は x=6〜8。下の段の斜面は y=18.5〜21.3、フリッパーは y=21.6
 */
import { SHELF_Y, type ClawStage, type SpiritDef } from './sim';

/** 棚の上の山：x0 から右へ cols 個ずつ、rows 段 */
export function pile(x0: number, cols: number, rows: number, bombs: number[] = []): SpiritDef[] {
  const out: SpiritDef[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - (r % 2); c++) {
      const i = out.length;
      out.push({ x: x0 + c * 0.66 + (r % 2) * 0.33, y: SHELF_Y - 0.33 - r * 0.58, bomb: bombs.includes(i) });
    }
  }
  return out;
}

export const clawStages: ClawStage[] = [
  {
    id: 'mc-1', name: '月の爪', hint: '爪を山の上へ動かし、下ろして掴む。ゆっくり運んで、真ん中の落とし口で放そう',
    spirits: pile(1.5, 5, 2),
    goals: [{ x: 2.3, y: 13.2, r: 0.9, mult: 1 }, { x: 11.7, y: 13.2, r: 0.9, mult: 1 }, { x: 7, y: 15.6, r: 0.7, mult: 2 }],
    posts: [{ x: 7, y: 11.6, r: 0.45 }],
    need: 3,
  },
  {
    id: 'mc-2', name: '両岸の山', hint: '山は左右に二つ。巣穴の金の数字が倍率。高い巣穴を狙え',
    spirits: [...pile(1.2, 4, 2), ...pile(9.9, 4, 2)],
    goals: [{ x: 1.8, y: 12.4, r: 0.8, mult: 1 }, { x: 12.2, y: 12.4, r: 0.8, mult: 1 }, { x: 4.6, y: 15.2, r: 0.65, mult: 2 }, { x: 9.4, y: 15.2, r: 0.65, mult: 2 }],
    posts: [{ x: 7, y: 11.6, r: 0.45 }, { x: 7, y: 17.2, r: 0.4 }],
    need: 5,
  },
  {
    id: 'mc-3', name: '星の雪崩', hint: '赤い爆弾精霊は強くぶつかると弾ける。山の中で弾けさせれば、精霊が雪崩のように落とし口へ',
    spirits: pile(2.3, 6, 3, [7]),
    goals: [{ x: 1.8, y: 12.8, r: 0.8, mult: 1 }, { x: 12.2, y: 12.8, r: 0.8, mult: 1 }, { x: 7, y: 15.4, r: 0.65, mult: 3 }],
    posts: [{ x: 7, y: 11.6, r: 0.45 }, { x: 4.4, y: 16.4, r: 0.35 }, { x: 9.6, y: 16.4, r: 0.35 }],
    need: 6,
  },
];
