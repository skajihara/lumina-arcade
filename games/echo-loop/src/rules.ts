/** Echo Loop の図解ルール（タイトルとポーズ画面） */
import { type RuleFrame, phase, seg, lerp, glow, starShape, ring, label } from '@engine/rules';

const ECHO = '#7ff0ff', ME = '#ffffff', GOLD = '#ffd98a', VIOLET = '#c3a6ff';

/** 時計の弧：k（0..1）だけ進んだ */
function clock(g: CanvasRenderingContext2D, x: number, y: number, r: number, k: number, color: string): void {
  ring(g, x, y, r, 'rgba(140,150,220,.35)', 1, 3);
  g.save();
  g.strokeStyle = color;
  g.lineWidth = 3;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
  g.stroke();
  g.restore();
}

export function echoRules(loopSec: number, twist = 0): RuleFrame[] {
  const list: RuleFrame[] = [
    {
      caption: `${loopSec}秒たつと、時間が巻き戻る`,
      draw: (g, t) => {
        const p = phase(t, 3);
        const fwd = p < 0.75;
        const k = fwd ? p / 0.75 : 1 - seg(p, 0.75, 1);
        clock(g, 40, 48, 22, k, fwd ? VIOLET : ECHO);
        label(g, fwd ? `${Math.ceil(k * loopSec)}秒` : '⟲', 40, 48, fwd ? '#fff' : ECHO, fwd ? 11 : 18);
        // ボールの道
        const bx = lerp(80, 120, k), by = 70 - Math.sin(k * Math.PI) * 44;
        glow(g, bx, by, 3.5, fwd ? ME : ECHO);
        if (!fwd) label(g, '巻き戻し', 100, 86, ECHO, 10);
      },
    },
    {
      caption: 'さっきの自分は「残響」になり、同じ動きをくり返す',
      draw: (g, t) => {
        const p = phase(t, 2.6);
        const k = seg(p, 0, 0.9);
        // 残響（前のループ）は決まった弧、今の自分は別の弧
        const ex = lerp(20, 116, k), ey = 78 - Math.sin(k * Math.PI) * 56;
        for (let i = 1; i <= 6; i++) {
          const kk = Math.max(0, k - i * 0.03);
          glow(g, lerp(20, 116, kk), 78 - Math.sin(kk * Math.PI) * 56, 2, ECHO, 0.25 - i * 0.03);
        }
        glow(g, ex, ey, 3.5, ECHO, 0.8);
        label(g, '残響', ex, ey - 12, ECHO, 9, 0.9);
        const mx = lerp(116, 30, k), my = 80 - Math.sin(k * Math.PI) * 30;
        glow(g, mx, my, 3.5, ME);
        label(g, 'いまの自分', mx, my + 12, '#fff', 9);
      },
    },
    {
      caption: `何人もの自分で、同じ${loopSec}秒のうちに全部の星を燃やす`,
      draw: (g, t) => {
        const p = phase(t, 2.6);
        const targets = [[30, 30], [68, 22], [106, 30]];
        const cols = [ECHO, VIOLET, ME];
        targets.forEach(([x, y], i) => {
          const k = seg(p, 0, 0.5);
          const bx = lerp(30 + i * 38, x, k), by = lerp(88, y, k);
          if (k < 1) glow(g, bx, by, 3, cols[i], i < 2 ? 0.75 : 1);
          const b = seg(p, 0.5, 0.8);
          if (b <= 0) starShape(g, x, y, 8, GOLD);
          else { ring(g, x, y, 3 + b * 16, GOLD, 1 - b, 2.5); glow(g, x, y, 6 * (1 - b), '#fff', 1 - b); }
        });
        label(g, 'CLEAR', 68, 60, GOLD, 16, seg(p, 0.7, 0.8));
      },
    },
    {
      caption: '残響と<b style="color:#c3a6ff">同時に</b>同じ星を打つと「共鳴」して大爆発',
      draw: (g, t) => {
        const p = phase(t, 2.4);
        const k = seg(p, 0, 0.45);
        glow(g, lerp(18, 64, k), lerp(84, 44, k), 3.5, ECHO, 0.85);
        glow(g, lerp(118, 72, k), lerp(84, 44, k), 3.5, ME);
        const b = seg(p, 0.45, 0.9);
        if (b <= 0) starShape(g, 68, 40, 9, GOLD);
        else {
          ring(g, 68, 40, 4 + b * 34, VIOLET, 1 - b, 3);
          ring(g, 68, 40, 2 + b * 22, ECHO, 1 - b, 2);
          glow(g, 68, 40, 10 * (1 - b), '#fff', 1 - b);
          label(g, '共鳴！', 68, 84, VIOLET, 12, 1 - seg(p, 0.8, 1));
        }
      },
    },
  ];
  if (Math.round(twist) === 1) list.push(shrinkFrame);
  return list;
}

