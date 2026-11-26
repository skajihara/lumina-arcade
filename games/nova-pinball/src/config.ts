import type { Schema } from '@engine/tuning';

/** Nova Pinball の全パラメータ。調整パネルとプリセットはここから作られる */
export interface NovaConfig {
  [k: string]: number | boolean;
  gravity: number;
  flipperSpeed: number;
  flipperTorque: number;
  flipperLength: number;
  /** 下の左右のしかけ（NP-18）：0 スリングショット（前）／1 月のバンパー */
  slingMode: number;
  /** 月のバンパー：満月の時の弾く速さ・満ち欠けの周期（秒） */
  moonKick: number;
  moonPeriod: number;
  /** 満月の光（NP-18b）：満月の時に月へ当てると、一番近い灯っていない星へ光が飛んでチャージ +1（0 で無し） */
  moonCharge: number;
  /** エンドレスで波ごとにアイテムを1つ置く（NP-11c。0 で無し） */
  endlessItems: number;
  /** 盤の上のボールの上限（分裂アイテムで増やせる数） */
  maxBalls: number;
  /** 盤面の下の方（下 3 割）で引力を何倍にするか（NP-17。1 で弱めない） */
  lowPull: number;
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
  /** 星座の線を伝って火が走る速さ（マス/秒）。0 で線は連鎖を運ばない */
  fuseSpeed: number;
  looseHitSpeed: number;
  slowmoAt: number;
  gameSpeed: number;
  shake: number;
  particles: number;
  bloom: boolean;
  /** 狙いの線（NP-15）：ボールがフリッパーの上にある時、今弾いたらどこへ飛ぶかを点線で見せる（0 なし／1 あり） */
  aimLine: number;
  twist: number;
  /** ひねり3（爆発の引力）：引力の続く秒数・強さ（重力の何倍）・届く距離（m）・渦の強さ（引く力に対する横向きの割合） */
  /** 星の引力：生きている星がいつもボールを引く強さ（重力の倍。灯った星・大きい星ほど強い。0 で無し） */
  starPull: number;
  /** 星の引力が届く距離（m） */
  starRange: number;
  wellSec: number;
  wellPull: number;
  wellRange: number;
  wellSwirl: number;
  volume: number;
}

export const schema: Schema<NovaConfig> = {
  gravity: { label: '重力', min: 5, max: 40, step: 0.5, folder: '盤面' },
  flipperSpeed: { label: 'フリッパー速度', min: 8, max: 40, step: 0.5, folder: '盤面' },
  flipperTorque: { label: 'フリッパーの力', min: 200, max: 6000, step: 50, folder: '盤面' },
  flipperLength: { label: 'フリッパーの長さ', min: 1.6, max: 2.8, step: 0.05, folder: '盤面', restart: true },
  slingMode: { label: '下の左右（0スリングショット／1月のバンパー）', min: 0, max: 1, step: 1, folder: '盤面', restart: true },
  moonKick: { label: '月のバンパー：満月の時の強さ', min: 4, max: 30, step: 0.5, folder: '盤面' },
  moonCharge: { label: '満月の光：満月で当てると近くの星を1つ灯す（0/1）', min: 0, max: 1, step: 1, folder: '盤面' },
  endlessItems: { label: 'エンドレス：波ごとにアイテム（0/1）', min: 0, max: 1, step: 1, folder: 'ルール' },
  maxBalls: { label: '盤の上のボールの上限（分裂）', min: 1, max: 6, step: 1, folder: 'ルール' },
  moonPeriod: { label: '月の満ち欠けの周期（秒）', min: 1, max: 20, step: 0.5, folder: '盤面' },
  lowPull: { label: '盤面の下の方の引力（倍）', min: 0, max: 1, step: 0.05, folder: '盤面' },
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
  fuseSpeed: { label: '星座の線を走る火の速さ（0で無し）', min: 0, max: 30, step: 0.5, folder: '爆発' },
  looseHitSpeed: { label: '浮遊星の衝突でチャージする速さ', min: 1, max: 20, step: 0.5, folder: '爆発' },
  slowmoAt: { label: 'スローになる連鎖数', min: 2, max: 20, step: 1, folder: '演出' },
  gameSpeed: { label: 'ゲーム速度', min: 0.3, max: 1.5, step: 0.05, folder: '演出' },
  shake: { label: '画面揺れ', min: 0, max: 2, step: 0.05, folder: '演出' },
  particles: { label: 'パーティクル量', min: 0, max: 3, step: 0.1, folder: '演出' },
  bloom: { label: '発光（ブルーム）', folder: '演出' },
  aimLine: { label: '狙いの線（0なし／1あり）', min: 0, max: 1, step: 1, folder: 'ルール' },
  twist: { label: 'ひねり（0なし 1同色連鎖 2押せる星 3爆発の引力）', min: 0, max: 3, step: 1, folder: 'ルール', restart: true },
  starPull: { label: '星の引力（重力の倍、0で無し）', min: 0, max: 4, step: 0.05, folder: 'ルール' },
  starRange: { label: '星の引力が届く距離', min: 1, max: 12, step: 0.5, folder: 'ルール' },
  wellSec: { label: '爆発の引力が続く秒数', min: 0.1, max: 2, step: 0.05, folder: 'ルール' },
  wellPull: { label: '爆発の引力の強さ（重力の倍）', min: 0, max: 4, step: 0.05, folder: 'ルール' },
  wellRange: { label: '爆発の引力が届く距離', min: 1, max: 15, step: 0.5, folder: 'ルール' },
  wellSwirl: { label: '爆発の引力の渦（横向きの割合）', min: 0, max: 1.5, step: 0.05, folder: 'ルール' },
  volume: { label: '音量', min: 0, max: 1, step: 0.01, folder: '演出' },
};

const normal: NovaConfig = {
  gravity: 21,
  flipperSpeed: 24,
  flipperTorque: 2600,
  flipperLength: 2.2,
  lowPull: 0.4,
  slingMode: 1,
  moonKick: 16,
  moonPeriod: 6,
  moonCharge: 1,
  endlessItems: 1,
  maxBalls: 4,
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
  fuseSpeed: 9,
  looseHitSpeed: 6,
  slowmoAt: 5,
  gameSpeed: 1,
  shake: 1,
  particles: 1,
  bloom: true,
  aimLine: 1,
  twist: 3,
  starPull: 2.5,
  starRange: 6,
  wellSec: 1.3,
  wellPull: 3,
  wellRange: 9,
  wellSwirl: 0.35,
  volume: 0.7,
};

export const presets: Record<string, NovaConfig> = {
  やさしい: { ...normal, gravity: 17, balls: 5, ballSave: 8, decayTime: 10, blastRadius: 3.0, flipperLength: 2.35, gameSpeed: 0.9 },
  ふつう: normal,
  むずかしい: { ...normal, flipperLength: 2.1, gravity: 22, balls: 3, ballSave: 0, decayTime: 4.5, decayFloor: 0, blastRadius: 2.4 },
};

export const DEFAULT_PRESET = 'ふつう';
