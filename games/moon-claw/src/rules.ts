/** Moon Claw の図解ルール（タイトルとポーズ画面）。NEW-03 */
import { type RuleFrame, phase, seg, lerp, glow, ring, label, line } from '@engine/rules';

const GOLD = '#ffd98a', SPIRIT = '#bfe3ff', RED = '#ff8f8f', DIM = '#6f78c9';

/** 月の爪（三日月の頭と2本の爪） */
function claw(g: CanvasRenderingContext2D, x: number, y: number, open: number): void {
  line(g, x, 0, x, y - 6, DIM, 0.8, 1);
  g.save(); g.strokeStyle = GOLD; g.lineWidth = 2; g.beginPath(); g.arc(x, y - 4, 6, Math.PI * 0.15, Math.PI * 0.85, true); g.stroke(); g.restore();
  const a = 0.3 + open * 0.5;
  line(g, x - 3, y, x - 3 - Math.sin(a) * 9, y + Math.cos(a) * 9, GOLD, 0.95, 2);
  line(g, x + 3, y, x + 3 + Math.sin(a) * 9, y + Math.cos(a) * 9, GOLD, 0.95, 2);
}
/** 棚と落とし口 */
function shelf(g: CanvasRenderingContext2D, y: number): void {
  line(g, 4, y, 60, y, DIM, 0.9, 2);
  line(g, 80, y, 132, y, DIM, 0.9, 2);
}

export const moonRules: RuleFrame[] = [
  {
    caption: 'マウスで爪を動かし、クリック長押しで下ろす。放すと閉じて、近くの精霊を掴む',
    draw: (g, t) => {
      const p = phase(t, 3);
      shelf(g, 70);
      for (let i = 0; i < 4; i++) glow(g, 20 + i * 9, 64, 3, SPIRIT, i === 1 && p > 0.55 ? 0 : 1);
      const down = seg(p, 0.15, 0.45), up = seg(p, 0.55, 0.85);
      const y = 18 + down * 36 - up * 36;
      claw(g, 29, y, p < 0.5 ? 1 : 0);
      if (p > 0.55) glow(g, 29, y + 10, 3, GOLD);
    },
  },
  {
    caption: 'ゆっくり運んで、真ん中の落とし口の上で右クリック（開く）。速く動かすとこぼれる',
    draw: (g, t) => {
      const p = phase(t, 3.2);
      shelf(g, 70);
      const k = seg(p, 0, 0.55);
      const x = lerp(28, 70, k);
      claw(g, x, 26, p > 0.6 ? 1 : 0);
      const fall = seg(p, 0.6, 1);
      glow(g, p > 0.6 ? 70 : x, p > 0.6 ? lerp(36, 92, fall * fall) : 36, 3, p > 0.6 ? GOLD : SPIRIT);
      if (p < 0.55) label(g, 'ゆっくり →', 34, 54, DIM, 9);
    },
  },
  {
    caption: '落ちた精霊は下の段の球になる。Z と / のフリッパーで打ち上げ、金の巣穴へ',
    draw: (g, t) => {
      const p = phase(t, 2.6);
      line(g, 20, 70, 50, 84, DIM, 0.9, 2);
      line(g, 116, 70, 86, 84, DIM, 0.9, 2);
      const up = p > 0.4 && p < 0.55;
      line(g, 50, 84, 66, up ? 74 : 90, GOLD, 1, 3);
      line(g, 86, 84, 72, 90, GOLD, 1, 3);
      ring(g, 104, 26, 9, GOLD, 0.9, 2);
      label(g, '×2', 98, 30, GOLD, 9);
      const k = seg(p, 0, 0.45), k2 = seg(p, 0.45, 0.95);
      const x = p < 0.45 ? 66 : lerp(64, 104, k2);
      const y = p < 0.45 ? lerp(20, 80, k * k) : lerp(80, 26, 1 - (1 - k2) * (1 - k2));
      glow(g, x, y, 3, SPIRIT, p < 0.95 ? 1 : 0);
      if (p > 0.92) label(g, '+2', 98, 14, GOLD, 11);
    },
  },
  {
    caption: '赤い爆弾精霊は強くぶつかると弾ける。山の中で弾けさせると、精霊が雪崩れて落とし口へ',
    draw: (g, t) => {
      const p = phase(t, 3);
      shelf(g, 70);
      const boom = seg(p, 0.35, 0.5);
      if (p < 0.4) glow(g, 46, lerp(10, 58, seg(p, 0, 0.35) ** 2), 4, RED);
      else ring(g, 46, 62, boom * 26, RED, 1 - seg(p, 0.5, 0.8), 2);
      for (let i = 0; i < 5; i++) {
        const k = seg(p, 0.42, 1);
        const x = lerp(30 + i * 8, 70 + (i - 2) * 3, k);
        const y = k < 0.5 ? lerp(64, 50 - i * 2, k * 2) : lerp(50 - i * 2, 96, (k - 0.5) * 2);
        glow(g, x, p < 0.42 ? 64 : y, 3, SPIRIT);
      }
    },
  },
];