/** EL-09：ひねり「縮む時間」の図解。残響が増えるほどループが短くなり、共鳴で取り戻す */
export const shrinkFrame: RuleFrame = {
  caption: '残響が1人増えるごとに、ループは<b style="color:#ff9fc8">1秒短く</b>なる。<b style="color:#c3a6ff">共鳴</b>で取り戻せる',
  draw: (g, t) => {
    const p = phase(t, 4.2);
    const x0 = 14, x1 = 122, y = 30;
    // 3本の帯：1ループ目・2ループ目・3ループ目（だんだん短い）。最後に共鳴で少し伸びる
    for (let i = 0; i < 3; i++) {
      const yy = y + i * 18;
      const lost = i * 0.12;
      const grow = i === 2 ? seg(p, 0.6, 0.8) * 0.08 : 0;
      const len = 1 - lost + grow;
      g.save(); g.lineCap = 'round';
      g.strokeStyle = 'rgba(60,50,110,.9)'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(x0, yy); g.lineTo(x1, yy); g.stroke();
      if (lost > 0) { g.strokeStyle = 'rgba(160,50,100,.9)'; g.beginPath(); g.moveTo(lerp(x0, x1, len), yy); g.lineTo(x1, yy); g.stroke(); }
      g.strokeStyle = i === 0 ? VIOLET : i === 1 ? ECHO : ME; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x0, yy); g.lineTo(lerp(x0, x1, len * Math.min(1, seg(p, i * 0.15, i * 0.15 + 0.3) + (i < 2 ? 0 : 0))), yy); g.stroke();
      g.restore();
      label(g, `${i + 1}`, x0 - 7, yy, 'rgba(255,255,255,.6)', 9);
    }
    const r = seg(p, 0.6, 0.85);
    if (r > 0) { ring(g, lerp(x0, x1, 0.76 + r * 0.08), y + 36, 3 + r * 12, VIOLET, 1 - r, 2); label(g, '共鳴 ＋1秒', 98, 86, VIOLET, 10, 1 - seg(p, 0.9, 1)); }
  },
};

/** EL-12：時計の針の NEW カード */
export const handFrame: RuleFrame = {
  caption: '時計の針は1ループで1周。毎ループ同じ時刻に同じ所にいて、ボールを弾く',
  draw: (g, t) => {
    const p = phase(t, 4);
    const cx = 68, cy = 50, len = 30;
    const a = -Math.PI / 2 + p * Math.PI * 2;
    ring(g, cx, cy, len + 6, 'rgba(127,240,255,.25)', 1, 1);
    g.save(); g.strokeStyle = ECHO; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); g.stroke(); g.restore();
    glow(g, cx, cy, 4, ECHO);
    // 針に弾かれるボール（3時のあたりで）
    const k = seg(p, 0.15, 0.25), k2 = seg(p, 0.25, 0.6);
    const bx = p < 0.25 ? lerp(120, cx + len * 0.8, k) : lerp(cx + len * 0.8, 112, k2);
    const by = p < 0.25 ? lerp(10, cy, k) : lerp(cy, 92, k2) - Math.sin(k2 * Math.PI) * 30;
    glow(g, bx, by, 3.5, ME);
    if (p > 0.24 && p < 0.34) label(g, 'カン', cx + len, cy - 14, GOLD, 11, seg(p, 0.24, 0.27));
    starShape(g, 112, 86, 6, GOLD);
  },
};
