import type { Schema } from '@engine/tuning';

/** Nova Pinball の全パラメータ。調整パネルとプリセットはここから作られる */
export interface NovaConfig {
  [k: string]: number | boolean;
  gravity: number;
  flipperSpeed: number;
  flipperTorque: number;
  flipperLength: number;
  ballRestitution: number;
  popKick: number;
  slingKick: number;
  rolloverSave: number;
  kickbackStart: number;
  launchMin: number;
  launchMax: number;
  balls: number;
  ballSave: number;
  maxCharge: number;
  blastRadius: number;
  blastCharge: number;
  blastForce: number;
  chainDelay: number;
  decayTime: number;
  decayFloor: number;
  chainWindow: number;
  looseHitSpeed: number;
  slowmoAt: number;
  gameSpeed: number;
  shake: number;
  particles: number;
  bloom: boolean;
  volume: number;
}

export const schema: Schema<NovaConfig> = {
  gravity: { label: '重力', min: 5, max: 40, step: 0.5, folder: '盤面' },
  flipperSpeed: { label: 'フリッパー速度', min: 8, max: 40, step: 0.5, folder: '盤面' },
  flipperTorque: { label: 'フリッパーの力', min: 200, max: 6000, step: 50, folder: '盤面' },
  flipperLength: { label: 'フリッパーの長さ', min: 1.6, max: 2.8, step: 0.05, folder: '盤面', restart: true },
  ballRestitution: { label: 'ボールの弾み', min: 0, max: 0.95, step: 0.01, folder: '盤面' },
  popKick: { label: '星に当たった時の弾き', min: 0, max: 12, step: 0.1, folder: '盤面' },
  slingKick: { label: 'スリングショットの弾き', min: 0, max: 20, step: 0.5, folder: '盤面' },
  kickbackStart: { label: '最初からキックバックが灯る（0/1）', min: 0, max: 1, step: 1, folder: 'ルール' },
  rolloverSave: { label: 'ロールオーバー達成のボールセーブ（秒）', min: 0, max: 20, step: 0.5, folder: 'ルール' },
  launchMin: { label: '発射の最低速度', min: 10, max: 40, step: 0.5, folder: '盤面' },
  launchMax: { label: '発射の最高速度', min: 15, max: 50, step: 0.5, folder: '盤面' },
  balls: { label: 'ボール数', min: 1, max: 9, step: 1, folder: 'ルール', restart: true },
  ballSave: { label: 'ボールセーブ（秒）', min: 0, max: 20, step: 0.5, folder: 'ルール' },
  maxCharge: { label: '爆発までのチャージ', min: 1, max: 6, step: 1, folder: 'ルール' },
  decayTime: { label: 'チャージが減るまで（秒）', min: 1, max: 30, step: 0.5, folder: 'ルール' },
  decayFloor: { label: '時間で減らないチャージ（灯り）', min: 0, max: 3, step: 1, folder: 'ルール' },
  blastRadius: { label: '爆発の半径', min: 1, max: 6, step: 0.05, folder: '爆発' },
  blastCharge: { label: '爆発で増えるチャージ', min: 0, max: 4, step: 1, folder: '爆発' },
  blastForce: { label: '爆風の強さ', min: 0, max: 40, step: 0.5, folder: '爆発' },
  chainDelay: { label: '連鎖の間隔（秒）', min: 0, max: 0.6, step: 0.01, folder: '爆発' },
  chainWindow: { label: '連鎖が切れるまで（秒）', min: 0.3, max: 4, step: 0.05, folder: '爆発' },
  looseHitSpeed: { label: '浮遊星の衝突でチャージする速さ', min: 1, max: 20, step: 0.5, folder: '爆発' },
  slowmoAt: { label: 'スローになる連鎖数', min: 2, max: 20, step: 1, folder: '演出' },
  gameSpeed: { label: 'ゲーム速度', min: 0.3, max: 1.5, step: 0.05, folder: '演出' },
  shake: { label: '画面揺れ', min: 0, max: 2, step: 0.05, folder: '演出' },
  particles: { label: 'パーティクル量', min: 0, max: 3, step: 0.1, folder: '演出' },
  bloom: { label: '発光（ブルーム）', folder: '演出' },
  volume: { label: '音量', min: 0, max: 1, step: 0.01, folder: '演出' },
};

const normal: NovaConfig = {
  gravity: 21,
  flipperSpeed: 24,
  flipperTorque: 2600,
  flipperLength: 2.0,
  ballRestitution: 0.45,
  popKick: 4.5,
  slingKick: 9,
  rolloverSave: 6,
  kickbackStart: 1,
  launchMin: 24,
  launchMax: 34,
  balls: 3,
  ballSave: 2,
  maxCharge: 3,
  decayTime: 5,
  decayFloor: 1,
  blastRadius: 2.6,
  blastCharge: 2,
  blastForce: 14,
  chainDelay: 0.12,
  chainWindow: 1.2,
  looseHitSpeed: 6,
  slowmoAt: 5,
  gameSpeed: 1,
  shake: 1,
  particles: 1,
  bloom: true,
  volume: 0.7,
};

export const presets: Record<string, NovaConfig> = {
  やさしい: { ...normal, gravity: 17, balls: 5, ballSave: 8, decayTime: 10, blastRadius: 3.0, flipperLength: 2.3, gameSpeed: 0.9 },
  ふつう: normal,
  むずかしい: { ...normal, gravity: 22, balls: 3, ballSave: 0, decayTime: 4.5, decayFloor: 0, blastRadius: 2.4 },
};

export const DEFAULT_PRESET = 'ふつう';
