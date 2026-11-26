import type { Schema } from '@engine/tuning';

/** Event Horizon の全パラメータ */
export interface HorizonConfig {
  [k: string]: number | boolean;
  /** 下向きの重力（ふつうの重力。弱め） */
  gravity: number;
  /** ブラックホールの引力の強さ */
  bhPull: number;
  /** 引力が届く半径 */
  bhReach: number;
  /** 周回の輪の半径：近くまで来たかけらは、この半径の輪に乗って回る */
  ringR: number;
  /** 輪へ引き戻す強さ（ばね） */
  ringK: number;
  /** 輪の上で、近づく・離れる向きの速さを弱める強さ */
  ringDamp: number;
  /** 輪の上で回る速さ */
  orbitSpeed: number;
  /** 事象の地平（これより内側に入った物体は吸い込まれて消える） */
  horizon: number;
  /** ブラックホールが動く最高速度（マス/秒） */
  bhSpeed: number;
  /** 1 でカーソルの真下にぴったり付く（0 で bhSpeed の速さで追いかける） */
  follow: number;
  /** 引く操作：0 押している間だけ／1 クリックで切り替え */
  pullToggle: number;
  /** 星座の穴の上では引力が切れる：穴の縁からこの距離より内では引けない（投げ入れるしかない） */
  goalGuard: number;
  /** ホワイトホール（解放）の爆発の強さ */
  burstForce: number;
  /** 解放が届く半径 */
  burstRadius: number;
  /** 解放の後、引力が戻るまで（秒） */
  burstCooldown: number;
  /** 時間の遅れが始まる距離（地平からこの距離まで） */
  dilateRange: number;
  /** 地平のすぐそばでの時間の速さ（1 で遅れなし） */
  dilateMin: number;
  /** 連鎖が続く時間（秒）：この間に次の星が穴へ入れば連鎖 */
  chainWindow: number;
  /** 制限時間（秒） */
  timeLimit: number;
  /** 必要なかけらを減らす数（必要数が4以上の面だけ。やさしい用） */
  needEase: number;
  /** ひねり：0 なし／1 吐き出し（吸い込んだかけらを抱え、解放で吐き出す）／2 穴の重力（かけらを入れた穴が近くのかけらを引く）／3 両方 */
  twist: number;
  /** ひねり1：吸い込んだかけらを抱えていられる時間（秒）。過ぎると蒸発して失われる */
  holdSec: number;
  /** ひねり2：穴の重力が届く距離（穴の縁から）と強さ */
  goalPullR: number;
  goalPull: number;
  gameSpeed: number;
  shake: number;
  particles: number;
  bloom: boolean;
  volume: number;
}

