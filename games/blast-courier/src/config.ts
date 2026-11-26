import type { Schema } from '@engine/tuning';
import { defaults, type CourierConfig } from './sim';

/** Blast Courier の全パラメータ（調整パネルとプリセット） */
export interface BlastConfig {
  [k: string]: number | boolean;
  /** 卵の丈夫さ：ひびがいくつで割れるか・この速さを超えてぶつかるとひび・この強さを超える爆風でひび */
  cracksMax: number;
  crackSpeed: number;
  blastCrack: number;
  /** 爆風 */
  blastForce: number;
  blastR: number;
  pullForce: number;
  liftAccel: number;
  liftTime: number;
  delayTime: number;
  cooldown: number;
  gravity: number;
  air: number;
  /** 狙いの矢印（卵がどちらへどれだけ飛ぶか）を出す */
  aim: number;
  gameSpeed: number;
  shake: number;
  particles: number;
  bloom: boolean;
  volume: number;
}

export const schema: Schema<BlastConfig> = {
  cracksMax: { label: '割れるまでのひびの数', min: 1, max: 9, step: 1, folder: '卵' },
  crackSpeed: { label: 'ひびが入るぶつかる速さ', min: 3, max: 30, step: 0.5, folder: '卵' },
  blastCrack: { label: 'ひびが入る爆風の強さ', min: 5, max: 30, step: 0.5, folder: '卵' },
  blastForce: { label: '押す爆風の強さ', min: 3, max: 30, step: 0.5, folder: '爆風' },
  blastR: { label: '爆風の半径', min: 1, max: 8, step: 0.1, folder: '爆風' },
  pullForce: { label: '吸う強さ', min: 1, max: 20, step: 0.5, folder: '爆風' },
  liftAccel: { label: '上昇気流の強さ（重力の倍）', min: 1, max: 4, step: 0.05, folder: '爆風' },
  liftTime: { label: '上昇気流の長さ（秒）', min: 0.3, max: 4, step: 0.1, folder: '爆風' },
  delayTime: { label: '遅れ爆風の待ち（秒）', min: 0.3, max: 3, step: 0.1, folder: '爆風' },
  cooldown: { label: '次の爆風までの待ち（秒）', min: 0, max: 3, step: 0.05, folder: '爆風' },
  gravity: { label: '重力', min: 2, max: 25, step: 0.5, folder: '世界', restart: true },
  air: { label: '空気抵抗', min: 0, max: 2, step: 0.05, folder: '世界', restart: true },
  aim: { label: '狙いの矢印（0で無し）', min: 0, max: 1, step: 1, folder: '遊びやすさ' },
  gameSpeed: { label: 'ゲーム速度', min: 0.3, max: 1.5, step: 0.05, folder: '演出' },
  shake: { label: '画面揺れ', min: 0, max: 2, step: 0.05, folder: '演出' },
  particles: { label: 'パーティクル量', min: 0, max: 3, step: 0.1, folder: '演出' },
  bloom: { label: '発光（ブルーム）', folder: '演出' },
  volume: { label: '音量', min: 0, max: 1, step: 0.01, folder: '演出' },
};

const normal: BlastConfig = {
  cracksMax: defaults.cracksMax,
  crackSpeed: defaults.crackSpeed,
  blastCrack: defaults.blastCrack,
  blastForce: defaults.blastForce,
  blastR: defaults.blastR,
  pullForce: defaults.pullForce,
  liftAccel: defaults.liftAccel,
  liftTime: defaults.liftTime,
  delayTime: defaults.delayTime,
  cooldown: defaults.cooldown,
  gravity: defaults.gravity,
  air: defaults.air,
  aim: 1,
  gameSpeed: 1,
  shake: 1,
  particles: 1,
  bloom: true,
  volume: 0.7,
};

export const presets: Record<string, BlastConfig> = {
  やさしい: { ...normal, cracksMax: 5, crackSpeed: 11, blastCrack: 13 },
  ふつう: normal,
  むずかしい: { ...normal, cracksMax: 2, crackSpeed: 8, cooldown: 0.7 },
};

export const DEFAULT_PRESET = 'ふつう';

/** 調整パネルの値 → シミュレーションの設定 */
export function toCourier(c: BlastConfig): CourierConfig {
  return {
    ...defaults, cracksMax: c.cracksMax, crackSpeed: c.crackSpeed, blastCrack: c.blastCrack, blastForce: c.blastForce, blastR: c.blastR,
    pullForce: c.pullForce, liftAccel: c.liftAccel, liftTime: c.liftTime, delayTime: c.delayTime, cooldown: c.cooldown, gravity: c.gravity, air: c.air,
  };
}
