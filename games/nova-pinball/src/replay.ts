/**
 * リプレイ：入力ビットの記録（ランレングス圧縮）と、記録した時の設定から、同じプレイを再現する。
 * シミュレーションが決定的なので、入力と設定だけで完全に同じ結果になる。
 * Echo Loop（過去のループを残響として再生する）の土台にもなる。
 */
import { InputRecorder } from '@engine/input';
import type { NovaConfig } from './config';
import type { StageDef } from './stages';
import { NovaSim } from './sim';

export interface ReplayData {
  v: 1;
  stage: string;
  cfg: NovaConfig;
  inputs: string;
  /** ベスト連鎖が始まったティック（ハイライト再生の目印） */
  highlight: number;
  bestChain: number;
  score: number;
  date: string;
}

/** 1回のプレイを記録する */
export class ReplayRecorder {
  readonly rec = new InputRecorder();
  private chainStart = 0;
  highlight = 0;
  bestChain = 0;
  /** プレイ中に「やり直しが必要な」設定変更があったら、リプレイは保存しない */
  dirty = false;
  readonly cfg: NovaConfig;

  constructor(cfg: NovaConfig) {
    this.cfg = { ...cfg };
  }

  /** sim.step(mask) の直前に呼ぶ */
  record(mask: number): void {
    this.rec.record(mask);
  }

  /** sim.step の後に呼ぶ（連鎖の始まりを覚える） */
  observe(sim: NovaSim): void {
    for (const e of sim.events) {
      if (e.t !== 'explode') continue;
      if (e.chain === 1) this.chainStart = sim.tick;
      if (e.chain > this.bestChain) {
        this.bestChain = e.chain;
        this.highlight = this.chainStart;
      }
    }
  }

  toData(sim: NovaSim): ReplayData {
    return {
      v: 1, stage: sim.stage.id, cfg: this.cfg, inputs: this.rec.serialize(),
      highlight: this.highlight, bestChain: this.bestChain, score: sim.score, date: new Date().toISOString(),
    };
  }
}

/** リプレイを再生する側。fromTick まで描画なしで早送りした sim を返す */
export class ReplayPlayer {
  readonly rec: InputRecorder;
  readonly sim: NovaSim;

  constructor(readonly data: ReplayData, stage: StageDef, fromTick = 0) {
    this.rec = InputRecorder.deserialize(data.inputs);
    this.sim = new NovaSim(stage, { ...data.cfg });
    while (this.sim.tick < fromTick && this.sim.phase === 'play' && this.sim.tick < this.rec.frames.length) {
      this.sim.step(this.rec.at(this.sim.tick));
    }
  }

  get done(): boolean {
    return this.sim.tick >= this.rec.frames.length;
  }

  /** 次の入力 */
  next(): number {
    return this.rec.at(this.sim.tick);
  }
}
