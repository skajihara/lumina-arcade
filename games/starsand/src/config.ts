import type { Schema } from '@engine/tuning';

/** Starsand の全パラメータ */
export interface SandConfig {
  [k: string]: number | boolean;
  /** 引ける線の量の倍率（ステージの基準に掛ける） */
  inkScale: number;
  /** 線の太さ（半径、マス） */
  lineWidth: number;
  /** 注ぎ口から降る砂の量の倍率 */
  sandScale: number;
  /** 違う色の砂が触れて止まった時に混ざる確率（1ティックごと） */
  mixRate: number;
  /** 砂にかかる重力（マス/秒²）と、いちばん速い速さ（マス/秒） */
  gravity: number;
  maxSpeed: number;
  /** 線や壁に触れている砂の摩擦（0 でさらさら流れる） */
  friction: number;
  /** 1フレームに進めるティック数（砂の速さ） */
  speed: number;
  /** ひねり：0 なし／1 花火の雨（満ちた器の砂の一部が、花火の雨になって周りへ降る。ほかの器に入れば連鎖） */
  twist: number;
  /** 花火の雨になる砂の割合と、降る横の広さ（マス） */
  rainFrac: number;
  rainSpread: number;
  shake: number;
  particles: number;
  bloom: boolean;
  volume: number;
}

export const schema: Schema<SandConfig> = {
  inkScale: { label: 'インクの量（倍）', min: 0.3, max: 3, step: 0.05, folder: 'ルール', restart: true },
  lineWidth: { label: '線の太さ', min: 0, max: 3, step: 0.1, folder: 'ルール' },
  sandScale: { label: '砂の量（倍）', min: 0.3, max: 3, step: 0.05, folder: 'ルール', restart: true },
  mixRate: { label: '色が混ざる確率', min: 0, max: 1, step: 0.01, folder: 'ルール' },
  gravity: { label: '砂の重力', min: 100, max: 1200, step: 10, folder: 'ルール' },
  maxSpeed: { label: '砂のいちばん速い速さ', min: 30, max: 110, step: 1, folder: 'ルール' },
  friction: { label: '線や壁の摩擦（0でさらさら）', min: 0, max: 0.5, step: 0.01, folder: 'ルール' },
  speed: { label: '砂の速さ', min: 1, max: 6, step: 1, folder: '演出' },
  twist: { label: 'ひねり（0なし 1花火の雨）', min: 0, max: 1, step: 1, folder: 'ルール', restart: true },
  rainFrac: { label: '花火の雨になる砂の割合', min: 0, max: 1, step: 0.05, folder: 'ルール' },
  rainSpread: { label: '花火の雨が降る広さ', min: 5, max: 100, step: 1, folder: 'ルール' },
  shake: { label: '画面揺れ', min: 0, max: 2, step: 0.05, folder: '演出' },
  particles: { label: 'パーティクル量', min: 0, max: 3, step: 0.1, folder: '演出' },
  bloom: { label: '発光（ブルーム）', folder: '演出' },
  volume: { label: '音量', min: 0, max: 1, step: 0.01, folder: '演出' },
};

const normal: SandConfig = {
  inkScale: 1,
  lineWidth: 1,
  sandScale: 1,
  gravity: 420,
  maxSpeed: 60,
  friction: 0.03,
  mixRate: 0.5,
  speed: 2,
  twist: 1,
  rainFrac: 0.5,
  rainSpread: 45,
  shake: 1,
  particles: 1,
  bloom: true,
  volume: 0.7,
};

export const presets: Record<string, SandConfig> = {
  やさしい: { ...normal, inkScale: 1.6, sandScale: 1.4 },
  ふつう: normal,
  むずかしい: { ...normal, inkScale: 0.8, sandScale: 0.85 },
};

export const DEFAULT_PRESET = 'ふつう';
