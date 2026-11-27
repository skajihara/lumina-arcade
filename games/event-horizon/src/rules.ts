/** Event Horizon（地平すれすれ・EH-20b）の図解ルール（タイトルとポーズ画面・NEW カード） */
import { type RuleFrame, phase, seg, lerp, glow, ring, line, label } from '@engine/rules';

const ORANGE = '#ffb38a', GOLD = '#ffd98a', BLUE = '#7fa8ff', ICE = '#9fe0ff';
const CX = 70, CY = 52;

function hole(g: CanvasRenderingContext2D, x: number, y: number, r = 9): void {
  g.save();
  g.strokeStyle = ORANGE; g.globalAlpha = 0.5; g.lineWidth = 1.5;
  g.beginPath(); g.ellipse(x, y, r * 2.2, r * 0.6, 0, 0, Math.PI * 2); g.stroke();
  g.globalAlpha = 1; g.fillStyle = '#000';
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.restore();
  ring(g, x, y, r + 1, BLUE, 0.9, 1.5);
}
function ship(g: CanvasRenderingContext2D, x: number, y: number, ang: number, fire = 0): void {
  g.save();
  g.translate(x, y); g.rotate(ang);
  g.fillStyle = '#f4f6ff';
  g.beginPath(); g.moveTo(6, 0); g.lineTo(-4, 3.5); g.lineTo(-2, 0); g.lineTo(-4, -3.5); g.closePath(); g.fill();
  if (fire > 0) { g.fillStyle = GOLD; g.beginPath(); g.moveTo(-3, 1.5); g.lineTo(-10, 0); g.lineTo(-3, -1.5); g.fill(); }
  if (fire < 0) { g.fillStyle = ICE; g.beginPath(); g.moveTo(6, 1.2); g.lineTo(12, 0); g.lineTo(6, -1.2); g.fill(); }
  g.restore();
}
/** 楕円軌道の上の点（a：長い半径、e：つぶれ、th：角度） */
const orbitPt = (a: number, e: number, th: number) => {
  const r = (a * (1 - e * e)) / (1 + e * Math.cos(th));
  return { x: CX + Math.cos(th) * r, y: CY + Math.sin(th) * r * 0.8 };
};

export const horizonRules: RuleFrame[] = [
  {
    caption: '↓ 減速を短く押すと、軌道が縮んで地平へ潜る。↑ 加速で膨らんで離れる',
    draw: (g, t) => {
      const p = phase(t, 3.4);
      hole(g, CX, CY, 8);
      const e = 0.55 * seg(p, 0.2, 0.35);
      // 軌道の線
      g.save(); g.strokeStyle = 'rgba(191,208,255,.35)'; g.setLineDash([2, 3]); g.beginPath();
      for (let i = 0; i <= 40; i++) { const q = orbitPt(34, e, (i / 40) * Math.PI * 2 + Math.PI); i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y); }
      g.stroke(); g.restore();
      const th = Math.PI + t * 2.2;
      const q = orbitPt(34, e, th), q2 = orbitPt(34, e, th + 0.05);
      ship(g, q.x, q.y, Math.atan2(q2.y - q.y, q2.x - q.x), p > 0.2 && p < 0.35 ? -1 : 0);
      label(g, p > 0.2 && p < 0.35 ? '↓ 減速' : '', 26, 14, ICE, 10);
    },
  },
  {
    caption: '地平に近いほど船の時計が遅れ、倍率が上がる（最大 ×9）。星が青く寄る',
    draw: (g, t) => {
      const p = phase(t, 3);
      hole(g, CX, CY, 9);
      const th = -Math.PI / 2 + p * Math.PI * 2;
      const r = 13 + 22 * (0.5 + 0.5 * Math.cos(p * Math.PI * 2));
      const x = CX + Math.cos(th) * r, y = CY + Math.sin(th) * r * 0.8;
      const m = 1 / Math.sqrt(Math.max(0.05, 1 - 9 / r));
      if (m > 1.6) glow(g, x, y, 6, BLUE, Math.min(1, (m - 1.6) / 2));
      ship(g, x, y, th + Math.PI / 2);
      label(g, `×${Math.min(9, m).toFixed(1)}`, 118, 16, m > 2 ? BLUE : '#ffffff', 13);
    },
  },
  {
    caption: '光るかけらを拾うと 10 × 倍率 点。すれすれで拾うほど大きい',
    draw: (g, t) => {
      const p = phase(t, 2.6);
      hole(g, CX, CY, 8);
      const k = seg(p, 0, 0.55);
      const x = lerp(14, 108, k), y = CY - 16 + Math.sin(k * Math.PI) * 12;
      if (k < 0.5) glow(g, 64, CY - 6, 3, GOLD);
      ship(g, x, y, 0.2);
      if (k >= 0.5) {
        ring(g, 64, CY - 6, 4 + seg(p, 0.27, 0.6) * 16, GOLD, 1 - seg(p, 0.27, 0.6), 2);
        label(g, '+34 ×3.4', 64, CY - 26, GOLD, 11, 1 - seg(p, 0.7, 1));
      }
    },
  },
  {
    caption: '地平の内側に入るか、画面の外へ流されたら終わり。燃料と船の時計にも限りがある',
    draw: (g, t) => {
      const p = phase(t, 2.8);
      hole(g, CX, CY, 9);
      const k = seg(p, 0, 0.7);
      const th = -Math.PI / 2 + k * Math.PI * 1.6;
      const r = lerp(36, 6, k * k);
      if (k < 1) ship(g, CX + Math.cos(th) * r, CY + Math.sin(th) * r * 0.8, th + Math.PI / 2);
      else label(g, '飲み込まれた', CX, 18, '#ff9f9f', 11, 1 - seg(p, 0.9, 1));
      line(g, 10, 92, 50, 92, GOLD, 0.8, 4);
      line(g, 10, 92, 10 + 40 * (1 - k * 0.8), 92, '#ff9f9f', 0.9, 4);
      label(g, '燃料', 30, 84, GOLD, 9);
    },
  },
];

/** その面で初めて出てくる要素の図解（NEW カード） */
export const horizonIntros: Record<string, { frame: RuleFrame; title: string }> = {
  inner: { frame: horizonRules[1], title: '内側の輪' },
  fuel: { frame: horizonRules[3], title: '燃料ぎりぎり' },
  binary: {
    title: '連星',
    frame: {
      caption: '二つのブラックホールが回り合う。重力の向きが刻々と変わる',
      draw: (g, t) => {
        const a = t * 1.2;
        hole(g, CX + Math.cos(a) * 22, CY + Math.sin(a) * 14, 6);
        hole(g, CX - Math.cos(a) * 22, CY - Math.sin(a) * 14, 6);
        const th = -t * 1.6;
        ship(g, CX + Math.cos(th) * 52, CY + Math.sin(th) * 36, th - Math.PI / 2);
      },
    },
  },
};
