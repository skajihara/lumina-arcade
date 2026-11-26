import type { Schema } from '@engine/tuning';
import { defaults, type ClawConfig } from './sim';

/** Moon Claw の全パラメータ（調整パネルとプリセット） */
export interface MoonConfig {
  [k: string]: number | boolean;
  /** 制限時間（秒） */
  timeLimit: number;
  /** 下の段の精霊が光っていられる秒（0 で消えない） */
  ballLife: number;
  /** 握力：これの 6 割を超える速さで爪を動かすと、精霊がこぼれる */
  grip: number;
  /** 一度に掴める数・掴める範囲 */
  grabMax: number;
  grabR: number;
  clawSpeed: number;
  clawDown: number;
  gravity: number;
  restitution: number;
  bombForce: number;
  bombR: number;
  flipperSpeed: number;
  flipperLength: number;
  /** 演出：下の段へ2つ以上同時に落ちた時のスローの長さ（秒） */
  slowmo: number;
  gameSpeed: number;
  shake: number;
  particles: number;
  bloom: boolean;
  volume: number;
}

export const schema: Schema<MoonConfig> = {
  timeLimit: { label: '制限時間（秒）', min: 30, max: 300, step: 5, folder: 'ルール', restart: true },
  ballLife: { label: '下の段の精霊の光の長さ（秒、0で消えない）', min: 0, max: 30, step: 0.5, folder: 'ルール' },
  grip: { label: '握力（大きいほどこぼれにくい）', min: 2, max: 20, step: 0.5, folder: 'ルール' },
  grabMax: { label: '一度に掴める数', min: 1, max: 6, step: 1, folder: 'ルール' },
  grabR: { label: '掴める範囲', min: 0.4, max: 2, step: 0.05, folder: 'ルール' },
  clawSpeed: { label: '爪の横の速さ', min: 1, max: 12, step: 0.5, folder: '爪' },
  clawDown: { label: '爪の下りる速さ', min: 1, max: 10, step: 0.5, folder: '爪' },
  gravity: { label: '重力', min: 4, max: 40, step: 1, folder: '世界', restart: true },
  restitution: { label: '精霊の弾み', min: 0, max: 0.9, step: 0.05, folder: '世界', restart: true },
  bombForce: { label: '爆弾の強さ', min: 0, max: 30, step: 0.5, folder: '世界' },
  bombR: { label: '爆弾の半径', min: 0.5, max: 6, step: 0.1, folder: '世界' },
  flipperSpeed: { label: 'フリッパーの速さ', min: 8, max: 40, step: 1, folder: '世界', restart: true },
  flipperLength: { label: 'フリッパーの長さ', min: 1, max: 3, step: 0.05, folder: '世界', restart: true },
  slowmo: { label: '同時に落ちた時のスロー（秒）', min: 0, max: 2, step: 0.05, folder: '演出' },
  gameSpeed: { label: 'ゲーム速度', min: 0.3, max: 1.5, step: 0.05, folder: '演出' },
  shake: { label: '画面揺れ', min: 0, max: 2, step: 0.05, folder: '演出' },
  particles: { label: 'パーティクル量', min: 0, max: 3, step: 0.1, folder: '演出' },
  bloom: { label: '発光（ブルーム）', folder: '演出' },
  volume: { label: '音量', min: 0, max: 1, step: 0.01, folder: '演出' },
};

const normal: MoonConfig = {
  timeLimit: defaults.timeLimit,
  ballLife: defaults.ballLife,
  grip: defaults.grip,
  grabMax: defaults.grabMax,
  grabR: defaults.grabR,
  clawSpeed: defaults.clawSpeed,
  clawDown: defaults.clawDown,
  gravity: defaults.gravity,
  restitution: defaults.restitution,
  bombForce: defaults.bombForce,
  bombR: defaults.bombR,
  flipperSpeed: defaults.flipperSpeed,
  flipperLength: defaults.flipperLength,
  slowmo: 0.6,
  gameSpeed: 1,
  shake: 1,
  particles: 1,
  bloom: true,
  volume: 0.7,
};

export const presets: Record<string, MoonConfig> = {
  やさしい: { ...normal, timeLimit: 120, ballLife: 11, grip: 9, grabR: 1.1, flipperLength: 2.05 },
  ふつう: normal,
  むずかしい: { ...normal, timeLimit: 70, ballLife: 4.5, grip: 5, grabR: 0.8 },
};

export const DEFAULT_PRESET = 'ふつう';

/** 調整パネルの値 → シミュレーションの設定 */
export function toClaw(c: MoonConfig): ClawConfig {
  return {
    ...defaults, timeLimit: c.timeLimit, ballLife: c.ballLife, grip: c.grip, grabMax: c.grabMax, grabR: c.grabR, clawSpeed: c.clawSpeed, clawDown: c.clawDown,
    gravity: c.gravity, restitution: c.restitution, bombForce: c.bombForce, bombR: c.bombR, flipperSpeed: c.flipperSpeed, flipperLength: c.flipperLength,
  };
}
