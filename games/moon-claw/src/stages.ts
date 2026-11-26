/**
 * Moon Claw のステージ（NEW-04：9面）。
 * 座標は物理の世界（幅 14 × 高さ 24 m）。棚は y=9、落とし口は x=6〜8。下の段の斜面は y=18.5〜21.3、フリッパーは y=21.6
 * 巣穴は「落ちるだけでは入らない」所（壁際・高い所・柱の陰）に置き、フリッパーで狙わせる。
 */
import { SHELF_Y, type ClawStage, type SpiritDef } from './sim';

/** 棚の上の山：x0 から右へ cols 個ずつ、rows 段。bombs は爆弾にする番号 */
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

/** 落とし口の真下の柱（落ちた精霊を左右へ振り分ける） */
const SPLIT = { x: 7, y: 11.2, r: 0.5 };

export const clawStages: ClawStage[] = [
  {
    id: 'mc-1', name: '月の爪', hint: '爪を山の上へ動かし、下ろして掴む。落とし口の上で止まってから開こう',
    spirits: pile(1.5, 5, 2),
    goals: [{ x: 2.2, y: 14.2, r: 1.0, mult: 1 }, { x: 11.8, y: 14.2, r: 1.0, mult: 1 }],
    posts: [SPLIT],
    need: 3,
  },
  {
    id: 'mc-2', name: '両岸の山', hint: '山は左右に二つ。真ん中の高い巣穴は ×2',
    spirits: [...pile(1.2, 4, 2), ...pile(9.9, 4, 2)],
    goals: [{ x: 1.6, y: 13.4, r: 0.85, mult: 1 }, { x: 12.4, y: 13.4, r: 0.85, mult: 1 }, { x: 7, y: 13.6, r: 0.6, mult: 2 }],
    posts: [SPLIT, { x: 7, y: 14.8, r: 0.35 }],
    need: 4,
  },
  {
    id: 'mc-3', name: '月のバンパー', hint: '丸い月のバンパーは精霊を弾き返す。暴れる精霊を巣穴へ',
    spirits: pile(9.6, 5, 2),
    goals: [{ x: 1.5, y: 11.6, r: 0.8, mult: 2 }, { x: 12.5, y: 11.6, r: 0.8, mult: 2 }, { x: 7, y: 16.6, r: 0.55, mult: 1 }],
    posts: [{ ...SPLIT, kick: 8 }, { x: 4.4, y: 14.2, r: 0.55, kick: 9 }, { x: 9.6, y: 14.2, r: 0.55, kick: 9 }],
    need: 10,
  },
  {
    id: 'mc-4', name: '星の雪崩', hint: '赤い爆弾精霊は強くぶつかると弾ける。山の上へ落とせば、精霊が雪崩のように落とし口へ',
    spirits: pile(2.3, 6, 3, [14]),
    goals: [{ x: 1.6, y: 13, r: 0.8, mult: 1 }, { x: 12.4, y: 13, r: 0.8, mult: 1 }, { x: 7, y: 14.4, r: 0.55, mult: 3 }],
    posts: [SPLIT, { x: 4.6, y: 16.4, r: 0.35 }, { x: 9.4, y: 16.4, r: 0.35 }],
    need: 8,
  },
  {
    id: 'mc-5', name: '揺れる巣穴', hint: '巣穴が左右に揺れる。来る時に合わせて弾け',
    spirits: [...pile(1.0, 4, 2), ...pile(10.2, 4, 2)],
    goals: [{ x: 7, y: 12.6, r: 0.7, mult: 2, move: { amp: 4.2, speed: 1.1 } }, { x: 7, y: 15.4, r: 0.6, mult: 1, move: { amp: 3.6, speed: 1.6, phase: 2 } }],
    posts: [SPLIT],
    need: 6,
    timeScale: 0.9,
  },
  {
    id: 'mc-6', name: '仕切りの棚', hint: '棚が低い壁で仕切られている。遠い山から、こぼさずに速く運べ',
    spirits: [...pile(0.6, 3, 2), ...pile(11.2, 3, 2), ...pile(3.4, 3, 1)],
    fences: [{ x: 2.6, h: 0.9 }, { x: 11.0, h: 0.9 }],
    goals: [{ x: 1.4, y: 12.2, r: 0.75, mult: 2 }, { x: 12.6, y: 12.2, r: 0.75, mult: 2 }, { x: 7, y: 16.8, r: 0.5, mult: 1 }],
    posts: [{ ...SPLIT, kick: 7 }],
    need: 10,
    timeScale: 0.8,
  },
  {
    id: 'mc-7', name: '連鎖の山', hint: '爆弾が三つ。一つを弾けさせれば、隣の爆弾も弾ける',
    spirits: pile(1.4, 7, 3, [2, 9, 15]),
    goals: [{ x: 1.4, y: 12.4, r: 0.75, mult: 2 }, { x: 12.6, y: 12.4, r: 0.75, mult: 2 }, { x: 7, y: 15, r: 0.55, mult: 3, move: { amp: 2.5, speed: 1.3 } }],
    posts: [SPLIT, { x: 4.2, y: 14.8, r: 0.5, kick: 8 }, { x: 9.8, y: 14.8, r: 0.5, kick: 8 }],
    need: 11,
    timeScale: 0.85,
  },
  {
    id: 'mc-8', name: '高い巣穴', hint: '巣穴は棚のすぐ下。フリッパーの先で強く打ち上げろ',
    spirits: [...pile(1.0, 4, 2, [5]), ...pile(10.0, 4, 2, [2])],
    goals: [{ x: 3.2, y: 10.4, r: 0.7, mult: 3 }, { x: 10.8, y: 10.4, r: 0.7, mult: 3 }, { x: 1.2, y: 15.6, r: 0.6, mult: 1 }, { x: 12.8, y: 15.6, r: 0.6, mult: 1 }],
    posts: [SPLIT, { x: 7, y: 15.2, r: 0.5, kick: 9 }],
    need: 13,
    timeScale: 0.85,
  },
  {
    id: 'mc-9', name: '満月', hint: '揺れる巣穴、バンパー、爆弾、仕切り。全部の技で',
    spirits: [...pile(0.6, 3, 2, [1]), ...pile(3.4, 3, 2), ...pile(9.0, 4, 2, [6]), ...pile(11.6, 3, 1)],
    fences: [{ x: 2.8, h: 0.8 }, { x: 11.4, h: 0.8 }],
    goals: [{ x: 7, y: 12.4, r: 0.6, mult: 3, move: { amp: 4.6, speed: 1.4 } }, { x: 1.3, y: 14.4, r: 0.65, mult: 1 }, { x: 12.7, y: 14.4, r: 0.65, mult: 1 }],
    posts: [{ ...SPLIT, kick: 8 }, { x: 4.4, y: 16.2, r: 0.45, kick: 8 }, { x: 9.6, y: 16.2, r: 0.45, kick: 8 }],
    need: 11,
    timeScale: 1,
  },
];
