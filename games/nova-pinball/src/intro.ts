/**
 * ステージの最初に出す「新しい要素」の図解（RULE-01c）。そのステージで初めて出てくるものだけ。
 */
import { type RuleFrame, phase, seg, lerp, ease, glow, starShape, ring, line, arrow, label } from '@engine/rules';
import { novaRules } from './rules';

const BLUE = '#9fd0ff', GOLD = '#ffd98a', CYAN = '#7ff0ff';

const gravity: RuleFrame = {
  caption: '星はいつもボールを引く。灯った星ほど重く、強く引く',
  draw: (g, t) => {
    const p = phase(t, 3);
    for (let i = 0; i < 3; i++) { const r = 8 + ((t * 16 + i * 10) % 30); ring(g, 74, 46, r, '#dfe6ff', 0.3 * (1 - r / 38), 1); }
    starShape(g, 74, 46, 9, p > 0.5 ? GOLD : '#dfe6ff');
    // ボールが星の周りで曲がる
    const k = ease(seg(p, 0, 0.9));
    const a = lerp(Math.PI * 0.95, -Math.PI * 0.35, k);
    const r = lerp(46, 22, Math.sin(k * Math.PI));
    const bx = 74 + Math.cos(a) * r, by = 46 + Math.sin(a) * r * 0.8;
    for (let j = 1; j < 8; j++) {
      const kk = Math.max(0, k - j * 0.04), aa = lerp(Math.PI * 0.95, -Math.PI * 0.35, kk), rr = lerp(46, 22, Math.sin(kk * Math.PI));
      glow(g, 74 + Math.cos(aa) * rr, 46 + Math.sin(aa) * rr * 0.8, 1.6, '#ffffff', 0.5 - j * 0.06);
    }
    glow(g, bx, by, 3.5, '#ffffff');
  },
};

const rollover: RuleFrame = {
  caption: '上の3つの輪を全部くぐると、ボールセーブとキックバックが点く',
  draw: (g, t) => {
    const p = phase(t, 3.2);
    const xs = [44, 68, 92];
    xs.forEach((x, i) => {
      const lit = p > 0.2 + i * 0.22;
      ring(g, x, 30, 8, lit ? GOLD : BLUE, lit ? 1 : 0.4, 1.5);
      if (lit) glow(g, x, 30, 5, GOLD, 0.8);
    });
    const k = seg(p, 0.1, 0.8);
    const bx = lerp(30, 106, k), by = 30 + Math.sin(k * Math.PI * 3) * 6;
    if (p < 0.85) glow(g, bx, by, 3.2, '#ffffff');
    if (p > 0.82) { label(g, 'SAVE', 68, 66, CYAN, 12, seg(p, 0.82, 0.9)); arrow(g, 22, 86, 22, 64, CYAN, seg(p, 0.85, 0.95)); arrow(g, 114, 86, 114, 64, CYAN, seg(p, 0.85, 0.95)); }
  },
};

const loose: RuleFrame = {
  caption: '漂う星：当てると動く。ほかの星へ寄せてから燃やそう',
  draw: (g, t) => {
    const p = phase(t, 3);
    const hit = p > 0.3;
    const sx = hit ? lerp(56, 92, ease(seg(p, 0.3, 0.8))) : 56;
    starShape(g, 104, 40, 8, '#dfe6ff', 0.8);
    starShape(g, sx, 46, 7, hit ? GOLD : '#dfe6ff');
    if (hit) for (let j = 1; j < 5; j++) glow(g, sx - j * 5, 46, 2, GOLD, 0.4 - j * 0.07);
    const bx = hit ? lerp(50, 30, seg(p, 0.3, 0.7)) : lerp(20, 50, seg(p, 0, 0.3)), by = hit ? lerp(50, 80, seg(p, 0.3, 0.7)) : lerp(84, 50, seg(p, 0, 0.3));
    glow(g, bx, by, 3.2, '#ffffff');
    if (p > 0.82) ring(g, 98, 43, 6 + seg(p, 0.82, 1) * 16, GOLD, 1 - seg(p, 0.82, 1), 2);
  },
};

