/** Moon Claw の図解ルール（タイトルとポーズ画面）。MC-10 で物理の爪に合わせて作り直した */
import { type RuleFrame, phase, seg, lerp, glow, label, line } from '@engine/rules';

const GOLD = '#ffd98a', ICE = '#9fe3ff', DIM = '#6f78c9', PEARL = '#fff3e6', MOON = '#c9b8ff';

/** 月の爪（頭と2本の指。open 0 閉〜1 開） */
function claw(g: CanvasRenderingContext2D, x: number, y: number, open: number): void {
  line(g, x, 0, x, y - 4, DIM, 0.8, 1);
  g.save(); g.fillStyle = GOLD; g.fillRect(x - 6, y - 4, 12, 4); g.restore();
  const a = 0.05 + open * 0.75;
  for (const s of [-1, 1]) {
    const bx = x + s * 3, ex = bx + s * Math.sin(a) * 14, ey = y + Math.cos(a) * 14;
    line(g, bx, y, ex, ey, GOLD, 0.95, 2);
    line(g, ex, ey, ex - s * 4 * Math.cos(a), ey + 1, GOLD, 0.95, 2);
  }
}
function gem(g: CanvasRenderingContext2D, x: number, y: number, c: string, r = 4): void {
  glow(g, x, y, r, c);
}
function floor(g: CanvasRenderingContext2D): void {
  line(g, 4, 92, 156, 92, DIM, 0.9, 2);
}
function box(g: CanvasRenderingContext2D, x: number): void {
  line(g, x, 76, x, 92, GOLD, 0.8, 2);
  line(g, x + 30, 76, x + 30, 92, GOLD, 0.8, 2);
}

export const moonRules: RuleFrame[] = [
  {
    caption: '←→↑↓（またはマウスのドラッグ）で爪を動かす。Z で開く、X で閉じる — 押している間だけ動き、放すとそこで止まる',
    draw: (g, t) => {
      const p = phase(t, 3.2);
      floor(g);
      const down = seg(p, 0.1, 0.4), up = seg(p, 0.6, 0.9);
      const y = 30 + down * 44 - up * 44;
      const open = p < 0.1 ? lerp(0.2, 1, p / 0.1) : p < 0.45 ? 1 : 1 - seg(p, 0.45, 0.55);
      claw(g, 50, y, open);
      gem(g, 50, p > 0.55 ? y + 15 : 86, ICE);
    },
  },
  {
    caption: '宝石箱の上で開くと、落ちた宝石が箱の中で落ち着いた時に納まる。点数 × 箱の倍率',
    draw: (g, t) => {
      const p = phase(t, 3.2);
      floor(g);
      box(g, 110);
      const k = seg(p, 0, 0.5);
      const x = lerp(40, 125, k);
      const open = p > 0.6 ? 1 : 0;
      claw(g, x, 30, open);
      const gy = p > 0.6 ? Math.min(84, 45 + (p - 0.6) * 260) : 45;
      gem(g, x, gy, ICE);
      if (p > 0.8) label(g, '+1', 125, 66, GOLD, 12, seg(p, 0.8, 0.9));
    },
  },
  {
    caption: '宝石ごとに形と重さが違う。水晶 1点・真珠 2点（丸くて滑る）・月長石 3点（重い）・星の結晶 2点（細長い）',
    draw: (g, t) => {
      floor(g);
      const w = Math.sin(t * 2) * 1.5;
      gem(g, 24, 86, ICE, 5);
      g.save(); g.fillStyle = ICE; g.globalAlpha = 0.6; g.fillRect(19, 81, 10, 9); g.restore();
      gem(g, 62 + w, 87, PEARL, 4);
      gem(g, 100, 83, MOON, 8);
      g.save(); g.fillStyle = GOLD; g.globalAlpha = 0.7; g.fillRect(124, 87, 26, 4); g.restore();
      label(g, '1', 24, 70, ICE, 11);
      label(g, '2', 62, 70, PEARL, 11);
      label(g, '3', 100, 66, MOON, 11);
      label(g, '2', 137, 70, GOLD, 11);
    },
  },
];

export const moonIntros: Record<string, { title: string; frame: RuleFrame }> = {
  'mc-1': { title: '物理の爪', frame: moonRules[0] },
  'mc-2': { title: '宝石の種類', frame: moonRules[2] },
};
