/** Starsand の図解ルール（タイトルとポーズ画面） */
import { type RuleFrame, phase, seg, lerp, glow, ring, line, label } from '@engine/rules';

const GOLD = '#ffd27f', ICE = '#7ff0ff', WHITE = '#ffffff', LINEC = '#b9c4ff';

function grain(g: CanvasRenderingContext2D, x: number, y: number, c: string): void {
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), 2, 2);
}
function cup(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c = '#8f9be8', fill = 0, fc = GOLD): void {
  if (fill > 0) { g.save(); g.fillStyle = fc; g.globalAlpha = 0.8; g.fillRect(x, y + h - h * fill, w, h * fill); g.restore(); }
  g.save();
  g.strokeStyle = c;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x, y); g.lineTo(x, y + h); g.lineTo(x + w, y + h); g.lineTo(x + w, y);
  g.stroke();
  g.restore();
}
/** 注ぎ口から落ちる砂の流れ（決まった点の列を時間でずらす） */
function stream(g: CanvasRenderingContext2D, t: number, x: number, y0: number, y1: number, c: string): void {
  for (let i = 0; i < 10; i++) {
    const f = ((t * 1.4 + i / 10) % 1);
    grain(g, x + ((i * 37) % 5) - 2, lerp(y0, y1, f), c);
  }
}

export const sandRules: RuleFrame[] = [
  {
    caption: 'ドラッグで線を引く（右ドラッグで消す）',
    draw: (g, t) => {
      const p = phase(t, 2.4);
      const k = seg(p, 0.1, 0.7);
      line(g, 24, 34, lerp(24, 108, k), lerp(34, 66, k), LINEC, 1, 3);
      glow(g, lerp(24, 108, k), lerp(34, 66, k), 2.5, WHITE, p < 0.8 ? 1 : 0);
      label(g, 'インク', 108, 12, ICE, 9);
      g.fillStyle = 'rgba(159,208,255,.25)'; g.fillRect(90, 18, 36, 4);
      g.fillStyle = ICE; g.fillRect(90, 18, 36 * (1 - k * 0.5), 4);
    },
  },
  {
    caption: '砂は線をつたって流れる',
    draw: (g, t) => {
      line(g, 24, 40, 104, 66, LINEC, 1, 3);
      stream(g, t, 34, 4, 38, GOLD);
      for (let i = 0; i < 12; i++) {
        const f = ((t * 0.7 + i / 12) % 1);
        grain(g, lerp(34, 104, f), lerp(37, 60, f) + 0, GOLD);
      }
      for (let i = 0; i < 6; i++) {
        const f = ((t * 1.4 + i / 6) % 1);
        grain(g, 106 + ((i * 3) % 4), lerp(66, 92, f), GOLD);
      }
    },
  },
  {
    caption: '星座の器が満ちると、花火になって弾ける',
    draw: (g, t) => {
      const p = phase(t, 2.8);
      const fill = seg(p, 0, 0.55);
      stream(g, t, 68, 4, 50, GOLD);
      cup(g, 50, 50, 36, 30, '#8f9be8', fill);
      const b = seg(p, 0.55, 0.95);
      if (b > 0) {
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          glow(g, 68 + Math.cos(a) * b * 40, 40 + Math.sin(a) * b * 30, 2, i % 2 ? GOLD : '#ffa3e0', 1 - b);
        }
        ring(g, 68, 40, b * 30, WHITE, 1 - b, 2);
      }
    },
  },
  {
    caption: '色の器は同じ色で満たす。金＋水色が混ざると白になる',
    draw: (g, t) => {
      const p = phase(t, 2.8);
      stream(g, t, 48, 4, 52, GOLD);
      stream(g, t + 0.3, 88, 4, 52, ICE);
      line(g, 40, 46, 64, 58, LINEC, 1, 2.5);
      line(g, 96, 46, 72, 58, LINEC, 1, 2.5);
      const fill = seg(p, 0, 0.8);
      cup(g, 54, 62, 28, 22, WHITE, fill, '#f4f4ff');
      label(g, '金＋水色＝白', 68, 92, WHITE, 9);
    },
  },
];

/** 新しい要素の図解（SS-12）：星風と星の門 */
export const windRule: RuleFrame = {
  caption: '青い帯（星風）の中では、砂が風の向きへ運ばれる。風に乗せれば壁も越えられる',
  draw: (g, t) => {
    g.save(); g.fillStyle = '#7fb8ff'; g.globalAlpha = 0.12; g.fillRect(40, 14, 90, 26); g.restore();
    for (let k = 0; k < 6; k++) { const f = (t * 0.8 + k / 6) % 1; line(g, 44 + f * 80, 20 + (k % 3) * 8, 54 + f * 80, 20 + (k % 3) * 8, '#cfe6ff', 0.5); }
    line(g, 100, 46, 100, 92, '#8f9be8', 1, 4);
    for (let i = 0; i < 14; i++) {
      const p = phase(t + i * 0.07, 1.6);
      const x = p < 0.3 ? 20 + p * 60 : lerp(38, 150, seg(p, 0.3, 1));
      const y = p < 0.3 ? 10 + p * 40 : 22 + Math.pow(seg(p, 0.3, 1), 2) * 62;
      grain(g, x, y, ICE);
    }
    cup(g, 136, 70, 30, 22, '#8f9be8', 0.4, ICE);
  },
};
export const portalRule: RuleFrame = {
  caption: '星の門に入った砂は、点線の先の出口から出てくる。屋根のある器にはここからしか入れない',
  draw: (g, t) => {
    for (let k = 0; k < 3; k++) ring(g, 140, 80, 12 * (1 - ((t * 0.7 + k / 3) % 1)), '#c9a3ff', 0.7);
    ring(g, 50, 60, 6, '#c9a3ff', 0.8);
    line(g, 140, 80, 50, 60, '#c9a3ff', 0.4, 1, [2, 4]);
    line(g, 28, 48, 72, 48, '#8f9be8', 1, 3);
    cup(g, 32, 62, 36, 26, '#8f9be8', seg(phase(t, 4), 0.2, 1) * 0.8, '#ffa3e0');
    for (let i = 0; i < 8; i++) { const p = phase(t + i * 0.12, 1); grain(g, lerp(110, 138, p), lerp(40, 78, p), '#ffa3e0'); }
    glow(g, 50, 60, 5, '#c9a3ff', 0.6);
    label(g, '門', 140, 102, '#c9a3ff', 10);
  },
};
