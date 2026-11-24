import type { Schema } from '@engine/tuning';

/** Stopped World の全パラメータ */
export interface StopConfig {
  [k: string]: number | boolean;
  gravity: number;
  /** 時間停止ゲージ（秒）。止めている間だけ減る */
  stopGauge: number;
  /** 1回の停止で置ける力の数 */
  maxForces: number;
  /** 1回叩いた時の力の大きさ（N・s／kg あたり＝速度の変化） */
  forcePerHit: number;
  /** 1つの物体に溜められる力の上限（速度の変化） */
  maxForce: number;
  /** 操作：0 引っぱって放す（パチンコ式）／1 ドラッグの向きに一定の力 */
  control: number;
  /** パチンコ式：いっぱいに引いた時の距離（m）と、その時の力（1回で溜まる力の何倍か） */
  slingPull: number;
  slingMax: number;
  /** 卵が割れる衝撃の強さ（速度の差） */
  eggBreak: number;
  /** 箱が壊れる衝撃の強さ */
  crateBreak: number;
  /** 爆弾の爆風の半径と強さ */
  bombRadius: number;
  bombForce: number;
  /** 巣が卵を受け止める強さ（巣の中での減衰） */
  nestGrip: number;
  /** 止めている間に見える予測線の秒数（0 で無し） */
  predictSec: number;
  /** ひねり：0 なし／1 壊すと時間が戻る（ゲージ回復）／2 向きを変える（速さを保って矢印の向きへ）／3 両方 */
  twist: number;
  /** ひねり1：箱を壊す・爆弾が爆発するたびに戻るゲージ（秒） */
  refill: number;
  gameSpeed: number;
  shake: number;
  particles: number;
  bloom: boolean;
  volume: number;
}

export const schema: Schema<StopConfig> = {
  gravity: { label: '重力', min: 5, max: 40, step: 0.5, folder: '世界' },
  stopGauge: { label: '時間停止ゲージ（秒）', min: 1, max: 30, step: 0.5, folder: '時間停止', restart: true },
  maxForces: { label: '1回の停止で置ける力の数', min: 1, max: 12, step: 1, folder: '時間停止' },
  forcePerHit: { label: '1回で溜まる力', min: 1, max: 20, step: 0.5, folder: '時間停止' },
  maxForce: { label: '1つの物体の力の上限', min: 2, max: 60, step: 1, folder: '時間停止' },
  control: { label: '操作（0 引っぱって放す／1 ドラッグの向き）', min: 0, max: 1, step: 1, folder: '時間停止' },
  slingPull: { label: 'いっぱいに引く距離', min: 1, max: 8, step: 0.1, folder: '時間停止' },
  slingMax: { label: 'いっぱいに引いた時の力（倍）', min: 0.5, max: 4, step: 0.1, folder: '時間停止' },
  eggBreak: { label: '卵が割れる衝撃', min: 2, max: 40, step: 0.5, folder: '物体' },
  crateBreak: { label: '箱が壊れる衝撃', min: 2, max: 40, step: 0.5, folder: '物体' },
  bombRadius: { label: '爆弾の半径', min: 1, max: 8, step: 0.1, folder: '物体' },
  bombForce: { label: '爆弾の強さ', min: 1, max: 60, step: 0.5, folder: '物体' },
  nestGrip: { label: '巣が卵を受け止める強さ', min: 0, max: 10, step: 0.1, folder: '物体' },
  predictSec: { label: '予測線の長さ（秒、0で無し）', min: 0, max: 3, step: 0.1, folder: '時間停止' },
  twist: { label: 'ひねり（0なし 1壊すと時間が戻る 2向きを変える 3両方）', min: 0, max: 3, step: 1, folder: 'ルール', restart: true },
  refill: { label: '壊すと戻る時間（秒）', min: 0, max: 3, step: 0.05, folder: 'ルール' },
  gameSpeed: { label: 'ゲーム速度', min: 0.3, max: 1.5, step: 0.05, folder: '演出' },
  shake: { label: '画面揺れ', min: 0, max: 2, step: 0.05, folder: '演出' },
  particles: { label: 'パーティクル量', min: 0, max: 3, step: 0.1, folder: '演出' },
  bloom: { label: '発光（ブルーム）', folder: '演出' },
  volume: { label: '音量', min: 0, max: 1, step: 0.01, folder: '演出' },
};

const normal: StopConfig = {
  gravity: 18,
  stopGauge: 8,
  maxForces: 4,
  forcePerHit: 6,
  maxForce: 24,
  control: 0,
  slingPull: 3,
  slingMax: 1.5,
  eggBreak: 11,
  crateBreak: 9,
  bombRadius: 3.2,
  bombForce: 22,
  nestGrip: 3,
  predictSec: 1,
  twist: 1,
  refill: 0.6,
  gameSpeed: 1,
  shake: 1,
  particles: 1,
  bloom: true,
  volume: 0.7,
};

export const presets: Record<string, StopConfig> = {
  やさしい: { ...normal, stopGauge: 14, maxForces: 6, eggBreak: 15, predictSec: 1.6 },
  ふつう: normal,
  むずかしい: { ...normal, stopGauge: 5, maxForces: 3, eggBreak: 9, predictSec: 0.5 },
};

export const DEFAULT_PRESET = 'ふつう';
