import type { Schema } from '@engine/tuning';

/** Origami Cosmos の全パラメータ */
export interface OrigamiConfig {
  [k: string]: number | boolean;
  /** 爆風が届く距離（マス、チェビシェフ距離。重なった星は 0） */
  blast: number;
  /** 点火回数の上乗せ（ステージの最短手数に足す） */
  extraIgnitions: number;
  /** 1手に折れる回数の増減 */
  extraFolds: number;
  /** 折るアニメーションの秒数 */
  foldTime: number;
  /** 連鎖の1波の間隔（秒） */
  waveTime: number;
  shake: number;
  particles: number;
  bloom: boolean;
  volume: number;
}

export const schema: Schema<OrigamiConfig> = {
  blast: { label: '爆風が届く距離（マス）', min: 0, max: 3, step: 1, folder: 'ルール', restart: true },
  extraIgnitions: { label: '点火回数の上乗せ', min: 0, max: 5, step: 1, folder: 'ルール', restart: true },
  extraFolds: { label: '1手に折れる回数の増減', min: -2, max: 3, step: 1, folder: 'ルール', restart: true },
  foldTime: { label: '折る速さ（秒）', min: 0.05, max: 1.5, step: 0.05, folder: '演出' },
  waveTime: { label: '連鎖の間隔（秒）', min: 0.03, max: 0.6, step: 0.01, folder: '演出' },
  shake: { label: '画面揺れ', min: 0, max: 2, step: 0.05, folder: '演出' },
  particles: { label: 'パーティクル量', min: 0, max: 3, step: 0.1, folder: '演出' },
  bloom: { label: '発光（ブルーム）', folder: '演出' },
  volume: { label: '音量', min: 0, max: 1, step: 0.01, folder: '演出' },
};

const normal: OrigamiConfig = {
  blast: 1,
  extraIgnitions: 1,
  extraFolds: 0,
  foldTime: 0.35,
  waveTime: 0.14,
  shake: 1,
  particles: 1,
  bloom: true,
  volume: 0.7,
};

export const presets: Record<string, OrigamiConfig> = {
  やさしい: { ...normal, extraIgnitions: 2, extraFolds: 1 },
  ふつう: normal,
  むずかしい: { ...normal, extraIgnitions: 0 },
};

export const DEFAULT_PRESET = 'ふつう';
