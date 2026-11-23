/**
 * ランチャーに並ぶゲームの一覧。新しいゲームを追加したらここに1行足す。
 * status: 'ready' は遊べる、'wip' は制作中（灰色で表示）
 */
export interface GameEntry {
  id: string;
  title: string;
  jp: string;
  desc: string;
  status: 'ready' | 'wip';
  /** ステージ（問題）の数。星図にクリア状況を出すのに使う */
  stages: number;
  /** 星座の形（0..1 の座標）。最初の点がクリック位置 */
  shape: [number, number][];
  edges: [number, number][];
  /** 星図上の中心（0..1） */
  at: [number, number];
  hue: string;
}

export const games: GameEntry[] = [
  {
    id: 'nova-pinball', title: 'Nova Pinball', jp: '星爆ピンボール', status: 'ready', stages: 13,
    desc: '星に当ててチャージ、満タンで爆発。育てた星を一気に点火して連鎖で全部燃やす。',
    shape: [[0.5, 0.5], [0.2, 0.25], [0.8, 0.2], [0.85, 0.75], [0.25, 0.8]], edges: [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2]],
    at: [0.27, 0.33], hue: '#9fd0ff',
  },
  {
    id: 'echo-loop', title: 'Echo Loop', jp: '残響ループ', status: 'ready', stages: 10,
    desc: '10秒の時間ループ。過去の自分のボールと一緒に、同じ10秒で全部の星を爆発させる。',
    shape: [[0.5, 0.5], [0.15, 0.4], [0.35, 0.1], [0.7, 0.15], [0.85, 0.55], [0.6, 0.9]], edges: [[1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 1]],
    at: [0.63, 0.27], hue: '#c3a6ff',
  },
  {
    id: 'stopped-world', title: 'Stopped World', jp: '時止めの一撃', status: 'ready', stages: 10,
    desc: '時間を止めて力を溜め、解除の瞬間に全部まとめて解き放つ。',
    shape: [[0.5, 0.5], [0.5, 0.1], [0.9, 0.5], [0.5, 0.9], [0.1, 0.5]], edges: [[1, 2], [2, 3], [3, 4], [4, 1], [0, 1], [0, 3]],
    at: [0.84, 0.48], hue: '#e8e8ff',
  },
  {
    id: 'event-horizon', title: 'Event Horizon', jp: '事象の地平クレーン', status: 'ready', stages: 9,
    desc: 'ブラックホールで物体を周回させ、ホワイトホールの爆発でゴールへ投げ飛ばす。',
    shape: [[0.5, 0.5], [0.2, 0.3], [0.8, 0.3], [0.8, 0.7], [0.2, 0.7]], edges: [[1, 2], [2, 3], [3, 4], [4, 1]],
    at: [0.6, 0.6], hue: '#ffb38a',
  },
  {
    id: 'origami-cosmos', title: 'Origami Cosmos', jp: '折紙宇宙', status: 'ready', stages: 20,
    desc: '宇宙を折りたたんで、遠い星同士を重ね合わせて連鎖させるパズル。',
    shape: [[0.5, 0.5], [0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]], edges: [[1, 2], [2, 3], [3, 4], [4, 1], [1, 3]],
    at: [0.33, 0.6], hue: '#ffe2a8',
  },
  {
    id: 'starsand', title: 'Starsand', jp: '星砂', status: 'ready', stages: 8,
    desc: '流れ落ちる数千粒の光る砂を、星座の器へ導く。満ちたら夜空が花火で弾ける。',
    shape: [[0.5, 0.5], [0.3, 0.15], [0.7, 0.15], [0.5, 0.85]], edges: [[1, 2], [2, 3], [3, 1]],
    at: [0.1, 0.46], hue: '#a8ffe0',
  },
];
