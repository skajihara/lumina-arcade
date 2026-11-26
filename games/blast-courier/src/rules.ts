/** Blast Courier の図解ルール（タイトルとポーズ画面）。NEW-06 */
import { type RuleFrame, phase, seg, lerp, glow, ring, label, line } from '@engine/rules';

const EGG = '#ffe7b0', GOLD = '#ffd98a', RED = '#ff8f8f', BLUE = '#9fc0ff', VIOLET = '#d9b3ff', LAND = '#6f78c9';

function egg(g: CanvasRenderingContext2D, x: number, y: number, cracks = 0): void {
  glow(g, x, y, 4, EGG);
  g.save(); g.strokeStyle = '#fff6dc'; g.lineWidth = 1.4; g.beginPath(); g.ellipse(x, y, 4, 5.2, 0, 0, Math.PI * 2); g.stroke(); g.restore();
  for (let i = 0; i < cracks; i++) line(g, x - 2 + i * 2, y - 3, x + i, y + 1, RED, 0.9, 1);
}
function nest(g: CanvasRenderingContext2D, x: number, y: number): void {
  g.save(); g.strokeStyle = GOLD; g.lineWidth = 2; g.beginPath(); g.arc(x, y - 6, 9, Math.PI * 0.15, Math.PI * 0.85); g.stroke(); g.restore();
}

export const blastRules: RuleFrame[] = [
  {
    caption: '押さえてドラッグで向き、押す長さで強さ。放すと卵の後ろで爆風が弾ける。強すぎるとひびが入る',
    draw: (g, t) => {
      const p = phase(t, 2.8);
      line(g, 6, 70, 56, 70, LAND, 0.9, 2);
      line(g, 86, 74, 132, 74, LAND, 0.9, 2);
      nest(g, 112, 74);
      const k = seg(p, 0.25, 0.9);
      if (p > 0.2 && p < 0.4) ring(g, 24, 70, seg(p, 0.2, 0.4) * 22, GOLD, 1 - seg(p, 0.2, 0.4), 2);
      const x = p < 0.25 ? 32 : lerp(32, 112, k);
      const y = p < 0.25 ? 64 : 64 - Math.sin(k * Math.PI) * 40 + k * 4;
      egg(g, x, y);
      if (p < 0.22) glow(g, 24, 70, 2.5, GOLD, 0.8);
    },
  },
  {
    caption: '2＝吸う（その場へ引き寄せる）。3＝昇る（上昇気流の柱）。空中で構えると時間がゆっくり — てっぺんで横へ',
    draw: (g, t) => {
      const p = phase(t, 3.2);
      line(g, 6, 84, 60, 84, LAND, 0.9, 2);
      line(g, 84, 34, 132, 34, LAND, 0.9, 2);
      nest(g, 112, 34);
      // 上昇気流の柱
      const lift = p < 0.55;
      if (lift) for (let i = 0; i < 4; i++) line(g, 26 + i * 3, 82 - ((t * 60 + i * 13) % 60), 26 + i * 3, 76 - ((t * 60 + i * 13) % 60), BLUE, 0.6, 1.5);
      const k = seg(p, 0, 0.5), k2 = seg(p, 0.55, 0.95);
      const x = p < 0.55 ? 30 : lerp(30, 112, k2);
      const y = p < 0.55 ? lerp(78, 18, k) : lerp(18, 28, k2);
      egg(g, x, y);
      if (p > 0.52 && p < 0.65) ring(g, 24, 18, seg(p, 0.52, 0.65) * 16, GOLD, 1 - seg(p, 0.52, 0.65), 2);
      label(g, '3 昇る', 8, 18, BLUE, 9);
    },
  },
  {
    caption: '4＝遅れ：1 秒後に強く弾ける。先に置いて、転がってくる卵が通る時に合わせる',
    draw: (g, t) => {
      const p = phase(t, 3);
      line(g, 6, 72, 130, 72, LAND, 0.9, 2);
      const fuse = seg(p, 0, 0.5);
      if (p < 0.5) {
        ring(g, 70, 72, 7, VIOLET, 0.9, 1.5);
        g.save(); g.strokeStyle = VIOLET; g.lineWidth = 2.5; g.beginPath(); g.arc(70, 72, 10, -Math.PI / 2, -Math.PI / 2 + fuse * Math.PI * 2); g.stroke(); g.restore();
      } else if (p < 0.65) ring(g, 70, 72, seg(p, 0.5, 0.65) * 26, VIOLET, 1 - seg(p, 0.5, 0.65), 2.5);
      const x = p < 0.5 ? lerp(20, 66, fuse) : lerp(66, 128, seg(p, 0.5, 1));
      const y = p < 0.5 ? 66 : 66 - Math.sin(seg(p, 0.5, 1) * Math.PI) * 44;
      egg(g, x, y);
      label(g, '4 遅れ', 8, 18, VIOLET, 9);
    },
  },
  {
    caption: '強くぶつけるとひび（3つで割れる）。雲は卵を受け止める。巣で止まればクリア。爆風が少ないほど★',
    draw: (g, t) => {
      const p = phase(t, 3);
      g.save(); g.fillStyle = 'rgba(220,230,255,.22)'; g.beginPath(); g.ellipse(60, 56, 26, 9, 0, 0, Math.PI * 2); g.fill(); g.restore();
      const k = seg(p, 0, 0.6);
      egg(g, 60, lerp(8, 50, Math.min(1, k * 1.2)));
      label(g, '★★★', 96, 20, GOLD, 11);
      label(g, '爆風 3', 96, 36, GOLD, 9);
    },
  },
];

