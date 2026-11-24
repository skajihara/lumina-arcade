import type { Schema } from '@engine/tuning';
import { schema as novaSchema, presets as novaPresets, type NovaConfig } from '../../nova-pinball/src/config';

/** Echo Loop の全パラメータ。盤面・爆発は Nova Pinball と共通で、ループの設定を足す */
export interface EchoConfig extends NovaConfig {
  loopSec: number;
  maxLoops: number;
  /** 残響どうしがぶつかるか（0/1）。今のボールと残響は常にぶつかる */
  echoCollide: number;
  /** ひねり「共鳴」：違うループの自分が、この秒数以内に同じ星へ当てるとすぐ爆発（0 で無し） */
  resonance: number;
  /** 共鳴した星の爆風の大きさ（倍） */
  resonanceBlast: number;
}

// ループの項目を先に（調整パネルで上に出る）
export const schema = Object.assign({
  loopSec: { label: '1ループの秒数', min: 5, max: 20, step: 0.5, folder: 'ループ', restart: true },
  maxLoops: { label: '最大ループ数', min: 2, max: 12, step: 1, folder: 'ループ', restart: true },
  echoCollide: { label: '残響どうしがぶつかる（0/1）', min: 0, max: 1, step: 1, folder: 'ループ', restart: true },
  resonance: { label: '共鳴：同時とみなす秒数（0で無し）', min: 0, max: 1.5, step: 0.05, folder: 'ループ' },
  resonanceBlast: { label: '共鳴の爆風の大きさ（倍）', min: 1, max: 3, step: 0.05, folder: 'ループ' },
}, novaSchema) as Schema<EchoConfig>;

const base = (p: NovaConfig): EchoConfig => ({
  ...p,
  // 1ループが短いので、チャージは時間で減らさない（ループごとに全部戻る）
  decayFloor: 6,
  // 10秒で群れを1つ落とせるよう、2回当てると爆発し、爆風は近くの星を必ず巻き込む
  maxCharge: 2,
  blastCharge: 2,
  ballSave: 0,
  balls: 1,
  twist: 0,
  // Nova の「星の引力」は使わない（残響の動きを読みやすく保つ）
  starPull: 0,
  // 星座の線は連鎖を運ばない（群れごとに別のループで落とす遊びを保つ）
  fuseSpeed: 0,
  loopSec: 10,
  maxLoops: 6,
  echoCollide: 0,
  resonance: 0.4,
  resonanceBlast: 1.6,
});

export const presets: Record<string, EchoConfig> = {
  やさしい: { ...base(novaPresets['やさしい']), maxLoops: 8, loopSec: 11 },
  ふつう: base(novaPresets['ふつう']),
  むずかしい: { ...base(novaPresets['むずかしい']), maxLoops: 6, loopSec: 9.5, blastRadius: 2.6 },
};

export const DEFAULT_PRESET = 'ふつう';
