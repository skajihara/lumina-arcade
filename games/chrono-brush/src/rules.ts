/** 時空の絵筆の図解ルール（タイトルとポーズ画面）。NEW-01c */
import { type RuleFrame, phase, seg, lerp, glow, ring, label, line } from '@engine/rules';

const BLUE = '#9fc0ff', RED = '#ffb3b3', VIOLET = '#d9b3ff', GOLD = '#ffd98a', STAR = '#fff3d6';

/** 籠（下の台形） */
function basket(g: CanvasRenderingContext2D, x: number, y: number): void {
  line(g, x - 16, y - 8, x - 11, y + 4, GOLD, 0.9, 2);
  line(g, x - 11, y + 4, x + 11, y + 4, GOLD, 0.9, 2);
  line(g, x + 11, y + 4, x + 16, y - 8, GOLD, 0.9, 2);
}
/** 塗った時間の円 */
function zone(g: CanvasRenderingContext2D, x: number, y: number, r: number, c: string, a = 1): void {
  g.save(); g.globalAlpha = 0.18 * a; g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.restore();
  ring(g, x, y, r, c, 0.6 * a, 1.5);
}

export const chronoRules: RuleFrame[] = [
  {
    caption: '星は空から降り、風で斜めに流れる。籠に入れば捕まえた',
    draw: (g, t) => {
      const p = phase(t, 2.6);
      const k = seg(p, 0, 0.8);
      glow(g, lerp(40, 92, k), lerp(8, 76, k), 3.5, STAR, p < 0.85 ? 1 : 0);
      label(g, '風 →', 30, 30, '#8f96c9', 9);
      basket(g, 96, 80);
      if (p > 0.8) label(g, '+1', 96, 60, GOLD, 11, seg(p, 0.8, 0.86));
    },
  },
  {
    caption: 'ドラッグで青＝遅い時間。中の星はふわりと浮き、そのぶん風に運ばれる',
    draw: (g, t) => {
      const p = phase(t, 3);
      zone(g, 54, 44, 20, BLUE);
      const k = seg(p, 0, 0.9);
      // 円の中ではゆっくり、風で右へ
      const x = k < 0.3 ? lerp(40, 46, k / 0.3) : k < 0.7 ? lerp(46, 80, (k - 0.3) / 0.4) : lerp(80, 104, (k - 0.7) / 0.3);
      const y = k < 0.3 ? lerp(8, 34, k / 0.3) : k < 0.7 ? lerp(34, 46, (k - 0.3) / 0.4) : lerp(46, 76, (k - 0.7) / 0.3);
      glow(g, x, y, 3.5, k > 0.3 && k < 0.7 ? BLUE : STAR);
      basket(g, 104, 80);
    },
  },
  {
    caption: '右ドラッグで赤＝速い時間（すぐ落ちる）。Shift＋ドラッグで紫＝逆再生（来た道を戻る）',
    draw: (g, t) => {
      const p = phase(t, 3);
      zone(g, 38, 40, 16, RED);
      zone(g, 100, 40, 16, VIOLET);
      const k = seg(p, 0, 0.6);
      glow(g, 38, lerp(8, 84, k * k), 3, k > 0.3 ? RED : STAR);
      const k2 = seg(p, 0.1, 0.9);
      const back = k2 > 0.5;
      glow(g, 100, back ? lerp(40, 14, (k2 - 0.5) * 2) : lerp(10, 40, k2 * 2), 3, back ? VIOLET : STAR);
      if (back) label(g, '⟲', 118, 22, VIOLET, 12);
    },
  },
  {
    caption: 'インクは限られている。黒い虚空は星を飲む。必要な数を籠へ入れればクリア',
    draw: (g, t) => {
      const p = phase(t, 3);
      g.save(); g.fillStyle = '#05030c'; g.beginPath(); g.arc(60, 42, 14, 0, Math.PI * 2); g.fill(); g.restore();
      ring(g, 60, 42, 14, '#8a5acd', 0.8, 2);
      const k = seg(p, 0, 0.5);
      glow(g, 60, lerp(6, 42, k), 3, STAR, k < 1 ? 1 : 0);
      label(g, 'インク ●●●○○', 34, 84, BLUE, 9);
      basket(g, 112, 80);
    },
  },
];
