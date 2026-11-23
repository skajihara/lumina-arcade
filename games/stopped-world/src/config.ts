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
  /** 卵が割れる衝撃の強さ（速度の差） */
  eggBreak: number;
  /** 箱が壊れる衝撃の強さ */
  crateBreak: number;
  /** 爆弾の爆風の半径と強さ */
  bombRadius: number;
  bombForce: number;
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
  eggBreak: { label: '卵が割れる衝撃', min: 2, max: 40, step: 0.5, folder: '物体' },
  crateBreak: { label: '箱が壊れる衝撃', min: 2, max: 40, step: 0.5, folder: '物体' },
  bombRadius: { label: '爆弾の半径', min: 1, max: 8, step: 0.1, folder: '物体' },
  bombForce: { label: '爆弾の強さ', min: 1, max: 60, step: 0.5, folder: '物体' },
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
  eggBreak: 11,
  crateBreak: 9,
  bombRadius: 3.2,
  bombForce: 22,
  gameSpeed: 1,
  shake: 1,
  particles: 1,
  bloom: true,
  volume: 0.7,
};

export const presets: Record<string, StopConfig> = {
  やさしい: { ...normal, stopGauge: 14, maxForces: 6, eggBreak: 15 },
  ふつう: normal,
  むずかしい: { ...normal, stopGauge: 5, maxForces: 3, eggBreak: 9 },
};

export const DEFAULT_PRESET = 'ふつう';
