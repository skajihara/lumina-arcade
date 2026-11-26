import type { Schema } from '@engine/tuning';
import { defaults, type ClawConfig } from './sim';

/** Moon Claw の全パラメータ（調整パネルとプリセット） */
export interface MoonConfig {
  [k: string]: number | boolean;
  /** 制限時間（秒） */
  timeLimit: number;
  /** 爪の頭の最高速度・加速 */
  clawSpeed: number;
  clawAccel: number;
  /** 指の開閉の速さ・挟む力・摩擦 */
  fingerSpeed: number;
  fingerTorque: number;
  fingerFriction: number;
  gravity: number;
  /** 宝石箱の中で落ち着いたら納まるまで（秒） */
  settle: number;
  /** 同じ種類を続けて納めるコンボの倍率の上限（1 で無し） */
  comboMax: number;
  gameSpeed: number;
  shake: number;
  particles: number;
  bloom: boolean;
  volume: number;
}

export const schema: Schema<MoonConfig> = {
  timeLimit: { label: '制限時間（秒）', min: 30, max: 300, step: 5, folder: 'ルール', restart: true },
  comboMax: { label: 'コンボの倍率の上限（同じ種類を続けて納める。1で無し）', min: 1, max: 6, step: 1, folder: 'ルール' },
  settle: { label: '納まるまで落ち着く秒', min: 0.05, max: 2, step: 0.05, folder: 'ルール' },
  clawSpeed: { label: '爪の速さ', min: 1, max: 12, step: 0.5, folder: '爪' },
  clawAccel: { label: '爪の加速（小さいほど慣性が大きい）', min: 2, max: 80, step: 1, folder: '爪' },
  fingerSpeed: { label: '指の開閉の速さ', min: 0.5, max: 8, step: 0.1, folder: '爪' },
  fingerTorque: { label: '挟む力', min: 5, max: 300, step: 5, folder: '爪' },
  fingerFriction: { label: '指の摩擦', min: 0, max: 2, step: 0.05, folder: '爪', restart: true },
  gravity: { label: '重力', min: 4, max: 40, step: 1, folder: '世界', restart: true },
  gameSpeed: { label: 'ゲーム速度', min: 0.3, max: 1.5, step: 0.05, folder: '演出' },
  shake: { label: '画面揺れ', min: 0, max: 2, step: 0.05, folder: '演出' },
  particles: { label: 'パーティクル量', min: 0, max: 3, step: 0.1, folder: '演出' },
  bloom: { label: '発光（ブルーム）', folder: '演出' },
  volume: { label: '音量', min: 0, max: 1, step: 0.01, folder: '演出' },
};

const normal: MoonConfig = {
  timeLimit: defaults.timeLimit,
  clawSpeed: defaults.clawSpeed,
  clawAccel: defaults.clawAccel,
  fingerSpeed: defaults.fingerSpeed,
  fingerTorque: defaults.fingerTorque,
  fingerFriction: defaults.fingerFriction,
  gravity: defaults.gravity,
  settle: defaults.settle,
  comboMax: defaults.comboMax,
  gameSpeed: 1,
  shake: 1,
  particles: 1,
  bloom: true,
  volume: 0.7,
};

export const presets: Record<string, MoonConfig> = {
  やさしい: { ...normal, timeLimit: 150, fingerFriction: 1.05 },
  ふつう: normal,
  むずかしい: { ...normal, timeLimit: 70, fingerTorque: 55, fingerFriction: 0.7 },
};

export const DEFAULT_PRESET = 'ふつう';

/** 調整パネルの値 → シミュレーションの設定 */
export function toClaw(c: MoonConfig): ClawConfig {
  return {
    ...defaults, timeLimit: c.timeLimit, clawSpeed: c.clawSpeed, clawAccel: c.clawAccel, fingerSpeed: c.fingerSpeed,
    fingerTorque: c.fingerTorque, fingerFriction: c.fingerFriction, gravity: c.gravity, settle: c.settle, comboMax: c.comboMax,
  };
}