const kickback: RuleFrame = {
  caption: '両脇の溝（アウトレーン）に落ちても、矢印が光っていればキックバックが打ち返す',
  draw: (g, t) => {
    const p = phase(t, 3);
    line(g, 14, 20, 14, 92, BLUE, 0.6, 1.5);
    line(g, 28, 20, 28, 76, BLUE, 0.6, 1.5);
    line(g, 28, 76, 60, 92, BLUE, 0.6, 2);
    const on = p < 0.55;
    for (let k = 0; k < 3; k++) arrow(g, 21, 88 - k * 7, 21, 82 - k * 7, on ? CYAN : '#5a6090', on ? 0.9 - k * 0.2 : 0.3, 1.5);
    const y = p < 0.45 ? lerp(24, 84, ease(seg(p, 0, 0.45))) : lerp(84, 10, ease(seg(p, 0.45, 0.75)));
    glow(g, 21, y, 3.2, '#ffffff');
    if (p > 0.45 && p < 0.6) glow(g, 21, 86, 8, CYAN, 1 - seg(p, 0.45, 0.6));
    label(g, on ? 'KICKBACK' : '消えた（輪で点け直す）', 84, 40, on ? CYAN : '#8f96c9', 10);
  },
};

const endless: RuleFrame = {
  caption: '星座が次々に現れる。2波ごとに＋1ボール、3波目からは毎波アイテムが1つ（1回きり）。どこまで行けるか',
  draw: (g, t) => {
    const p = phase(t, 3);
    for (let w = 0; w < 3; w++) {
      const a = seg(p, w * 0.25, w * 0.25 + 0.2);
      const x = 30 + w * 38;
      starShape(g, x, 36, 7, '#dfe6ff', a);
      starShape(g, x + 10, 58, 6, '#dfe6ff', a);
      line(g, x, 36, x + 10, 58, BLUE, a * 0.6);
      label(g, `WAVE ${w + 1}`, x + 5, 80, GOLD, 9, a);
    }
  },
};

const split: RuleFrame = {
  caption: '金の粒（分裂）に触れると、ボールが2つに分かれる。しばらくすると、また現れる',
  draw: (g, t) => {
    const p = phase(t, 2.6);
    ring(g, 68, 50, 9, GOLD, p < 0.4 ? 1 : 0.3, 1.5);
    if (p < 0.4) glow(g, lerp(20, 68, seg(p, 0, 0.4)), lerp(86, 50, seg(p, 0, 0.4)), 3.5, '#ffffff');
    else {
      const k = ease(seg(p, 0.4, 1));
      glow(g, 68 - k * 40, 50 - k * 34, 3.5, '#ffffff');
      glow(g, 68 + k * 40, 50 - k * 34, 3.5, '#ffffff');
      if (p < 0.6) glow(g, 68, 50, 12 * (1 - seg(p, 0.4, 0.6)), GOLD);
    }
  },
};

const hole: RuleFrame = {
  caption: 'ブラックホールに触れると、3秒のあいだ、まわりのボールを強く引き寄せる',
  draw: (g, t) => {
    const p = phase(t, 3);
    const on = p > 0.3;
    glow(g, 68, 48, on ? 16 : 8, '#c9a3ff', on ? 0.6 : 0.3);
    g.save(); g.fillStyle = '#000'; g.beginPath(); g.arc(68, 48, 6, 0, Math.PI * 2); g.fill(); g.restore();
    if (on) for (let i = 0; i < 3; i++) { const r = 30 - ((t * 30 + i * 10) % 30); ring(g, 68, 48, r + 6, '#e6d6ff', 0.4 * (r / 30), 1); }
    const k = seg(p, 0.3, 1);
    const a = -Math.PI * 0.2 + k * Math.PI * 2.2, r = lerp(40, 9, ease(k));
    glow(g, on ? 68 + Math.cos(a) * r : 20, on ? 48 + Math.sin(a) * r * 0.8 : 80, 3.2, '#ffffff');
  },
};

const warp: RuleFrame = {
  caption: 'ワームホールに入ると、点線の先の出口から同じ速さで飛び出す',
  draw: (g, t) => {
    const p = phase(t, 2.6);
    for (let i = 0; i < 3; i++) { const r = 10 * (1 - ((t * 0.8 + i / 3) % 1)); ring(g, 100, 70, r, CYAN, 0.7 * (r / 10), 1.5); }
    ring(g, 28, 22, 7, CYAN, 0.6, 1.5);
    line(g, 100, 70, 28, 22, CYAN, 0.35, 1, [2, 4]);
    if (p < 0.45) glow(g, lerp(60, 100, seg(p, 0, 0.45)), lerp(90, 70, seg(p, 0, 0.45)), 3.2, '#ffffff');
    else { const k = seg(p, 0.45, 1); glow(g, 28 + k * 30, 22 + k * 20, 3.2, '#ffffff'); if (p < 0.6) glow(g, 28, 22, 10, CYAN, 1 - seg(p, 0.45, 0.6)); }
  },
};