/** NEW-07：その面で初めて出てくる要素の「NEW」カード */
export const blastIntros: Record<string, { title: string; frame: RuleFrame }> = {
  'bc-2': { title: '雲', frame: blastRules[3] },
  'bc-3': {
    title: '吸う（2）',
    frame: {
      caption: '2（またはボタン・ホイール）で吸う。その場へ卵を引き寄せる。ひびは入らないので、崖の上へそっと運べる',
      draw: (g, t) => {
        const p = phase(t, 2.6);
        line(g, 6, 80, 60, 80, LAND, 0.9, 2);
        line(g, 74, 44, 132, 44, LAND, 0.9, 2);
        const k = seg(p, 0.15, 0.8);
        if (p > 0.1 && p < 0.4) ring(g, 96, 30, (1 - seg(p, 0.1, 0.4)) * 26, '#9fe0ff', 0.8, 2);
        glow(g, 96, 30, 2.5, '#9fe0ff', p < 0.5 ? 1 : 0.3);
        egg(g, lerp(40, 94, k), lerp(74, 36, k) + Math.sin(k * Math.PI) * -8);
      },
    },
  },
  'bc-4': { title: '昇る（3）', frame: blastRules[1] },
  'bc-5': { title: '遅れ（4）', frame: blastRules[2] },
  'bc-6': {
    title: '渡し舟の島',
    frame: {
      caption: '小さな島が谷を行き来する。島が来た時に、そっと飛び乗ろう',
      draw: (g, t) => {
        const x = 64 + Math.sin(t * 1.2) * 30;
        line(g, 4, 60, 28, 60, LAND, 0.9, 2);
        line(g, 108, 60, 132, 60, LAND, 0.9, 2);
        line(g, x - 10, 66, x + 10, 66, '#bff0dc', 0.95, 2.5);
        egg(g, x, 60);
        label(g, '⇆', x - 4, 82, LAND, 10);
      },
    },
  },
  'bc-7': {
    title: '棘',
    frame: {
      caption: '光る棘に触れると、卵は一度で割れる。高い弧で越えよう',
      draw: (g, t) => {
        const p = phase(t, 2.6);
        g.save(); g.fillStyle = 'rgba(80,20,60,.9)'; g.strokeStyle = '#ff7aa8'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(54, 94); g.lineTo(68, 50); g.lineTo(82, 94); g.closePath(); g.fill(); g.stroke(); g.restore();
        line(g, 4, 70, 40, 70, LAND, 0.9, 2);
        line(g, 96, 70, 132, 70, LAND, 0.9, 2);
        const k = seg(p, 0.1, 0.9);
        egg(g, lerp(24, 112, k), 64 - Math.sin(k * Math.PI) * 46);
      },
    },
  },
};
