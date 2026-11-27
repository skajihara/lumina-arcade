/** Echo Loop の図解ルール（タイトルとポーズ画面）。EL-20b：一筆のループ */
import { type RuleFrame, phase, seg, lerp, glow, starShape, ring, label, line } from '@engine/rules';

const CYAN = '#7ff0ff', ME = '#ffffff', GOLD = '#ffd98a', DIM = 'rgba(127,240,255,.35)';

export const echoRules: RuleFrame[] = [
  {
    caption: '球を打って星に当てると、星が灯る',
    draw: (g, t) => {
      const p = phase(t, 2.4);
      const k = seg(p, 0, 0.5);
      const bx = lerp(30, 90, k), by = lerp(80, 40, k);
      const lit = p > 0.5;
      starShape(g, 96, 36, 8, lit ? CYAN : DIM, 1);
      if (lit) { glow(g, 96, 36, 10, CYAN, 0.6 * (1 - seg(p, 0.5, 1))); ring(g, 96, 36, 6 + seg(p, 0.5, 0.8) * 16, CYAN, 1 - seg(p, 0.5, 0.8)); }
      glow(g, p < 0.5 ? bx : lerp(90, 60, seg(p, 0.5, 1)), p < 0.5 ? by : lerp(40, 70, seg(p, 0.5, 1)), 3.5, ME);
    },
  },
  {
    caption: '落ちたら次の周。でも灯した星は残る — 少ない周で全部灯すほど★',
    draw: (g, t) => {
      const p = phase(t, 3);
      starShape(g, 40, 30, 7, CYAN);
      starShape(g, 70, 24, 7, CYAN);
      starShape(g, 100, 34, 7, p > 0.7 ? CYAN : DIM);
      const k = seg(p, 0, 0.4);
      if (p < 0.4) glow(g, 70, lerp(60, 94, k), 3.5, ME);
      if (p > 0.35 && p < 0.6) label(g, '2 周目', 70, 62, GOLD, 12, 1 - seg(p, 0.5, 0.6));
      if (p > 0.55) glow(g, lerp(120, 100, seg(p, 0.55, 0.7)), lerp(90, 38, seg(p, 0.55, 0.7)), 3.5, ME);
    },
  },
  {
    caption: '星座の線の両端が灯ると、光の弦になって球を弾く（足場にも壁にもなる）',
    draw: (g, t) => {
      const p = phase(t, 2.6);
      starShape(g, 30, 50, 7, CYAN);
      starShape(g, 110, 50, 7, CYAN);
      const k = seg(p, 0, 0.45);
      const hit = p > 0.45;
      const sag = hit ? Math.sin(seg(p, 0.45, 1) * 30) * 5 * (1 - seg(p, 0.45, 1)) : 0;
      g.save(); g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.beginPath(); g.moveTo(38, 50); g.quadraticCurveTo(70, 50 + sag * 2, 102, 50); g.stroke(); g.restore();
      glow(g, 70, hit ? lerp(46, 14, seg(p, 0.45, 1)) : lerp(10, 46, k), 3.5, ME);
    },
  },
  {
    caption: '速い球なら弦を切って通り抜けられる（次の周で張り直す）',
    draw: (g, t) => {
      const p = phase(t, 2.4);
      starShape(g, 30, 40, 7, CYAN);
      starShape(g, 110, 40, 7, CYAN);
      const k = seg(p, 0, 0.7);
      const by = lerp(90, 4, k);
      if (by > 40) line(g, 38, 40, 102, 40, '#ffffff', 0.9, 2);
      else { line(g, 38, 40, 52, 46, CYAN, 0.7, 1.5); line(g, 102, 40, 88, 46, CYAN, 0.7, 1.5); }
      glow(g, 70, by, 3.5, GOLD);
      for (let i = 1; i < 5; i++) glow(g, 70, by + i * 6, 2.5 - i * 0.4, GOLD, 0.4);
      if (by < 40 && by > 25) label(g, 'パチン', 70, 30, GOLD, 10);
    },
  },
];
