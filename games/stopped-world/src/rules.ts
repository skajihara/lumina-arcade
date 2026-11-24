/** Stopped World の図解ルール（タイトルとポーズ画面） */
import { type RuleFrame, phase, seg, lerp, ease, glow, ring, line, arrow, label } from '@engine/rules';

const GOLD = '#ffd98a', ICE = '#7ff0ff', GREY = '#8890b0';

function box(g: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, a = 1): void {
  g.save();
  g.globalAlpha = a;
  g.strokeStyle = color;
  g.lineWidth = 2;
  g.strokeRect(x - s / 2, y - s / 2, s, s);
  g.restore();
}
function egg(g: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  g.save();
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(x, y, 5.5, 7, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}
function nest(g: CanvasRenderingContext2D, x: number, y: number): void {
  g.save();
  g.strokeStyle = GOLD;
  g.lineWidth = 2;
  g.beginPath();
  g.arc(x, y - 4, 12, 0.15 * Math.PI, 0.85 * Math.PI);
  g.stroke();
  g.restore();
}

export const stoppedRules: RuleFrame[] = [
  {
    caption: '時間を止めると、世界は色を失って静止する',
    draw: (g, t) => {
      const p = phase(t, 2.4);
      const stop = p > 0.4;
      const k = stop ? 0.4 : p;
      const bx = lerp(20, 116, k / 0.4 * 0.5), by = 30 + (k / 0.4) * 28;
      glow(g, bx, by, 4, stop ? GREY : '#ffffff', stop ? 0.6 : 1);
      if (stop) {
        g.save(); g.fillStyle = 'rgba(160,170,200,.12)'; g.fillRect(0, 0, 136, 96); g.restore();
        g.fillStyle = '#e8e8ff';
        g.fillRect(58, 70, 6, 16); g.fillRect(70, 70, 6, 16);
        label(g, '停止中', 68, 14, '#e8e8ff', 11);
      }
    },
  },
  {
    caption: '止まった物体を<b style="color:#ffd98a">ドラッグ</b>して、力の矢印を置く',
    draw: (g, t) => {
      const p = phase(t, 2.4);
      g.save(); g.fillStyle = 'rgba(160,170,200,.10)'; g.fillRect(0, 0, 136, 96); g.restore();
      egg(g, 40, 60, '#d8d8e8');
      const k = ease(seg(p, 0.1, 0.6));
      if (k > 0) arrow(g, 40, 60, lerp(40, 96, k), lerp(60, 30, k), GOLD, 1, 3);
      // 指（カーソル）
      glow(g, lerp(40, 96, k), lerp(60, 30, k), 2.5, '#ffffff', p < 0.85 ? 0.9 : 0);
      if (k >= 1) line(g, 96, 30, 122, 22, GOLD, 0.6, 1.5, [3, 4]);
    },
  },
  {
    caption: 'もう一度押すと、溜めた力が<b style="color:#ffd98a">全部同時に</b>解き放たれる',
    draw: (g, t) => {
      const p = phase(t, 2.4);
      const k = ease(seg(p, 0.25, 0.9));
      const items: [number, number, number, number][] = [[30, 70, 60, -50], [68, 74, 0, -60], [106, 70, -50, -45]];
      if (p < 0.25) { g.save(); g.fillStyle = 'rgba(160,170,200,.10)'; g.fillRect(0, 0, 136, 96); g.restore(); }
      items.forEach(([x, y, dx, dy]) => {
        if (p < 0.25) { box(g, x, y, 12, GREY); arrow(g, x, y, x + dx * 0.4, y + dy * 0.4, GOLD, 1, 2.5); }
        else {
          const xx = x + dx * k, yy = y + dy * k + 40 * k * k;
          box(g, xx, yy, 12, '#ffffff');
          glow(g, xx, yy, 3, GOLD, 1 - k);
        }
      });
      if (p >= 0.25) ring(g, 68, 60, seg(p, 0.25, 0.6) * 60, ICE, 1 - seg(p, 0.25, 0.6), 2);
    },
  },
  {
    caption: '卵を巣へ運ぶ／箱を全部壊せばクリア（卵は強くぶつけると割れる）',
    draw: (g, t) => {
      const p = phase(t, 2.6);
      const k = seg(p, 0, 0.7);
      const ex = lerp(24, 104, k), ey = 70 - Math.sin(k * Math.PI) * 46;
      nest(g, 104, 76);
      egg(g, ex, ey, '#fff6dc');
      if (p > 0.7) { glow(g, 104, 70, 8, GOLD, 1 - seg(p, 0.7, 1)); label(g, 'CLEAR', 60, 20, GOLD, 15); }
    },
  },
];