const comet: RuleFrame = {
  caption: '彗星に触れると、2.5秒のあいだ星をすり抜け、触れた星すべてに1つずつ灯す',
  draw: (g, t) => {
    const p = phase(t, 2.8);
    const stars = [[44, 30], [68, 44], [92, 58], [116, 72]];
    const k = seg(p, 0.15, 0.85);
    const bx = lerp(20, 128, k), by = lerp(16, 80, k);
    stars.forEach(([x, y]) => {
      const lit = bx > x;
      glow(g, x, y, lit ? 9 : 5, lit ? GOLD : '#7fa8ff', lit ? 0.8 : 0.4);
      ring(g, x, y, 6, lit ? GOLD : '#7fa8ff', 0.8, 1.5);
    });
    for (let i = 1; i <= 6; i++) glow(g, bx - i * 5, by - i * 3, 4 - i * 0.5, GOLD, 0.5 - i * 0.07);
    glow(g, bx, by, 4, '#fff3d6');
  },
};

const magnet: RuleFrame = {
  caption: '磁石に触れると、3秒のあいだ、ボールが灯った星へ引き寄せられる',
  draw: (g, t) => {
    const p = phase(t, 3);
    glow(g, 100, 30, 9, GOLD, 0.8);
    ring(g, 100, 30, 7, GOLD, 0.9, 1.5);
    const on = p > 0.3;
    const k = ease(seg(p, 0.3, 0.9));
    const bx = on ? lerp(36, 98, k) : lerp(20, 36, seg(p, 0, 0.3)), by = on ? lerp(80, 34, k) + Math.sin(k * Math.PI) * 14 : 84;
    if (on && p < 0.9) for (let i = 0; i < 8; i++) { const f = (i / 8 + t) % 1; glow(g, lerp(bx, 100, f), lerp(by, 30, f), 1.5, i % 2 ? '#ff8fb0' : CYAN, 0.7); }
    glow(g, bx, by, 3.5, '#ffffff');
    label(g, 'U', 36, 64, '#ff8fb0', 14, on ? 0.4 : 1);
  },
};

/** 回る星（NP-13b）：内の輪と外の輪が逆向きに回る */
const orbit: RuleFrame = {
  caption: '星が回っている。内の輪と外の輪は逆向き。狙う星が来る瞬間を待って打つ',
  draw: (g, t) => {
    const cx = 70, cy = 46;
    ring(g, cx, cy, 18, BLUE, 0.25, 1);
    ring(g, cx, cy, 34, BLUE, 0.2, 1);
    glow(g, cx, cy, 6, '#c9a3ff', 0.8);
    for (let k = 0; k < 6; k++) { const a = t * 1.4 + (k * Math.PI) / 3; starShape(g, cx + Math.cos(a) * 18, cy + Math.sin(a) * 18, 5, '#dfe6ff'); }
    for (let k = 0; k < 4; k++) { const a = -t * 0.9 + Math.PI / 4 + (k * Math.PI) / 2; starShape(g, cx + Math.cos(a) * 34, cy + Math.sin(a) * 34, 5, GOLD); }
  },
};

export const novaIntros: Record<string, { title: string; frame: RuleFrame }> = {
  arc: { title: '星の引力', frame: gravity },
  corona: { title: 'ロールオーバー', frame: rollover },
  spiral: { title: '線を走る火', frame: novaRules[2] },
  drift: { title: '漂う星', frame: loose },
  gemini: { title: '分裂', frame: split },
  scorpius: { title: 'ブラックホール', frame: hole },
  vault: { title: 'ワームホール', frame: warp },
  orbit: { title: '回る星', frame: orbit },
  orion: { title: 'ワームホール', frame: warp },
  lyra: { title: '彗星', frame: comet },
  leo: { title: '磁石', frame: magnet },
  cygnus: { title: 'アウトレーンとキックバック', frame: kickback },
  dipper: { title: 'キックバックが消えている', frame: kickback },
  endless: { title: 'エンドレス', frame: endless },
};
