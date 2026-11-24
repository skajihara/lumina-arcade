/** Event Horizon の図解ルール（タイトルとポーズ画面） */
import { type RuleFrame, phase, seg, lerp, ease, glow, ring, line, label } from '@engine/rules';

const ORANGE = '#ffb38a', GOLD = '#ffd98a', ICE = '#7ff0ff';

function hole(g: CanvasRenderingContext2D, x: number, y: number, r = 9): void {
  glow(g, x, y, r * 0.8, ORANGE, 0.35);
  g.save();
  g.fillStyle = '#000';
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.restore();
  ring(g, x, y, r + 1, ORANGE, 0.9, 1.5);
}
function shard(g: CanvasRenderingContext2D, x: number, y: number, a = 1): void {
  glow(g, x, y, 2.6, '#bfe8ff', a);
}
function goal(g: CanvasRenderingContext2D, x: number, y: number, lit = 0): void {
  ring(g, x, y, 9, GOLD, 0.5 + lit * 0.5, 2);
  if (lit > 0) glow(g, x, y, 6, GOLD, lit);
}

export function horizonRules(spits: boolean): RuleFrame[] {
  return [
    {
      caption: '押している間、ブラックホールがかけらを引き寄せる',
      draw: (g, t) => {
        const p = phase(t, 2.6);
        const k = ease(seg(p, 0.15, 0.75));
        hole(g, 68, 40);
        const pts = [[18, 80], [44, 86], [96, 84], [120, 76]];
        pts.forEach(([x, y], i) => {
          const a = (i / 4) * Math.PI * 2 + t * 2;
          const tx = 68 + Math.cos(a) * 20, ty = 40 + Math.sin(a) * 8;
          shard(g, lerp(x, tx, k), lerp(y, ty, k));
          if (k > 0 && k < 1) line(g, lerp(x, tx, k), lerp(y, ty, k), lerp(x, tx, k * 0.6 + 0.4), lerp(y, ty, k * 0.6 + 0.4), ICE, 0.3, 1);
        });
        label(g, '引く', 68, 14, ICE, 10, p > 0.1 && p < 0.8 ? 1 : 0.3);
      },
    },
    {
      caption: 'かけらは輪に乗って回る。輪ごと運べる（速すぎるとこぼれる）',
      draw: (g, t) => {
        const p = phase(t, 3);
        const bx = 30 + ease(seg(p, 0.1, 0.8)) * 76, by = 50 + Math.sin(p * Math.PI * 2) * 8;
        g.save(); g.strokeStyle = 'rgba(255,179,138,.35)'; g.lineWidth = 1; g.beginPath(); g.ellipse(bx, by, 24, 9, 0, 0, Math.PI * 2); g.stroke(); g.restore();
        hole(g, bx, by, 7);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + t * 3;
          shard(g, bx + Math.cos(a) * 24, by + Math.sin(a) * 9);
        }
      },
    },
    {
      caption: '放すか「解放」（Space）で、輪のかけらを投げる',
      draw: (g, t) => {
        const p = phase(t, 2.6);
        const k = seg(p, 0.35, 1);
        hole(g, 40, 56, 7);
        if (p < 0.35) {
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + t * 3;
            shard(g, 40 + Math.cos(a) * 20, 56 + Math.sin(a) * 8);
          }
        } else {
          ring(g, 40, 56, 6 + k * 40, '#ffffff', 1 - k, 2.5);
          for (let i = 0; i < 4; i++) {
            const a = -Math.PI / 2 + (i - 1.5) * 0.5;
            shard(g, 40 + Math.cos(a) * (20 + k * 70), 56 + Math.sin(a) * (8 + k * 50) + k * k * 30, 1 - k * 0.3);
          }
          label(g, '解放', 40, 86, '#ffffff', 11, 1 - k);
        }
      },
    },
    {
      caption: spits
        ? '星座の穴へ入れればクリア。地平に落としたかけらは、少しの間なら解放で吐き出せる'
        : '星座の穴へ入れればクリア。地平に落とすと消える',
      draw: (g, t) => {
        const p = phase(t, 2.6);
        const k = seg(p, 0, 0.6);
        goal(g, 104, 30, seg(p, 0.6, 0.7) * (1 - seg(p, 0.85, 1)));
        hole(g, 28, 70, 7);
        if (k < 1) shard(g, lerp(36, 104, k), lerp(64, 30, k) - Math.sin(k * Math.PI) * 26);
        else label(g, '+1', 104, 50, GOLD, 12, 1 - seg(p, 0.8, 1));
      },
    },
  ];
}