export const schema: Schema<HorizonConfig> = {
  gravity: { label: '重力', min: 0, max: 20, step: 0.5, folder: '世界' },
  bhPull: { label: 'ブラックホールの引力', min: 10, max: 300, step: 5, folder: 'ブラックホール' },
  bhReach: { label: '引力が届く半径', min: 2, max: 12, step: 0.25, folder: 'ブラックホール' },
  ringR: { label: '周回の輪の半径', min: 0.8, max: 3, step: 0.05, folder: '周回' },
  ringK: { label: '輪へ引き戻す強さ', min: 0, max: 60, step: 1, folder: '周回' },
  ringDamp: { label: '輪の上の減衰', min: 0, max: 15, step: 0.1, folder: '周回' },
  orbitSpeed: { label: '輪の上で回る速さ', min: 0, max: 15, step: 0.1, folder: '周回' },
  horizon: { label: '事象の地平の大きさ', min: 0.1, max: 1.5, step: 0.05, folder: 'ブラックホール' },
  bhSpeed: { label: '動く速さ（追いかける時）', min: 2, max: 40, step: 0.5, folder: 'ブラックホール' },
  follow: { label: 'カーソルにぴったり付く（0で追いかける）', min: 0, max: 1, step: 1, folder: 'ブラックホール' },
  pullToggle: { label: '引く操作（0押している間／1クリックで切替）', min: 0, max: 1, step: 1, folder: 'ブラックホール' },
  goalGuard: { label: '穴の上で引力が切れる距離', min: 0, max: 6, step: 0.1, folder: 'ブラックホール' },
  burstForce: { label: '解放の爆発の強さ', min: 2, max: 40, step: 0.5, folder: '解放' },
  burstRadius: { label: '解放が届く半径', min: 1, max: 10, step: 0.25, folder: '解放' },
  burstCooldown: { label: '解放の後、引力が戻るまで（秒）', min: 0, max: 3, step: 0.05, folder: '解放' },
  dilateRange: { label: '時間の遅れが始まる距離', min: 0, max: 5, step: 0.1, folder: '時間の遅れ' },
  dilateMin: { label: '地平のそばの時間の速さ', min: 0.1, max: 1, step: 0.05, folder: '時間の遅れ' },
  chainWindow: { label: '連鎖が続く時間（秒）', min: 0.2, max: 5, step: 0.1, folder: 'ルール' },
  timeLimit: { label: '制限時間（秒）', min: 20, max: 300, step: 5, folder: 'ルール', restart: true },
  needEase: { label: '必要なかけらを減らす（4個以上の面）', min: 0, max: 2, step: 1, folder: 'ルール', restart: true },
  twist: { label: 'ひねり（0なし 1吐き出し 2穴の重力 3両方）', min: 0, max: 3, step: 1, folder: 'ルール', restart: true },
  holdSec: { label: '吸い込んだかけらを抱えられる秒数', min: 0.5, max: 10, step: 0.5, folder: 'ルール' },
  goalPullR: { label: '穴の重力が届く距離', min: 0, max: 5, step: 0.1, folder: 'ルール' },
  goalPull: { label: '穴の重力の強さ', min: 0, max: 60, step: 1, folder: 'ルール' },
  gameSpeed: { label: 'ゲーム速度', min: 0.3, max: 1.5, step: 0.05, folder: '演出' },
  shake: { label: '画面揺れ', min: 0, max: 2, step: 0.05, folder: '演出' },
  particles: { label: 'パーティクル量', min: 0, max: 3, step: 0.1, folder: '演出' },
  bloom: { label: '発光（ブルーム）', folder: '演出' },
  volume: { label: '音量', min: 0, max: 1, step: 0.01, folder: '演出' },
};

const normal: HorizonConfig = {
  gravity: 6,
  bhPull: 90,
  bhReach: 6,
  ringR: 1.7,
  ringK: 30,
  ringDamp: 5,
  orbitSpeed: 5,
  horizon: 0.45,
  bhSpeed: 14,
  follow: 1,
  pullToggle: 0,
  goalGuard: 1.9,
  burstForce: 13,
  burstRadius: 4,
  burstCooldown: 0.8,
  dilateRange: 1.0,
  dilateMin: 0.35,
  chainWindow: 1.6,
  timeLimit: 90,
  needEase: 0,
  twist: 1,
  holdSec: 4,
  goalPullR: 2.2,
  goalPull: 18,
  gameSpeed: 1,
  shake: 1,
  particles: 1,
  bloom: true,
  volume: 0.7,
};

export const presets: Record<string, HorizonConfig> = {
  やさしい: { ...normal, horizon: 0.32, dilateMin: 0.25, dilateRange: 1.3, timeLimit: 150, gravity: 5, goalGuard: 1.5, needEase: 1 },
  ふつう: normal,
  むずかしい: { ...normal, horizon: 0.6, dilateMin: 0.5, dilateRange: 0.8, timeLimit: 80, gravity: 7, burstCooldown: 1.1, goalGuard: 2.4, holdSec: 2.5 },
};

export const DEFAULT_PRESET = 'ふつう';
