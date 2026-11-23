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
  /** 斜めにも行けない砂が横へ滑る確率 */
  slide: number;
  /** 1フレームに進めるティック数（砂の速さ） */
  speed: number;
  shake: number;
  particles: number;
  bloom: boolean;
  volume: number;
}

export const schema: Schema<SandConfig> = {
  inkScale: { label: 'インクの量（倍）', min: 0.3, max: 3, step: 0.05, folder: 'ルール', restart: true },
  lineWidth: { label: '線の太さ', min: 0, max: 3, step: 1, folder: 'ルール' },
  sandScale: { label: '砂の量（倍）', min: 0.3, max: 3, step: 0.05, folder: 'ルール', restart: true },
  slide: { label: '砂が横へ滑る確率', min: 0, max: 1, step: 0.05, folder: 'ルール' },
  speed: { label: '砂の速さ', min: 1, max: 6, step: 1, folder: '演出' },
  shake: { label: '画面揺れ', min: 0, max: 2, step: 0.05, folder: '演出' },
  particles: { label: 'パーティクル量', min: 0, max: 3, step: 0.1, folder: '演出' },
  bloom: { label: '発光（ブルーム）', folder: '演出' },
  volume: { label: '音量', min: 0, max: 1, step: 0.01, folder: '演出' },
};

const normal: SandConfig = {
  inkScale: 1,
  lineWidth: 1,
  sandScale: 1,
  slide: 0.6,
  speed: 2,
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
