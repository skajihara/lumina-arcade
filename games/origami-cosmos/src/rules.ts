/** Origami Cosmos の図解ルール（タイトルとポーズ画面） */
import { type RuleFrame, phase, seg, lerp, ease, glow, starShape, ring, line, label } from '@engine/rules';

const GOLD = '#ffe2a8', PAPER = 'rgba(120,130,220,.22)', EDGE = 'rgba(170,180,255,.7)', PINK = '#ffa3e0';

function paper(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, a = 1): void {
  g.save();
  g.globalAlpha = a;
  g.fillStyle = PAPER;
  g.fillRect(x, y, w, h);
  g.strokeStyle = EDGE;
  g.lineWidth = 1;
  g.strokeRect(x, y, w, h);
  g.restore();
}

/** 右半分が折り線（x=68）を軸に左へ折れていく。k=0 開いている → 1 折れた */
function foldScene(g: CanvasRenderingContext2D, k: number, stars = true): void {
  paper(g, 20, 20, 48, 56);
  const w = 48 * Math.cos(k * Math.PI);
  paper(g, Math.min(68, 68 + w), 20, Math.abs(w), 56, 0.9);
  line(g, 68, 14, 68, 82, '#ffffff', 0.7, 1.2, [3, 3]);
  if (!stars) return;
  starShape(g, 38, 48, 6, GOLD);
  // 右の星：折れると x=98 → 38 へ
  const sx = 68 + 30 * Math.cos(k * Math.PI);
  starShape(g, sx, 48, 6, GOLD, k > 0.5 ? 0.85 : 1);
}

export const origamiRules: RuleFrame[] = [
  {
    caption: '折り線の片側をクリックすると、その側が線の向こうへ折れる',
    draw: (g, t) => {
      const p = phase(t, 2.6);
      const k = ease(seg(p, 0.25, 0.7));
      foldScene(g, k, false);
      glow(g, 100, 60, 2.5, '#ffffff', p < 0.3 ? 1 : 0);
      if (p < 0.3) ring(g, 100, 60, 4 + seg(p, 0.1, 0.3) * 6, '#ffffff', 0.8, 1.5);
    },
  },
  {
    caption: '折ると、遠い星どうしが同じ場所に重なる',
    draw: (g, t) => {
      const p = phase(t, 2.6);
      const k = ease(seg(p, 0.1, 0.6));
      foldScene(g, k);
      if (k >= 1) { ring(g, 38, 48, 10, GOLD, 0.6 + 0.3 * Math.sin(t * 6), 1.5); label(g, '重なった', 44, 88, GOLD, 10); }
    },
  },
  {
    caption: '星をクリックで点火。爆風は重なった星へ燃え広がる',
    draw: (g, t) => {
      const p = phase(t, 2.4);
      paper(g, 20, 20, 48, 56);
      paper(g, 20, 20, 48, 56, 0.9);
      line(g, 68, 14, 68, 82, '#ffffff', 0.5, 1.2, [3, 3]);
      const pts = [[38, 48], [32, 30], [52, 64]];
      pts.forEach(([x, y], i) => {
        const b = seg(p, 0.15 + i * 0.18, 0.45 + i * 0.18);
        if (b <= 0) starShape(g, x, y, 6, GOLD);
        else { ring(g, x, y, 3 + b * 16, i ? PINK : GOLD, 1 - b, 2); glow(g, x, y, 6 * (1 - b), '#fff', 1 - b); }
      });
      label(g, '点火', 100, 48, '#ffffff', 11, p < 0.3 ? 1 : 0.3);
    },
  },
  {
    caption: '点火すると紙は開く。燃えた星は消えたまま。少ない点火で全部燃やせ',
    draw: (g, t) => {
      const p = phase(t, 2.6);
      const k = 1 - ease(seg(p, 0.1, 0.55));
      foldScene(g, k, false);
      // 開くと、燃えた跡（暗い輪）が両側に
      if (k < 0.5) { ring(g, 38, 48, 5, '#5a5f90', 1, 1.5); ring(g, 98, 48, 5, '#5a5f90', 1, 1.5); }
      label(g, '✦✧', 68, 88, GOLD, 12, seg(p, 0.6, 0.8));
      label(g, 'CLEAR', 68, 10, GOLD, 12, seg(p, 0.7, 0.85));
      void lerp;
    },
  },
];
