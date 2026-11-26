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
  /** 色（ひねりA 用。省略時は番号順に 0,1,2） */
  color?: number;
}

export interface BumperDef {
  x: number;
  y: number;
  r: number;
}

/**
 * アイテム（NP-11）：ボールが触れると効く。使うとしばらく消えて、また現れる
 * - split：分裂。ボールが2つに分かれる（マルチボール）
 * - hole：小さなブラックホール。3秒のあいだ、強い引力の中心になる
 * - warp：ワームホール。入ると to の出口から、同じ速さで飛び出す
 */
export interface ItemDef {
  kind: 'split' | 'hole' | 'warp';
  x: number;
  y: number;
  /** warp の出口 */
  to?: { x: number; y: number };
}

import type { BoardOpts, BoardShape } from './sim';

/** 盤面の形（NP-19）。左右の壁から内へ斜めに伸びる「漏斗」の壁 */
const funnel = (y0: number, y1: number, inset: number): BoardShape['walls'] => [
  [{ x: 0.6, y: y0 }, { x: 0.6 + inset, y: y1 }],
  [{ x: 13.2, y: y0 }, { x: 13.2 - inset, y: y1 }],
];
const SHAPES: Record<string, BoardShape> = {
  /** 真ん中に入れない島 */
  island: { name: '島', islands: [{ x: 6.9, y: 12.6, r: 0.95 }] },
  /** 左右の壁が中ほどで内へ寄る漏斗 */
  funnel: { name: '漏斗', walls: funnel(9.6, 14.2, 1.7) },
  /** 左だけに張り出した岬（左右非対称） */
  cape: { name: '岬', walls: [[{ x: 0.6, y: 6.2 }, { x: 3.4, y: 8.8 }, { x: 3.4, y: 9.4 }]] },
  /** 双子の間の仕切り */
  divider: { name: '仕切り', walls: [[{ x: 6.9, y: 5.4 }, { x: 6.9, y: 9.4 }]] },
  /** 天の川の両岸の小島 */
  banks: { name: '岸の島', islands: [{ x: 3.6, y: 11.6, r: 0.75, n: 5 }, { x: 11.4, y: 5.6, r: 0.6, n: 5 }] },
  /** 丸い天井の盤（NP-19b：外壁そのものの形） */
  dome: { name: '丸天井', outer: 'dome' },
  /** 角を斜めに落とした八角の盤。角で球が鋭く跳ね返る */
  gem: { name: '八角の盤', outer: 'gem' },
  /** 漏斗（深い） */
  funnelDeep: { name: '深い漏斗', walls: funnel(8.4, 13.6, 2.2) },
};

export interface StageDef extends BoardOpts {
  id: string;
  name: string;
  hint: string;
  stars: StarDef[];
  /** 星座の線（星のインデックスの組）。両端が同じ連鎖で爆発すると灯る */
  links: [number, number][];
  bumpers?: BumperDef[];
  /** アイテム（NP-11） */
  items?: ItemDef[];
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
    shape: SHAPES.island,
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
    shape: SHAPES.funnel,
    slings: true, rollovers: true,
    name: '冠',
    hint: '灯した星だけが連鎖する。全部灯してから点火すれば星座が完成',
    stars: arc(6.9, 10.2, 3.9, Math.PI + 0.3, Math.PI * 2 - 0.3, 7),
    links: chainLinks(0, 7),
    hue: 0.12,
  },
  {
    id: 'spiral',
    shape: SHAPES.cape,
    slings: true, rollovers: true,
    name: '渦',
    hint: '中心から外へ。灰色の惑星は爆発しないが、よく弾く',
    stars: spiral(),
    links: chainLinks(0, 11),
    bumpers: [{ x: 2.2, y: 14.6, r: 0.45 }, { x: 11.6, y: 14.6, r: 0.45 }],
    hue: 0.9,
  },
  {
    id: 'drift',
    shape: SHAPES.dome,
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
    shape: SHAPES.divider,
    slings: true, rollovers: true,
    name: 'ふたご座',
    hint: '離れた星座は別々に点火。灯りより上のチャージは時間で減る',
    stars: [
      { x: 4.2, y: 5.0 }, { x: 4.2, y: 7.2 }, { x: 4.2, y: 9.4 },
      { x: 9.6, y: 5.0 }, { x: 9.6, y: 7.2 }, { x: 9.6, y: 9.4 },
    ],
    links: [[0, 1], [1, 2], [3, 4], [4, 5], [0, 3]],
    items: [{ kind: 'split', x: 6.9, y: 12.8 }],
    hue: 0.7,
  },
  {
    id: 'cygnus',
    shape: SHAPES.gem,
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
    id: 'scorpius',
    shape: SHAPES.dome,
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
    items: [{ kind: 'hole', x: 7.4, y: 12.9 }],
    hue: 0.98,
  },
  {
    id: 'orion',
    shape: SHAPES.funnelDeep,
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
    items: [{ kind: 'warp', x: 11.3, y: 15.6, to: { x: 2.2, y: 3.0 } }],
    hue: 0.6,
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
    id: 'libra',
    slings: true, outlanes: true, rollovers: true,
    name: '天秤',
    hint: '左右の皿を灯してから、てっぺんの大きな星で一気に傾けろ',
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
    shape: SHAPES.banks,
    slings: true, outlanes: true, rollovers: true,
    name: '天の川',
    hint: '長い川をひと筆で。全部灯してまとめて燃やせ',
    stars: milkyWay(),
    links: chainLinks(0, 13),
    bumpers: [{ x: 6.9, y: 16.2, r: 0.4 }],
    hue: 0.66,
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
