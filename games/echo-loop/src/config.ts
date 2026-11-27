import type { Schema } from '@engine/tuning';
import { defaults, type EchoSimConfig } from './sim';

/** Echo Loop の全パラメータ（EL-20b：一筆のループ）。調整パネルとプリセット */
export interface EchoConfig extends EchoSimConfig {
  [k: string]: number | boolean;
  gameSpeed: number;
  shake: number;
  particles: number;
  bloom: boolean;
  volume: number;
}

export const schema: Schema<EchoConfig> = {
  maxLoops: { label: '周（球）の上限', min: 1, max: 12, step: 1, folder: 'ループ', restart: true },
  stringKick: { label: '光の弦の弾き', min: 0, max: 12, step: 0.5, folder: 'ループ' },
  snapSpeed: { label: '弦が切れる速さ（大きいほど切れにくい）', min: 6, max: 40, step: 0.5, folder: 'ループ' },
  completeKick: { label: '星座の完成で球を弾く強さ', min: 0, max: 25, step: 0.5, folder: 'ループ' },
  hitKick: { label: '星に当てた時の弾き', min: 0, max: 10, step: 0.5, folder: '盤面' },
  bumperKick: { label: '灯った星（バンパー）の弾き', min: 0, max: 15, step: 0.5, folder: '盤面' },
  gravity: { label: '重力', min: 8, max: 35, step: 0.5, folder: '盤面', restart: true },
  ballRestitution: { label: '球の弾み', min: 0, max: 0.9, step: 0.05, folder: '盤面', restart: true },
  flipperLength: { label: 'フリッパーの長さ', min: 1.4, max: 3, step: 0.05, folder: 'フリッパー', restart: true },
  flipperSpeed: { label: 'フリッパーの速さ', min: 8, max: 40, step: 0.5, folder: 'フリッパー' },
  flipperTorque: { label: 'フリッパーの力', min: 500, max: 6000, step: 100, folder: 'フリッパー', restart: true },
  launchMin: { label: '発射の強さ（最小）', min: 10, max: 40, step: 0.5, folder: 'フリッパー' },
  launchMax: { label: '発射の強さ（最大）', min: 15, max: 50, step: 0.5, folder: 'フリッパー' },
  gameSpeed: { label: 'ゲーム速度', min: 0.3, max: 1.5, step: 0.05, folder: '演出' },
  shake: { label: '画面揺れ', min: 0, max: 2, step: 0.05, folder: '演出' },
  particles: { label: 'パーティクル量', min: 0, max: 3, step: 0.1, folder: '演出' },
  bloom: { label: '発光（ブルーム）', folder: '演出' },
  volume: { label: '音量', min: 0, max: 1, step: 0.01, folder: '演出' },
};

const normal: EchoConfig = { ...defaults, gameSpeed: 1, shake: 1, particles: 1, bloom: true, volume: 0.7 };

export const presets: Record<string, EchoConfig> = {
  やさしい: { ...normal, maxLoops: 7, flipperLength: 2.45, snapSpeed: 12, gravity: 19 },
  ふつう: normal,
  むずかしい: { ...normal, maxLoops: 4, flipperLength: 2.0, snapSpeed: 18, stringKick: 5 },
};

export const DEFAULT_PRESET = 'ふつう';

/** 調整パネルの値 → シミュレーションの設定 */
export function toSim(c: EchoConfig): EchoSimConfig {
  const out = { ...defaults };
  for (const k of Object.keys(defaults) as (keyof EchoSimConfig)[]) out[k] = c[k] as number;
  return out;
}
