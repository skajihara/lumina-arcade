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
  /** 時計の針（EL-12）：0 なし／1 あり。長さの倍率・1ループで何周するか・弾む強さ */
  hand: number;
  handLen: number;
  handTurns: number;
  handBounce: number;
  /**
   * ひねり（EL-09）：0 なし／1 縮む時間（残響が1人増えるごとにループが shrinkSec 秒短くなる。共鳴で regainSec 秒取り戻す）／
   * 2 影（残響の連鎖で壊れた星は shadowSec 秒後に戻る。今の自分の連鎖で壊した星は戻らない）
   */
  echoTwist: number;
  shrinkSec: number;
  minLoopSec: number;
  regainSec: number;
  shadowSec: number;
  /** 発射してからこの秒数（と発射の通り道の中）は、今のボールと残響がぶつからない */
  launchGrace: number;
}

// ループの項目を先に（調整パネルで上に出る）
export const schema = Object.assign({
  loopSec: { label: '1ループの秒数', min: 5, max: 20, step: 0.5, folder: 'ループ', restart: true },
  maxLoops: { label: '最大ループ数', min: 2, max: 12, step: 1, folder: 'ループ', restart: true },
  echoCollide: { label: '残響どうしがぶつかる（0/1）', min: 0, max: 1, step: 1, folder: 'ループ', restart: true },
  resonance: { label: '共鳴：同時とみなす秒数（0で無し）', min: 0, max: 1.5, step: 0.05, folder: 'ループ' },
  resonanceBlast: { label: '共鳴の爆風の大きさ（倍）', min: 1, max: 3, step: 0.05, folder: 'ループ' },
  hand: { label: '時計の針（0なし／1あり）', min: 0, max: 1, step: 1, folder: 'ループ', restart: true },
  handLen: { label: '針の長さ（倍）', min: 0.3, max: 1.5, step: 0.05, folder: 'ループ', restart: true },
  handTurns: { label: '針が1ループで回る数', min: 0.5, max: 4, step: 0.5, folder: 'ループ', restart: true },
  handBounce: { label: '針の弾み', min: 0, max: 1.2, step: 0.05, folder: 'ループ', restart: true },
  echoTwist: { label: 'ひねり（0なし／1縮む時間／2影）', min: 0, max: 2, step: 1, folder: 'ループ', restart: true },
  shrinkSec: { label: '縮む時間：残響1人ごとに短くなる秒', min: 0, max: 3, step: 0.1, folder: 'ループ', restart: true },
  minLoopSec: { label: '縮む時間：いちばん短いループの秒', min: 3, max: 15, step: 0.5, folder: 'ループ', restart: true },
  regainSec: { label: '縮む時間：共鳴で取り戻す秒', min: 0, max: 3, step: 0.1, folder: 'ループ' },
  shadowSec: { label: '影：残響が壊した星が戻るまでの秒', min: 0.5, max: 8, step: 0.1, folder: 'ループ' },
  launchGrace: { label: '発射したての球は残響とぶつからない秒数', min: 0, max: 3, step: 0.1, folder: 'ループ' },
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
  // フリッパーは Nova の NP-17（長く）の前の長さのまま（Echo の難しさはループ数で決めている）
  flipperLength: 2.0,
  // Nova の「星の引力」は使わない（残響の動きを読みやすく保つ）
  starPull: 0,
  // 星座の線は連鎖を運ばない（群れごとに別のループで落とす遊びを保つ）
  fuseSpeed: 0,
  loopSec: 10,
  maxLoops: 4,
  echoCollide: 0,
  resonance: 0.4,
  resonanceBlast: 1.6,
  launchGrace: 1,
  echoTwist: 1,
  shrinkSec: 1,
  minLoopSec: 6,
  regainSec: 1,
  shadowSec: 3.5,
  hand: 1,
  handLen: 1,
  handTurns: 1,
  handBounce: 0.6,
});

export const presets: Record<string, EchoConfig> = {
  やさしい: { ...base(novaPresets['やさしい']), flipperLength: 2.3, maxLoops: 7, loopSec: 11, shrinkSec: 0.6, minLoopSec: 7 },
  ふつう: base(novaPresets['ふつう']),
  むずかしい: { ...base(novaPresets['むずかしい']), maxLoops: 5, loopSec: 9.5, blastRadius: 2.6 },
};

export const DEFAULT_PRESET = 'ふつう';
