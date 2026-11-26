/**
 * Echo Loop のステージ。盤面の書き方は Nova Pinball と同じ StageDef。
 * 色は水色〜青緑（時間の色）で、Nova の青紫と見分けられるように（EL-10）。
 * 「1ループでは届かない広がり」：星をいくつかの群れに分けて置く。群れの中は爆風が届く（灯せば連鎖する）が、
 * 群れどうしは離れているので、別々のボール（＝別々のループの自分）が受け持つ必要がある。
 */
import type { StarDef } from '../../nova-pinball/src/stages';
import type { EchoStage } from './sim';

type P = [number, number];

/** 点の列から星を作る */
const pts = (list: P[], r = 0.5, loose: number[] = []): StarDef[] =>
  list.map(([x, y], i) => ({ x, y, r, ...(loose.includes(i) ? { loose: true } : {}) }));

/** 群れ：中心のまわりに n 個（半径 rad の輪、または小さな三角・線） */
function ring(cx: number, cy: number, rad: number, n: number, a0 = -Math.PI / 2): P[] {
  const out: P[] = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i * Math.PI * 2) / n;
    out.push([+(cx + rad * Math.cos(a)).toFixed(2), +(cy + rad * Math.sin(a)).toFixed(2)]);
  }
  return out;
}

function line(x0: number, y0: number, x1: number, y1: number, n: number): P[] {
  const out: P[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    out.push([+(x0 + (x1 - x0) * t).toFixed(2), +(y0 + (y1 - y0) * t).toFixed(2)]);
  }
  return out;
}

/** 群れごとの線（輪なら閉じる）。start は星の通し番号の開始 */
function links(start: number, n: number, closed = false): [number, number][] {
  const l: [number, number][] = [];
  for (let i = 0; i < n - 1; i++) l.push([start + i, start + i + 1]);
  if (closed && n > 2) l.push([start + n - 1, start]);
  return l;
}

const base = { slings: true, rollovers: true } as const;

/** 盤の上を丸い文字盤の形に（EL-10c）。上の方まで星がある面（鏡・星の雨・散開・残響の果て）は角の丸い四角のまま */
const CLOCK = { name: '文字盤', outer: 'dome' } as const;

