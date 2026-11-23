/**
 * ステージ定義（座標はメートル。盤面は幅15×高さ25、プレイ領域は x:0.6〜13.2）
 * 星の配置と星座の線（links）だけでステージが作れる。
 */
export interface StarDef {
  x: number;
  y: number;
  r?: number;
  /** 固定されていない（爆風で漂う）星 */
  loose?: boolean;
  /** 初期チャージ */
  charge?: number;
}

export interface BumperDef {
  x: number;
  y: number;
  r: number;
}

import type { BoardOpts } from './sim';

export interface StageDef extends BoardOpts {
  id: string;
  name: string;
  hint: string;
  stars: StarDef[];
  /** 星座の線（星のインデックスの組）。両端が同じ連鎖で爆発すると灯る */
  links: [number, number][];
  bumpers?: BumperDef[];
  /** エンドレス（星が尽きると次の波が来る。ボールが尽きるまで続くスコアアタック） */
  endless?: { seed: number };
  /** 盤面の色合い（0..1 の色相） */
  hue?: number;
}

function arc(cx: number, cy: number, rad: number, from: number, to: number, n: number, r = 0.55): StarDef[] {
  const out: StarDef[] = [];
  for (let i = 0; i < n; i++) {
    const a = from + ((to - from) * i) / (n - 1);
    out.push({ x: +(cx + rad * Math.cos(a)).toFixed(3), y: +(cy + rad * Math.sin(a)).toFixed(3), r });
  }
  return out;
}

function chainLinks(start: number, n: number): [number, number][] {
  const l: [number, number][] = [];
  for (let i = start; i < start + n - 1; i++) l.push([i, i + 1]);
  return l;
}

function spiral(): StarDef[] {
  const out: StarDef[] = [];
  for (let i = 0; i < 11; i++) {
    const th = 0.6 + i * 0.78;
    const rr = 0.6 + 0.42 * th;
    out.push({ x: +(6.9 + rr * Math.cos(th)).toFixed(3), y: +(8.6 + rr * Math.sin(th) * 0.95).toFixed(3), r: 0.5 });
  }
  return out;
}

function milkyWay(): StarDef[] {
  const out: StarDef[] = [];
  for (let i = 0; i < 13; i++) {
    const t = i / 12;
    const x = 2.0 + t * 9.8;
    const y = 4.0 + t * 9.5 + Math.sin(t * 9) * 0.9;
    out.push({ x: +x.toFixed(3), y: +y.toFixed(3), r: 0.36 });
  }
  out.push({ x: 4.4, y: 9.6, r: 0.4, loose: true }, { x: 9.6, y: 8.2, r: 0.4, loose: true }, { x: 7.2, y: 5.6, r: 0.4, loose: true });
  return out;
}

