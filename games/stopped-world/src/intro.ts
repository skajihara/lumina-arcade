/** ステージの最初に出す「新しい要素」の図解（RULE-01c） */
import { type RuleFrame, phase, seg, lerp, ease, glow, ring, line, label } from '@engine/rules';
import { box, egg, nest } from './rules';

const GOLD = '#ffd98a', ICE = '#7ff0ff', PINK = '#ffa3e0';

const bomb: RuleFrame = {
  caption: '止めている間に爆弾を叩くと、解放の瞬間に爆発する（点線の輪が届く範囲）',
  draw: (g, t) => {
    const p = phase(t, 3);
    const boom = p > 0.5;
    if (!boom) {
      g.save(); g.setLineDash([3, 4]); g.strokeStyle = PINK; g.globalAlpha = 0.6; g.beginPath(); g.arc(68, 62, 30, 0, Math.PI * 2); g.stroke(); g.restore();
      glow(g, 68, 62, 6, '#3a2a70');
      ring(g, 68, 62, 6, PINK, 1, 2);
      if (p > 0.2) label(g, 'カチッ', 68, 40, GOLD, 11, seg(p, 0.2, 0.3));
    } else {
      const k = ease(seg(p, 0.5, 0.9));
      ring(g, 68, 62, 6 + k * 34, PINK, 1 - k, 3);
      glow(g, 68, 62, 14 * (1 - k) + 2, GOLD, 1 - k);
    }
    const fly = boom ? ease(seg(p, 0.5, 1)) : 0;
    box(g, 40 - fly * 24, 66 - fly * 30, 14, '#c9a3ff', 1 - fly * 0.7);
    box(g, 96 + fly * 24, 66 - fly * 30, 14, '#c9a3ff', 1 - fly * 0.7);
    line(g, 6, 76, 130, 76, '#9fb8ff', 0.6, 1.5);
  },
};

const refill: RuleFrame = {
  caption: '箱が壊れる・爆弾が弾けるたびに、止められる時間が少し戻る',
  draw: (g, t) => {
    const p = phase(t, 3);
    // ゲージ（右上）
    const fill = 0.35 + 0.3 * seg(p, 0.55, 0.85);
    g.save(); g.strokeStyle = ICE; g.globalAlpha = 0.6; g.strokeRect(84, 10, 42, 7); g.fillStyle = ICE; g.globalAlpha = 0.85; g.fillRect(84, 10, 42 * fill, 7); g.restore();
    if (p < 0.3) box(g, 48, 64, 18, '#c9a3ff');
    else {
      const k = seg(p, 0.3, 0.85);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const x0 = 48 + Math.cos(a) * 10 * Math.min(1, k * 4), y0 = 64 + Math.sin(a) * 10 * Math.min(1, k * 4);
        glow(g, lerp(x0, 84 + 42 * fill, ease(k)), lerp(y0, 13, ease(k)), 2.2, ICE, 1 - k * 0.5);
      }
      if (p > 0.6) label(g, '+0.6秒', 104, 30, ICE, 11, seg(p, 0.6, 0.7));
    }
  },
};

const ball: RuleFrame = {
  caption: '光の玉はよく弾む。ぶつけて、届かない所の箱を落とす',
  draw: (g, t) => {
    const p = phase(t, 3);
    line(g, 70, 44, 128, 44, '#9fb8ff', 0.7, 2);
    const hit = p > 0.55;
    box(g, 100 + (hit ? ease(seg(p, 0.55, 1)) * 20 : 0), 36 + (hit ? ease(seg(p, 0.55, 1)) * 40 : 0), 14, '#c9a3ff', hit ? 1 - seg(p, 0.75, 1) : 1);
    const k = seg(p, 0, 0.55);
    const bx = lerp(14, 92, k), by = 80 - Math.sin(k * Math.PI) * 60;
    glow(g, hit ? 92 : bx, hit ? 36 + seg(p, 0.55, 1) * 40 : by, 4, ICE);
  },
};

const crack: RuleFrame = {
  caption: '卵はぶつけるとひびが入り（上の粒が×に）、3つで割れる。巣の中はやわらかい',
  draw: (g, t) => {
    const p = phase(t, 4);
    const n = p < 0.25 ? 0 : p < 0.5 ? 1 : p < 0.75 ? 2 : 3;
    egg(g, 50, 56, n >= 3 ? '#ff6b8a' : '#f6e7c4');
    for (let i = 0; i < 3; i++) {
      const x = 40 + i * 10;
      if (i < n) { line(g, x - 3, 33, x + 3, 39, '#ff6b8a', 1, 2); line(g, x + 3, 33, x - 3, 39, '#ff6b8a', 1, 2); }
      else glow(g, x, 36, 3, '#fff6e0');
    }
    for (let i = 0; i < Math.min(n, 2); i++) line(g, 48 + i * 3, 50 + i * 2, 52 + i * 3, 58 + i * 2, '#9a4a2a', 1, 1.5);
    if (n >= 3) label(g, '割れた', 50, 80, '#ff6b8a', 11);
    nest(g, 104, 70);
    egg(g, 104, 62, '#f6e7c4');
    label(g, 'ふかふか', 104, 86, GOLD, 10);
  },
};

export const stoppedIntros: Record<string, { title: string; frame: RuleFrame }> = {
  'sw-boom': { title: '止まった爆発', frame: bomb },
  'sw-fuse': { title: '壊すと時間が戻る', frame: refill },
  'sw-billiard': { title: '光の玉', frame: ball },
  'sw-shelf': { title: '卵のひびと、やわらかい巣', frame: crack },
};