export const stages: EchoStage[] = [
  {
    id: 'echo-bridge', ...base, shape: CLOCK,
    name: '橋',
    hint: '10秒で全部は無理。今のループで片方の岸を燃やし、次のループの自分にもう片方を任せろ',
    stars: pts([...line(2.4, 6.0, 2.4, 9.6, 3), ...line(11.4, 6.0, 11.4, 9.6, 3), ...line(5.0, 7.8, 8.8, 7.8, 3)], 0.5),
    links: [...links(0, 3), ...links(3, 3), ...links(6, 3), [1, 6], [8, 4]],
    hue: 0.47,
  },
  {
    id: 'echo-clock', ...base, shape: CLOCK, outlanes: true,
    name: '時計',
    hint: '十二の時刻と、回る時計の針。針は毎ループ同じ時刻に同じ所 — 針に弾かせて時刻を打て',
    stars: pts(ring(6.9, 8.4, 4.4, 12), 0.42),
    links: links(0, 12, true),
    bumpers: [{ x: 6.9, y: 8.4, r: 0.8 }],
    hand: { x: 6.9, y: 8.4, len: 3.3 },
    hue: 0.5,
  },
  {
    id: 'echo-mirror', ...base, outlanes: true,
    name: '鏡',
    hint: '左右対称の盤面。過去の自分を鏡のように使え',
    stars: pts([...line(2.6, 4.0, 4.6, 12.0, 5), ...line(11.2, 4.0, 9.2, 12.0, 5), ...ring(6.9, 5.0, 0.9, 3)], 0.42),
    links: [...links(0, 5), ...links(5, 5), ...links(10, 3, true)],
    bumpers: [{ x: 6.9, y: 10.6, r: 0.6 }],
    hand: { x: 6.9, y: 10.6, len: 2.0, dir: -1 },
    hue: 0.52,
  },
  {
    id: 'echo-twin', ...base, shape: CLOCK,
    extraLoops: 0,
    name: '二つの灯',
    hint: '二つの灯は離れている。残響の軌跡を見て、まだ燃えない方を狙え',
    stars: pts([...ring(3.9, 7.0, 1.0, 3), ...ring(9.9, 7.0, 1.0, 3)], 0.55),
    links: [...links(0, 3, true), ...links(3, 3, true)],
    hue: 0.49,
  },
  {
    id: 'echo-triad', ...base, shape: CLOCK,
    extraLoops: 0,
    name: '三つ星',
    hint: '三つの群れ。三人の自分で一つずつ',
    stars: pts([...ring(3.4, 10.4, 0.95, 3), ...ring(6.9, 5.6, 0.95, 3), ...ring(10.4, 10.4, 0.95, 3)], 0.5),
    links: [...links(0, 3, true), ...links(3, 3, true), ...links(6, 3, true)],
    hand: { x: 6.9, y: 9.2, len: 2.2, dir: -1 },
    hue: 0.52,
  },
  {
    id: 'echo-rain', ...base,
    extraLoops: 1,
    name: '星の雨',
    hint: '縦に並んだ三本の雨。上から順に灯せば下まで届く',
    stars: pts([...line(3.2, 3.6, 3.2, 11.6, 4), ...line(6.9, 2.6, 6.9, 10.6, 4), ...line(10.6, 3.6, 10.6, 11.6, 4)], 0.45),
    links: [...links(0, 4), ...links(4, 4), ...links(8, 4)],
    hue: 0.48,
  },
  {
    id: 'echo-crossing', ...base, shape: CLOCK, outlanes: true,
    extraLoops: 2,
    name: '交差点',
    hint: '軌道が交わる。残響とぶつかると過去が変わる — それを利用しろ',
    stars: pts([...ring(4.0, 5.2, 0.9, 3), ...ring(9.8, 5.2, 0.9, 3), ...ring(4.0, 11.4, 0.9, 3), ...ring(9.8, 11.4, 0.9, 3)], 0.52),
    links: [...links(0, 3, true), ...links(3, 3, true), ...links(6, 3, true), ...links(9, 3, true)],
    bumpers: [{ x: 6.9, y: 8.3, r: 0.5 }],
    hand: { x: 6.9, y: 8.3, len: 2.6 },
    hue: 0.51,
  },
  {
    id: 'echo-scatter', ...base, outlanes: true,
    extraLoops: 1,
    name: '散開',
    hint: '四隅の群れと、真ん中の大きな星。最後のループで全員そろえ',
    stars: pts([
      ...ring(3.4, 4.4, 0.8, 3), ...ring(10.4, 4.4, 0.8, 3),
      ...ring(3.4, 12.0, 0.8, 3), ...ring(10.4, 12.0, 0.8, 3),
    ], 0.52).concat([{ x: 6.9, y: 8.2, r: 0.85 }]),
    links: [...links(0, 3, true), ...links(3, 3, true), ...links(6, 3, true), ...links(9, 3, true), [12, 1], [12, 4], [12, 7], [12, 10]],
    hue: 0.5,
  },
  {
    id: 'echo-drift', ...base, shape: CLOCK, outlanes: true,
    extraLoops: 1,
    name: '流星群',
    hint: '漂う星は残響の道を変える。同じループでも毎回ちがう過去になる',
    stars: pts([...ring(3.8, 6.4, 1.1, 4), ...ring(10.0, 6.4, 1.1, 4), ...line(5.2, 11.6, 8.6, 11.6, 3)], 0.5, [9]),
    links: [...links(0, 4, true), ...links(4, 4, true), ...links(8, 3)],
    hue: 0.53,
  },
  {
    id: 'echo-finale', ...base, outlanes: true, noKickbackStart: true,
    extraLoops: 0,
    name: '残響の果て',
    hint: '盤面いっぱいの星。六人の自分が同じ一瞬にそろった時だけ届く',
    stars: pts([
      ...ring(3.2, 3.8, 0.9, 3), ...ring(10.6, 3.8, 0.9, 3), ...line(5.9, 7.6, 7.9, 7.6, 3),
      ...ring(2.9, 10.8, 0.9, 3), ...ring(10.9, 10.8, 0.9, 3), ...line(5.9, 13.4, 7.9, 13.4, 3),
    ], 0.4),
    links: [...links(0, 3, true), ...links(3, 3, true), ...links(6, 3), ...links(9, 3, true), ...links(12, 3, true), ...links(15, 3)],
    bumpers: [{ x: 6.9, y: 10.1, r: 0.55 }],
    hand: { x: 6.9, y: 10.1, len: 1.8 },
    hue: 0.54,
  },
];
