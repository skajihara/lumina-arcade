import type { Schema } from '@engine/tuning';
import { schema as novaSchema, presets as novaPresets, type NovaConfig } from '../../nova-pinball/src/config';

/** Echo Loop の全パラメータ。盤面・爆発は Nova Pinball と共通で、ループの設定を足す */
export interface EchoConfig extends NovaConfig {
  loopSec: number;
  maxLoops: number;
  /** 残響どうしがぶつかるか（0/1）。今のボールと残響は常にぶつかる */
  echoCollide: number;
}

// ループの項目を先に（調整パネルで上に出る）
export const schema = Object.assign({
  loopSec: { label: '1ループの秒数', min: 5, max: 20, step: 0.5, folder: 'ループ', restart: true },
  maxLoops: { label: '最大ループ数', min: 2, max: 12, step: 1, folder: 'ループ', restart: true },
  echoCollide: { label: '残響どうしがぶつかる（0/1）', min: 0, max: 1, step: 1, folder: 'ループ', restart: true },
}, novaSchema) as Schema<EchoConfig>;

const base = (p: NovaConfig): EchoConfig => ({
  ...p,
  // 1ループが短いので、チャージは時間で減らさない（ループごとに全部戻る）
  decayFloor: 6,
  ballSave: 0,
  balls: 1,
  twist: 0,
  loopSec: 10,
  maxLoops: 6,
  echoCollide: 0,
});

export const presets: Record<string, EchoConfig> = {
  やさしい: { ...base(novaPresets['やさしい']), maxLoops: 8, loopSec: 11 },
  ふつう: base(novaPresets['ふつう']),
  むずかしい: { ...base(novaPresets['むずかしい']), maxLoops: 5, loopSec: 9 },
};

export const DEFAULT_PRESET = 'ふつう';
