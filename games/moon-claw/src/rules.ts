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
    caption: '落ちた精霊は下の段の球。Z と / のフリッパーで金の巣穴へ。光は数秒で尽きるので、早めに狙おう',
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

/** NEW-04：その面で初めて出てくる要素の「NEW」カード */
export const moonIntros: Record<string, { title: string; frame: RuleFrame }> = {
  'mc-3': {
    title: '月のバンパー',
    frame: {
      caption: '白い満月の円盤は、当たった精霊を強く弾き返す。跳ね返りで巣穴を狙える',
      draw: (g, t) => {
        const p = phase(t, 2.4);
        g.save(); g.fillStyle = 'rgba(221,232,255,.55)'; g.beginPath(); g.arc(64, 54, 12 + (p > 0.4 && p < 0.5 ? 3 : 0), 0, Math.PI * 2); g.fill(); g.restore();
        ring(g, 64, 54, 12, '#ffffff', 0.9, 2);
        ring(g, 110, 22, 9, GOLD, 0.9, 2);
        label(g, '×2', 104, 26, GOLD, 9);
        const k = seg(p, 0, 0.45), k2 = seg(p, 0.45, 1);
        const x = p < 0.45 ? lerp(30, 52, k) : lerp(52, 110, k2);
        const y = p < 0.45 ? lerp(10, 46, k * k) : lerp(46, 22, Math.sqrt(k2));
        glow(g, x, y, 3, SPIRIT, p < 0.97 ? 1 : 0);
      },
    },
  },
  'mc-4': {
    title: '爆弾精霊',
    frame: {
      caption: '赤い棘の精霊は、強くぶつかると弾ける。掴んで山の上で放すと、山が崩れて落とし口へ雪崩れる',
      draw: (g, t) => {
        const p = phase(t, 3);
        g.save(); g.strokeStyle = '#6f78c9'; g.lineWidth = 2; g.beginPath(); g.moveTo(4, 70); g.lineTo(60, 70); g.moveTo(80, 70); g.lineTo(132, 70); g.stroke(); g.restore();
        if (p < 0.4) { glow(g, 40, lerp(10, 58, seg(p, 0, 0.35) ** 2), 4, RED); ring(g, 40, lerp(10, 58, seg(p, 0, 0.35) ** 2), 6, RED, 0.9, 1.5); }
        else ring(g, 40, 62, seg(p, 0.35, 0.5) * 26, RED, 1 - seg(p, 0.5, 0.8), 2);
        for (let i = 0; i < 5; i++) {
          const k = seg(p, 0.42, 1);
          const x = lerp(24 + i * 8, 70 + (i - 2) * 3, k);
          const y = k < 0.5 ? lerp(64, 50 - i * 2, k * 2) : lerp(50 - i * 2, 96, (k - 0.5) * 2);
          glow(g, x, p < 0.42 ? 64 : y, 3, SPIRIT);
        }
      },
    },
  },
  'mc-5': {
    title: '揺れる巣穴',
    frame: {
      caption: '巣穴が左右に行き来する。淡い線が通り道。来る時に合わせて弾こう',
      draw: (g, t) => {
        const x = 68 + Math.sin(t * 1.6) * 40;
        line(g, 28, 34, 108, 34, GOLD, 0.25, 1);
        ring(g, x, 34, 9, GOLD, 0.9, 2);
        label(g, '×2', x - 6, 38, GOLD, 9);
        line(g, 40, 84, 60, 92, '#e6ecff', 0.9, 3);
        line(g, 96, 84, 76, 92, '#e6ecff', 0.9, 3);
      },
    },
  },
  'mc-6': {
    title: '棚の仕切り',
    frame: {
      caption: '棚の低い壁が山を分ける。爪はその上を越えられる。遠い山は急いで、でもこぼさずに',
      draw: (g, t) => {
        const p = phase(t, 3);
        shelf(g, 70);
        line(g, 20, 70, 20, 58, '#b9c6ff', 0.9, 2);
        for (let i = 0; i < 2; i++) glow(g, 8 + i * 6, 64, 3, SPIRIT, i === 0 && p > 0.3 ? 0 : 1);
        const k = seg(p, 0.3, 0.85);
        claw(g, lerp(8, 70, k), 26, p > 0.88 ? 1 : 0);
        if (p > 0.3) glow(g, lerp(8, 70, k), p > 0.88 ? lerp(36, 90, seg(p, 0.88, 1)) : 36, 3, GOLD);
      },
    },
  },
  'mc-8': {
    title: '高い巣穴',
    frame: {
      caption: '×3 の巣穴は棚のすぐ下。フリッパーの先の方で弾くと、高く遠くへ飛ぶ',
      draw: (g, t) => {
        const p = phase(t, 2.4);
        g.save(); g.strokeStyle = '#6f78c9'; g.lineWidth = 2; g.beginPath(); g.moveTo(4, 12); g.lineTo(132, 12); g.stroke(); g.restore();
        ring(g, 30, 24, 9, GOLD, 0.9, 2);
        label(g, '×3', 24, 28, GOLD, 9);
        const up = p > 0.35 && p < 0.5;
        line(g, 90, 84, 72, up ? 74 : 92, '#e6ecff', 0.95, 3);
        const k = seg(p, 0, 0.35), k2 = seg(p, 0.38, 0.95);
        const x = p < 0.38 ? 74 : lerp(74, 30, k2);
        const y = p < 0.38 ? lerp(40, 82, k * k) : lerp(82, 24, 1 - (1 - k2) ** 2);
        glow(g, x, y, 3, SPIRIT, p < 0.96 ? 1 : 0);
      },
    },
  },
};
