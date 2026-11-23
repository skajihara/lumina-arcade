/**
 * Starsand のステージ。
 * 器は「壁で囲んだ箱」と「溜める領域（Cup）」の組。cupBox で両方を作る。
 * solution は自動プレイと検証に使う線（ステージが解けることの確認）。
 */
import { H, W, type Cup, type StageDef } from './sim';

type Rect = { x: number; y: number; w: number; h: number };

/** 器：底と左右の壁（厚さ2）と、その内側の溜める領域 */
export function cupBox(x: number, y: number, w: number, h: number, need: number, color?: number): { walls: Rect[]; cup: Cup } {
  return {
    walls: [
      { x: x - 2, y, w: 2, h: h + 2 },
      { x: x + w, y, w: 2, h: h + 2 },
      { x: x - 2, y: y + h, w: w + 4, h: 2 },
    ],
    cup: { x, y, w, h, need, color },
  };
}

const stage = (d: Omit<StageDef, 'walls' | 'cups'> & { walls?: Rect[]; boxes: ReturnType<typeof cupBox>[] }): StageDef => ({
  ...d,
  walls: [...(d.walls ?? []), ...d.boxes.flatMap((b) => b.walls)],
  cups: d.boxes.map((b) => b.cup),
});

export const stages: StageDef[] = [
  stage({
    id: 'ss-01',
    name: '最初の砂時計',
    hint: 'ドラッグで線を引く。砂の流れを器へ導け（右ドラッグで消す）',
    sources: [{ x: 40, y: 2, color: 0, total: 900, rate: 3, width: 5 }],
    boxes: [cupBox(140, H - 22, 34, 18, 220)],
    ink: 500,
    solution: [[{ x: 30, y: 40 }, { x: 156, y: 84 }]],
  }),
  stage({
    id: 'ss-02',
    name: '二つの器',
    hint: '線で流れを分けて、両方の器を満たせ',
    sources: [{ x: W / 2, y: 2, color: 1, total: 1400, rate: 4, width: 7 }],
    boxes: [cupBox(18, H - 24, 30, 20, 200), cupBox(W - 48, H - 24, 30, 20, 200)],
    ink: 520,
    solution: [[{ x: W / 2, y: 30 }, { x: 33, y: 84 }], [{ x: W / 2 + 1, y: 30 }, { x: W - 33, y: 84 }]],
  }),
  stage({
    id: 'ss-03',
    name: '星の棚',
    hint: '壁を越えて、高い器へ',
    walls: [{ x: 90, y: 40, w: 4, h: 80 }],
    sources: [{ x: 20, y: 2, color: 2, total: 1100, rate: 3, width: 5 }],
    boxes: [cupBox(120, 60, 40, 16, 220)],
    ink: 600,
    solution: [[{ x: 10, y: 25 }, { x: 140, y: 52 }]],
  }),
];

export { W };
