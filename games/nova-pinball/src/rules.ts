/** Nova Pinball の図解ルール（タイトルとポーズ画面） */
import { type RuleFrame, phase, seg, lerp, ease, glow, starShape, ring, line, label } from '@engine/rules';

const BLUE = '#9fd0ff', GOLD = '#ffd98a', PINK = '#ffa3e0';

/** チャージの点（3つ） */
function pips(g: CanvasRenderingContext2D, x: number, y: number, n: number): void {
  for (let i = 0; i < 3; i++) {
    g.fillStyle = i < n ? GOLD : 'rgba(140,150,220,.35)';
    g.beginPath();
    g.arc(x - 7 + i * 7, y, 2.2, 0, Math.PI * 2);
    g.fill();
  }
}

export const novaRules: RuleFrame[] = [
  {
    caption: 'フリッパーで打って、星に当てる。星はいつもボールを引く',
    draw: (g, t) => {
      const p = phase(t, 2.4);
      const k = ease(seg(p, 0, 0.45));
      // 星に引かれて曲がる道
      const bx = lerp(40, 92, k) - Math.sin(k * Math.PI) * 16, by = lerp(84, 34, k);
      for (let i = 1; i <= 4; i++) { const r0 = 10 + ((t * 14 + i * 7) % 28); g.save(); g.globalAlpha = 0.25 * (1 - r0 / 38); g.strokeStyle = '#dfe6ff'; g.beginPath(); g.arc(96, 30, r0, 0, Math.PI * 2); g.stroke(); g.restore(); }
      // フリッパー
      line(g, 22, 86, 44, 92, BLUE, 0.9, 4);
      line(g, 114, 86, 92, 92, BLUE, 0.9, 4);
      const hit = p > 0.45;
      starShape(g, 96, 30, 9, hit ? GOLD : '#dfe6ff');
      if (hit) glow(g, 96, 30, 6, GOLD, 1 - seg(p, 0.45, 1) * 0.6);
      pips(g, 96, 46, hit ? 1 : 0);
      glow(g, bx, by, 3.5, '#ffffff');
      if (hit) label(g, '+1', 112, 16, GOLD, 11, 1 - seg(p, 0.5, 0.9));
    },
  },
  {
    caption: '当てた星は灯ったまま。3回で満タン',
    draw: (g, t) => {
      const p = phase(t, 3);
      const n = p < 0.25 ? 1 : p < 0.55 ? 2 : 3;
      const xs = [34, 68, 102];
      xs.forEach((x, i) => {
        const lit = i <= 1 || p > 0.7;
        starShape(g, x, 42, 9, lit ? GOLD : '#c8d0f0', lit ? 1 : 0.6);
        if (lit) glow(g, x, 42, 5, GOLD, 0.5 + 0.2 * Math.sin(t * 4 + i));
      });
      pips(g, 68, 60, n);
      label(g, n === 3 ? '満タン！' : '灯り', 68, 80, n === 3 ? PINK : GOLD, 11);
    },
  },
  {
    caption: '爆発すると、線を火が走って灯った星へ',
    draw: (g, t) => {
      const p = phase(t, 2.6);
      const A = { x: 26, y: 62 }, B = { x: 68, y: 30 }, C = { x: 110, y: 60 };
      line(g, A.x, A.y, B.x, B.y, BLUE, 0.4, 1.5);
      line(g, B.x, B.y, C.x, C.y, BLUE, 0.4, 1.5);
      const f1 = seg(p, 0.15, 0.4), f2 = seg(p, 0.45, 0.7);
      // 火が線を伝う
      if (f1 > 0 && f1 < 1) glow(g, lerp(A.x, B.x, f1), lerp(A.y, B.y, f1), 3, GOLD);
      if (f2 > 0 && f2 < 1) glow(g, lerp(B.x, C.x, f2), lerp(B.y, C.y, f2), 3, GOLD);
      line(g, A.x, A.y, lerp(A.x, B.x, f1), lerp(A.y, B.y, f1), GOLD, 0.9, 2);
      line(g, B.x, B.y, lerp(B.x, C.x, f2), lerp(B.y, C.y, f2), GOLD, 0.9, 2);
      const boom = (x: number, y: number, at: number) => {
        const k = seg(p, at, at + 0.25);
        if (k <= 0) { starShape(g, x, y, 8, GOLD); return; }
        ring(g, x, y, 4 + k * 18, PINK, 1 - k, 2.5);
        glow(g, x, y, 6 * (1 - k), PINK, 1 - k);
      };
      boom(A.x, A.y, 0.02);
      boom(B.x, B.y, 0.4);
      boom(C.x, C.y, 0.7);
    },
  },
  {
    caption: '全部の星を燃やせばクリア。一気に連鎖させよう',
    draw: (g, t) => {
      const p = phase(t, 2.8);
      const pts = [[22, 40], [44, 24], [68, 34], [92, 22], [114, 40], [56, 62], [84, 64]];
      pts.forEach(([x, y], i) => {
        const at = 0.08 + i * 0.07;
        const k = seg(p, at, at + 0.25);
        if (k <= 0) starShape(g, x, y, 7, GOLD);
        else { ring(g, x, y, 3 + k * 14, i % 2 ? PINK : GOLD, 1 - k, 2); glow(g, x, y, 5 * (1 - k), '#fff', 1 - k); }
      });
      const c = seg(p, 0.62, 0.75);
      label(g, `連鎖 ×${Math.min(7, Math.floor(seg(p, 0.08, 0.6) * 7) + 1)}`, 68, 84, '#ffffff', 12, 1 - c);
      label(g, 'CLEAR', 68, 48, GOLD, 18, c);
    },
  },
];
