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
    boxes: [cupBox(140, H - 22, 34, 18, 200)],
    ink: 500,
    solution: [[{ x: 30, y: 40 }, { x: 156, y: 84 }]],
  }),
  stage({
    id: 'ss-02',
    name: '二つの器',
    hint: '線で流れを分けて、両方の器を満たせ',
    sources: [{ x: W / 2, y: 2, color: 1, total: 1400, rate: 4, width: 7 }],
    boxes: [cupBox(18, H - 24, 30, 20, 190), cupBox(W - 48, H - 24, 30, 20, 190)],
    ink: 520,
    solution: [[{ x: W / 2, y: 30 }, { x: 33, y: 84 }], [{ x: W / 2 + 1, y: 30 }, { x: W - 33, y: 84 }]],
  }),
  stage({
    id: 'ss-03',
    name: '星の棚',
    hint: '壁を越えて、高い器へ',
    walls: [{ x: 90, y: 54, w: 4, h: 66 }],
    sources: [{ x: 20, y: 2, color: 2, total: 1100, rate: 3, width: 5 }],
    boxes: [cupBox(120, 64, 40, 16, 200)],
    ink: 600,
    solution: [[{ x: 8, y: 20 }, { x: 140, y: 56 }]],
  }),
  stage({
    id: 'ss-04',
    name: '混ざる光',
    hint: '金と水色の砂が触れると白く光る。二つの流れを一つの器で出会わせよ',
    sources: [{ x: 40, y: 2, color: 0, total: 900, rate: 3, width: 5 }, { x: 160, y: 2, color: 1, total: 900, rate: 3, width: 5 }],
    boxes: [cupBox(82, H - 24, 36, 20, 450, 4)],
    ink: 520,
    solution: [[{ x: 30, y: 40 }, { x: 96, y: 82 }], [{ x: 170, y: 40 }, { x: 104, y: 82 }]],
  }),
  stage({
    id: 'ss-05',
    name: '三つの注ぎ口',
    hint: '色ごとに、その色の器へ。流れを交わらせるな',
    walls: [{ x: 0, y: 70, w: 18, h: 4 }],
    sources: [{ x: 30, y: 2, color: 0, total: 700, rate: 3, width: 5 }, { x: 100, y: 2, color: 1, total: 700, rate: 3, width: 5 }, { x: 170, y: 2, color: 2, total: 700, rate: 3, width: 5 }],
    boxes: [cupBox(52, H - 22, 26, 18, 250, 0), cupBox(122, H - 22, 26, 18, 250, 1), cupBox(160, H - 50, 30, 16, 280, 2)],
    ink: 560,
    solution: [[{ x: 22, y: 30 }, { x: 66, y: 60 }], [{ x: 92, y: 30 }, { x: 136, y: 60 }], [{ x: 178, y: 20 }, { x: 175, y: 30 }]],
  }),
  stage({
    id: 'ss-06',
    name: '狭い口',
    hint: '器の口は細い。真上から落とせ',
    walls: [{ x: 118, y: 78, w: 16, h: 3 }, { x: 140, y: 78, w: 16, h: 3 }],
    sources: [{ x: 30, y: 2, color: 2, total: 1200, rate: 3, width: 5 }],
    boxes: [cupBox(118, 78, 38, 22, 230)],
    ink: 520,
    solution: [[{ x: 20, y: 30 }, { x: 132, y: 62 }], [{ x: 133, y: 62 }, { x: 137, y: 64 }]],
  }),
  stage({
    id: 'ss-07',
    name: '紫の夜',
    hint: '水色と桃色で紫。桃色の器にも分けて注げ',
    sources: [{ x: 50, y: 2, color: 1, total: 1000, rate: 3, width: 5 }, { x: 140, y: 2, color: 2, total: 1400, rate: 4, width: 5 }],
    boxes: [cupBox(80, H - 24, 34, 20, 360, 3), cupBox(164, H - 24, 30, 20, 370, 2)],
    ink: 620,
    solution: [[{ x: 42, y: 40 }, { x: 94, y: 80 }], [{ x: 140, y: 34 }, { x: 102, y: 80 }], [{ x: 141, y: 34 }, { x: 176, y: 70 }]],
  }),
  stage({
    id: 'ss-08',
    name: '銀河の砂時計',
    hint: '白の器と紫の器。水色の砂を二つに分けよ',
    walls: [{ x: 92, y: 60, w: 16, h: 16 }],
    sources: [{ x: 30, y: 2, color: 0, total: 700, rate: 2, width: 5, delay: 150 }, { x: 100, y: 2, color: 1, total: 1600, rate: 5, width: 5 }, { x: 170, y: 2, color: 2, total: 700, rate: 2, width: 5, delay: 150 }],
    boxes: [cupBox(22, H - 24, 34, 20, 170, 4), cupBox(144, H - 24, 34, 20, 175, 3)],
    ink: 700,
    solution: [[{ x: 22, y: 30 }, { x: 40, y: 70 }], [{ x: 100, y: 26 }, { x: 44, y: 70 }], [{ x: 101, y: 26 }, { x: 156, y: 70 }], [{ x: 178, y: 30 }, { x: 160, y: 70 }]],
  }),
];

export { W };
