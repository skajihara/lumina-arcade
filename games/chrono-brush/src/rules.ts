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

/** NEW-01d：ステージの最初に出す「NEW」カード（その面で初めて出てくる要素） */
const voidHole = (g: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  g.save(); g.fillStyle = '#05030c'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.restore();
  ring(g, x, y, r, '#8a5acd', 0.8, 2);
};
export const chronoIntros: Record<string, { title: string; frame: RuleFrame }> = {
  虚空: {
    title: '虚空',
    frame: {
      caption: '黒い虚空に触れた星は消える。遅らせて風でよけるか、赤で手前に落とせ',
      draw: (g, t) => {
        const p = phase(t, 3);
        voidHole(g, 64, 46, 14);
        // 何もしない星は飲まれる／青で遅らせた星は風で右へよける
        const k = seg(p, 0, 0.45);
        glow(g, lerp(50, 60, k), lerp(6, 44, k), 3, STAR, k < 1 ? 1 : 0);
        zone(g, 40, 30, 14, BLUE);
        const k2 = seg(p, 0.3, 1);
        const x = k2 < 0.5 ? lerp(34, 60, k2 * 2) : lerp(60, 108, (k2 - 0.5) * 2);
        const y = k2 < 0.5 ? lerp(10, 26, k2 * 2) : lerp(26, 78, (k2 - 0.5) * 2);
        glow(g, x, y, 3, k2 < 0.5 ? BLUE : STAR, k2 > 0 ? 1 : 0);
        basket(g, 108, 82);
        label(g, '風 →', 96, 18, '#8f96c9', 9);
      },
    },
  },
  逆風: {
    title: '逆風',
    frame: {
      caption: 'この面の風は左へ吹く。右で生まれた星を青で浮かせ、左の籠まで運ばせろ',
      draw: (g, t) => {
        const p = phase(t, 3);
        label(g, '← 風', 92, 18, '#8f96c9', 9);
        zone(g, 96, 40, 16, BLUE);
        const k = seg(p, 0, 0.9);
        glow(g, lerp(110, 30, k), lerp(8, 78, k * k * 0.6 + k * 0.4), 3, k > 0.2 && k < 0.6 ? BLUE : STAR);
        basket(g, 30, 82);
      },
    },
  },
  逆再生: {
    title: '逆再生で回り込む',
    frame: {
      caption: '紫（Shift＋ドラッグ）の中では星が来た道を上へ戻る。戻っている間も風は吹くので、横へずれて落ち直す',
      draw: (g, t) => {
        const p = phase(t, 3.4);
        voidHole(g, 60, 52, 12);
        zone(g, 52, 28, 14, VIOLET);
        const k = seg(p, 0, 1);
        // 下りる → 紫で上へ戻りながら右へ → 虚空の右を落ちる
        const x = k < 0.3 ? 46 : k < 0.6 ? lerp(46, 76, (k - 0.3) / 0.3) : 76 + (k - 0.6) * 20;
        const y = k < 0.3 ? lerp(6, 30, k / 0.3) : k < 0.6 ? lerp(30, 16, (k - 0.3) / 0.3) : lerp(16, 80, (k - 0.6) / 0.4);
        glow(g, x, y, 3, k > 0.3 && k < 0.6 ? VIOLET : STAR);
        if (k > 0.3 && k < 0.6) label(g, '⟲', 30, 20, VIOLET, 12);
        basket(g, 84, 84);
      },
    },
  },
  風見: {
    title: '向きを変える風',
    frame: {
      caption: '風は5秒ごとに向きを変える。画面の上の矢印が今の風（変わる前は点滅）。籠の側へ吹く時に星を遅らせよう',
      draw: (g, t) => {
        const p = phase(t, 4);
        const right = p < 0.5;
        label(g, right ? '風 →' : '← 風', 56, 16, GOLD, 11);
        zone(g, right ? 36 : 100, 42, 15, BLUE);
        const k = seg(p % 0.5, 0, 0.45);
        glow(g, right ? lerp(30, 66, k) : lerp(106, 70, k), lerp(10, 78, k), 3, STAR);
        basket(g, 68, 84);
      },
    },
  },
  二つの籠: {
    title: '二つの籠',
    frame: {
      caption: '籠が二つ、反対向きに揺れる。どちらに入れても1つ。近い方へ導こう',
      draw: (g, t) => {
        const p = phase(t, 3);
        const s = Math.sin(p * Math.PI * 2);
        basket(g, 40 + s * 16, 82);
        basket(g, 96 - s * 16, 82);
        voidHole(g, 68, 40, 9);
        const k = seg(p, 0, 0.8);
        glow(g, lerp(30, 40 + Math.sin(0.8 * Math.PI * 2) * 16, k), lerp(6, 78, k), 3, STAR, k < 1 ? 1 : 0);
        glow(g, lerp(110, 96 - Math.sin(0.8 * Math.PI * 2) * 16, k), lerp(6, 78, k), 3, STAR, k < 1 ? 1 : 0);
      },
    },
  },
};
