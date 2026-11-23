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
  /** 星座の穴はブラックホールを寄せつけない：穴の縁からこの距離より内へは入れない（投げ入れるしかない） */
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
  bhSpeed: { label: '動く速さ', min: 2, max: 40, step: 0.5, folder: 'ブラックホール' },
  goalGuard: { label: '穴に近づけない距離', min: 0, max: 6, step: 0.1, folder: 'ブラックホール' },
  burstForce: { label: '解放の爆発の強さ', min: 2, max: 40, step: 0.5, folder: '解放' },
  burstRadius: { label: '解放が届く半径', min: 1, max: 10, step: 0.25, folder: '解放' },
  burstCooldown: { label: '解放の後、引力が戻るまで（秒）', min: 0, max: 3, step: 0.05, folder: '解放' },
  dilateRange: { label: '時間の遅れが始まる距離', min: 0, max: 5, step: 0.1, folder: '時間の遅れ' },
  dilateMin: { label: '地平のそばの時間の速さ', min: 0.1, max: 1, step: 0.05, folder: '時間の遅れ' },
  chainWindow: { label: '連鎖が続く時間（秒）', min: 0.2, max: 5, step: 0.1, folder: 'ルール' },
  timeLimit: { label: '制限時間（秒）', min: 20, max: 300, step: 5, folder: 'ルール', restart: true },
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
  goalGuard: 2.4,
  burstForce: 13,
  burstRadius: 4,
  burstCooldown: 0.8,
  dilateRange: 1.0,
  dilateMin: 0.35,
  chainWindow: 1.6,
  timeLimit: 90,
  gameSpeed: 1,
  shake: 1,
  particles: 1,
  bloom: true,
  volume: 0.7,
};

export const presets: Record<string, HorizonConfig> = {
  やさしい: { ...normal, horizon: 0.32, dilateMin: 0.25, dilateRange: 1.3, timeLimit: 150, gravity: 5, goalGuard: 1.8 },
  ふつう: normal,
  むずかしい: { ...normal, horizon: 0.6, dilateMin: 0.5, dilateRange: 0.8, timeLimit: 80, gravity: 7, burstCooldown: 1.1, goalGuard: 3 },
};

export const DEFAULT_PRESET = 'ふつう';