export const stages: StageDef[] = [
  {
    id: 'arc',
    rollovers: true,
    name: 'はじまりの弧',
    hint: '星に3回当てると爆発。1回当てた星は灯ったまま残り、近くの爆発で連鎖する',
    stars: [
      { x: 4.0, y: 9.0, r: 0.6 }, { x: 5.4, y: 7.4, r: 0.6 }, { x: 6.9, y: 6.8, r: 0.6 },
      { x: 8.4, y: 7.4, r: 0.6 }, { x: 9.8, y: 9.0, r: 0.6 },
    ],
    links: chainLinks(0, 5),
    hue: 0.62,
  },
  {
    id: 'corona',
    slings: true, rollovers: true,
    name: '冠',
    hint: '灯した星だけが連鎖する。全部灯してから点火すれば星座が完成',
    stars: arc(6.9, 10.2, 3.9, Math.PI + 0.3, Math.PI * 2 - 0.3, 7),
    links: chainLinks(0, 7),
    hue: 0.12,
  },
  {
    id: 'spiral',
    slings: true, rollovers: true,
    name: '渦',
    hint: '中心から外へ。チャージを育ててから一気に',
    stars: spiral(),
    links: chainLinks(0, 11),
    bumpers: [{ x: 2.2, y: 14.6, r: 0.45 }, { x: 11.6, y: 14.6, r: 0.45 }],
    hue: 0.9,
  },
  {
    id: 'drift',
    slings: true, rollovers: true,
    name: '漂う星',
    hint: '固定されていない星は爆風で飛ぶ。ぶつかってもチャージされる',
    stars: [
      { x: 3.5, y: 6.0 }, { x: 10.3, y: 6.0 }, { x: 6.9, y: 12.0 },
      { x: 5.8, y: 7.6, loose: true }, { x: 8.0, y: 7.6, loose: true }, { x: 6.9, y: 9.6, loose: true }, { x: 6.9, y: 5.4, loose: true },
    ],
    links: [[0, 3], [1, 4], [2, 5]],
    hue: 0.55,
  },
  {
    id: 'gemini',
    slings: true, rollovers: true,
    name: 'ふたご座',
    hint: '離れた星座は別々に点火。灯りより上のチャージは時間で減る',
    stars: [
      { x: 4.2, y: 5.0 }, { x: 4.2, y: 7.2 }, { x: 4.2, y: 9.4 },
      { x: 9.6, y: 5.0 }, { x: 9.6, y: 7.2 }, { x: 9.6, y: 9.4 },
    ],
    links: [[0, 1], [1, 2], [3, 4], [4, 5], [0, 3]],
    hue: 0.7,
  },
  {
    id: 'orion',
    slings: true, outlanes: true, rollovers: true,
    name: 'オリオン',
    hint: '漂う星を橋にして、肩から足まで一気に繋げ',
    stars: [
      { x: 4.5, y: 4.5, r: 0.65 }, { x: 9.3, y: 5.0, r: 0.6 },
      { x: 6.0, y: 8.5, r: 0.45 }, { x: 6.9, y: 8.8, r: 0.45 }, { x: 7.8, y: 9.1, r: 0.45 },
      { x: 8.9, y: 12.8, r: 0.55 }, { x: 4.6, y: 12.5, r: 0.65 },
      { x: 5.3, y: 6.4, r: 0.4, loose: true }, { x: 8.5, y: 6.8, r: 0.4, loose: true },
    ],
    links: [[0, 2], [1, 4], [2, 3], [3, 4], [4, 5], [2, 6]],
    hue: 0.6,
  },
  {
    id: 'libra',
    slings: true, outlanes: true, rollovers: true,
    name: '天秤',
    hint: '惑星（灰色の玉）は爆発しないが、よく弾く',
    stars: [
      { x: 2.8, y: 9.2 }, { x: 3.6, y: 10.9 }, { x: 2.4, y: 11.2 },
      { x: 11.0, y: 9.2 }, { x: 10.2, y: 10.9 }, { x: 11.4, y: 11.2 },
      { x: 6.9, y: 4.4, r: 0.85 },
    ],
    links: [[0, 1], [1, 2], [3, 4], [4, 5], [6, 0], [6, 3]],
    bumpers: [{ x: 6.9, y: 9.4, r: 0.7 }, { x: 4.7, y: 12.9, r: 0.45 }, { x: 9.1, y: 12.9, r: 0.45 }],
    hue: 0.8,
  },
  {
    id: 'milkyway',
    slings: true, outlanes: true, rollovers: true,
    name: '天の川',
    hint: '最後は大連鎖。全部まとめて燃やせ',
    stars: milkyWay(),
    links: chainLinks(0, 13),
    bumpers: [{ x: 6.9, y: 16.2, r: 0.4 }],
    hue: 0.66,
  },
  {
    id: 'scorpius',
    slings: true, outlanes: true, rollovers: true,
    name: '蠍',
    hint: '赤い心臓から尾の毒針まで。壁際の星は惑星で跳ねて狙え',
    stars: [
      { x: 12.0, y: 3.6, r: 0.4 }, { x: 9.8, y: 2.4, r: 0.4 }, { x: 10.4, y: 4.6, r: 0.42 },
      { x: 9.0, y: 6.2, r: 0.62 }, { x: 8.0, y: 8.0, r: 0.42 }, { x: 6.8, y: 9.6, r: 0.42 },
      { x: 5.2, y: 10.8, r: 0.4 }, { x: 3.6, y: 11.4, r: 0.4 }, { x: 2.4, y: 12.8, r: 0.4 }, { x: 2.3, y: 14.4, r: 0.38 }, { x: 3.4, y: 15.3, r: 0.38 },
    ],
    links: [[0, 2], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10]],
    bumpers: [{ x: 10.2, y: 11.6, r: 0.6 }, { x: 4.6, y: 5.2, r: 0.5 }, { x: 6.9, y: 15.8, r: 0.42 }],
    hue: 0.98,
  },
  {
    id: 'cygnus',
    slings: true, outlanes: true, rollovers: true,
    name: '白鳥',
    hint: '翼の先から胴へ。十字の真ん中が鍵',
    stars: [
      { x: 6.9, y: 3.0, r: 0.5 }, { x: 6.9, y: 5.4, r: 0.45 }, { x: 6.9, y: 7.8, r: 0.6 }, { x: 6.9, y: 10.3, r: 0.45 }, { x: 6.9, y: 12.7, r: 0.45 },
      { x: 4.5, y: 7.0, r: 0.42 }, { x: 2.5, y: 8.6, r: 0.42 }, { x: 9.3, y: 7.0, r: 0.42 }, { x: 11.3, y: 8.6, r: 0.42 },
      { x: 4.8, y: 11.2, r: 0.38, loose: true }, { x: 9.0, y: 11.2, r: 0.38, loose: true },
    ],
    links: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [5, 6], [2, 7], [7, 8]],
    bumpers: [{ x: 6.9, y: 15.6, r: 0.42 }],
    hue: 0.58,
  },
  {
    id: 'dipper',
    slings: true, outlanes: true, rollovers: true, noKickbackStart: true,
    name: '北斗',
    hint: '七つの星は離れている。漂う星を運んで橋をかけろ',
    stars: [
      { x: 3.0, y: 8.0, r: 0.38 }, { x: 3.5, y: 11.2, r: 0.38 }, { x: 6.6, y: 11.6, r: 0.38 }, { x: 6.4, y: 8.4, r: 0.38 },
      { x: 8.9, y: 6.9, r: 0.38 }, { x: 10.6, y: 4.9, r: 0.38 }, { x: 12.0, y: 2.9, r: 0.38 },
      { x: 4.8, y: 9.8, r: 0.36, loose: true }, { x: 9.6, y: 9.4, r: 0.36, loose: true },
    ],
    links: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]],
    bumpers: [{ x: 6.9, y: 4.6, r: 0.7 }, { x: 10.6, y: 13.4, r: 0.45 }],
    hue: 0.64,
  },
  {
    id: 'galaxy',
    slings: true, outlanes: true, rollovers: true, noKickbackStart: true,
    name: '銀河の核',
    hint: '輪をすべて灯してから、中心の大きな星で一気に',
    stars: [
      ...arc(6.9, 8.4, 3.7, -Math.PI / 2, Math.PI * 1.5 - (Math.PI * 2) / 12, 12, 0.32),
      { x: 6.9, y: 8.4, r: 0.85 },
      { x: 3.0, y: 14.0, r: 0.36, loose: true }, { x: 10.8, y: 14.0, r: 0.36, loose: true },
    ],
    links: [...chainLinks(0, 12), [11, 0], [12, 0], [12, 3], [12, 6], [12, 9]],
    bumpers: [{ x: 4.4, y: 14.8, r: 0.45 }, { x: 9.4, y: 14.8, r: 0.45 }, { x: 6.9, y: 16.4, r: 0.42 }, { x: 2.2, y: 9.2, r: 0.5 }, { x: 11.6, y: 9.2, r: 0.5 }],
    hue: 0.82,
  },
  {
    id: 'endless',
    slings: true, outlanes: true, rollovers: true,
    name: 'エンドレス',
    hint: '星が尽きると次の波。ボールが尽きるまでスコアを伸ばせ',
    stars: [],
    links: [],
    endless: { seed: 20261124 },
    hue: 0.7,
  },
];
