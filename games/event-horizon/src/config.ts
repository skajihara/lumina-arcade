import type { Schema } from '@engine/tuning';
import { defaults, type SkimConfig } from './sim';

/** Event Horizon（地平すれすれ）の全パラメータ */
export interface HorizonConfig {
  [k: string]: number | boolean;
  gravity: number;
  strong: number;
  thrust: number;
  fuelMul: number;
  time: number;
  maxMult: number;
  pickR: number;
  /** 予測線の長さ（秒、0 で無し） */
  predict: number;
  /** 倍率に応じて画面の時間がゆっくりになる強さ（0 で無し） */
  slowFx: number;
  gameSpeed: number;
  shake: number;
  particles: number;
  bloom: boolean;
  volume: number;
}

export const schema: Schema<HorizonConfig> = {
  gravity: { label: '重力の強さ（倍）', min: 0.5, max: 2, step: 0.05, folder: '世界', restart: true },
  strong: { label: '地平の近くで強まる重力', min: 0, max: 2, step: 0.05, folder: '世界', restart: true },
  thrust: { label: '噴射の強さ', min: 0.3, max: 5, step: 0.05, folder: '船' },
  fuelMul: { label: '燃料（倍）', min: 0.3, max: 3, step: 0.05, folder: '船', restart: true },
  time: { label: '持ち時間（船の時計の秒）', min: 20, max: 180, step: 5, folder: '船', restart: true },
  maxMult: { label: '倍率の上限', min: 2, max: 20, step: 0.5, folder: '得点' },
  pickR: { label: 'かけらを拾える距離', min: 0.2, max: 1.5, step: 0.05, folder: '得点' },
  predict: { label: '予測線の長さ（秒、0で無し）', min: 0, max: 4, step: 0.1, folder: '遊びやすさ' },
  slowFx: { label: '倍率で画面がゆっくりになる強さ', min: 0, max: 1, step: 0.05, folder: '演出' },
  gameSpeed: { label: 'ゲーム速度', min: 0.3, max: 1.5, step: 0.05, folder: '演出' },
  shake: { label: '画面揺れ', min: 0, max: 2, step: 0.05, folder: '演出' },
  particles: { label: 'パーティクル量', min: 0, max: 3, step: 0.1, folder: '演出' },
  bloom: { label: '発光（ブルーム）', folder: '演出' },
  volume: { label: '音量', min: 0, max: 1, step: 0.01, folder: '演出' },
};

const normal: HorizonConfig = {
  gravity: defaults.gravity, strong: defaults.strong, thrust: defaults.thrust, fuelMul: 1, time: defaults.time,
  maxMult: defaults.maxMult, pickR: defaults.pickR, predict: 1.6, slowFx: 1, gameSpeed: 1, shake: 1, particles: 1, bloom: true, volume: 0.7,
};

export const presets: Record<string, HorizonConfig> = {
  やさしい: { ...normal, strong: 0.2, thrust: 1.1, fuelMul: 1.5, time: 75, pickR: 0.7, predict: 2.6 },
  ふつう: normal,
  むずかしい: { ...normal, strong: 0.5, thrust: 1.5, fuelMul: 0.8, time: 50, pickR: 0.45, predict: 0.8 },
};

export const DEFAULT_PRESET = 'ふつう';

/** 調整パネルの値 → シミュレーションの設定 */
export function toSkim(c: HorizonConfig): SkimConfig {
  return { ...defaults, gravity: c.gravity, strong: c.strong, thrust: c.thrust, fuelMul: c.fuelMul, time: c.time, maxMult: c.maxMult, pickR: c.pickR };
}
