import type { Schema } from '@engine/tuning';
import { defaults, type ChronoConfig } from './sim';

/** 時空の絵筆の全パラメータ（ステージごとの風・星の数・インクは stages の方で上書きされる） */
export interface BrushConfig {
  [k: string]: number | boolean;
  /** インクの量の倍率（難易度） */
  inkScale: number;
  /** 遅い時間・速い時間・逆再生の速さ（倍） */
  slow: number;
  fast: number;
  rewind: number;
  gravity: number;
  /** 塗った時間が消えるまでの秒（0 で消えない） */
  zoneLife: number;
  basketW: number;
  basketSpeed: number;
  gameSpeed: number;
  shake: number;
  particles: number;
  bloom: boolean;
  volume: number;
}

export const schema: Schema<BrushConfig> = {
  inkScale: { label: 'インクの量（倍）', min: 0.3, max: 3, step: 0.05, folder: 'ルール', restart: true },
  slow: { label: '遅い時間の速さ（倍）', min: 0.05, max: 0.9, step: 0.05, folder: 'ルール' },
  fast: { label: '速い時間の速さ（倍）', min: 1.1, max: 4, step: 0.1, folder: 'ルール' },
  rewind: { label: '逆再生の速さ（倍）', min: -2, max: -0.1, step: 0.05, folder: 'ルール' },
  gravity: { label: '重力', min: 100, max: 900, step: 10, folder: '世界' },
  zoneLife: { label: '塗った時間が消えるまで（秒、0で消えない）', min: 0, max: 20, step: 0.5, folder: 'ルール' },
  basketW: { label: '籠の幅', min: 60, max: 240, step: 5, folder: '世界' },
  basketSpeed: { label: '籠の揺れる速さ', min: 0.1, max: 2, step: 0.05, folder: '世界' },
  gameSpeed: { label: 'ゲーム速度', min: 0.3, max: 1.5, step: 0.05, folder: '演出' },
  shake: { label: '画面揺れ', min: 0, max: 2, step: 0.05, folder: '演出' },
  particles: { label: 'パーティクル量', min: 0, max: 3, step: 0.1, folder: '演出' },
  bloom: { label: '発光（ブルーム）', folder: '演出' },
  volume: { label: '音量', min: 0, max: 1, step: 0.01, folder: '演出' },
};

const normal: BrushConfig = {
  inkScale: 1,
  slow: defaults.slow,
  fast: defaults.fast,
  rewind: defaults.rewind,
  gravity: defaults.gravity,
  zoneLife: defaults.zoneLife,
  basketW: defaults.basketW,
  basketSpeed: defaults.basketSpeed,
  gameSpeed: 1,
  shake: 1,
  particles: 1,
  bloom: true,
  volume: 0.7,
};

export const presets: Record<string, BrushConfig> = {
  やさしい: { ...normal, inkScale: 1.5, basketW: 150, zoneLife: 9 },
  ふつう: normal,
  むずかしい: { ...normal, inkScale: 0.8, basketW: 105, zoneLife: 5.5 },
};

export const DEFAULT_PRESET = 'ふつう';

/** 調整パネルの値 → シミュレーションの設定 */
export function toChrono(c: BrushConfig): ChronoConfig {
  return { ...defaults, inkScale: c.inkScale, slow: c.slow, fast: c.fast, rewind: c.rewind, gravity: c.gravity, zoneLife: c.zoneLife, basketW: c.basketW, basketSpeed: c.basketSpeed };
}
